import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { TaskSyncFlushResultV1 } from "../../contracts/task-sync-status.js";
import { TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION } from "../../contracts/task-sync-status.js";
import { CanonicalEventOutboxPublisher } from "../../modules/task-engine/persistence/canonical-event-outbox-publisher.js";
import {
  openCanonicalEventOutboxRuntime,
  type CanonicalEventOutboxRuntime
} from "../../modules/task-engine/persistence/canonical-event-outbox-runtime.js";
import {
  isGitTaskStateCanonicalAuthority,
  readCanonicalPublishQueueConfig
} from "../../modules/task-engine/persistence/task-state-canonical-authority.js";
import { runApplyTaskStateEvents } from "../../modules/task-engine/persistence/apply-task-state-events-runtime.js";
import { runTaskStateHydrate } from "../../modules/task-engine/persistence/task-state-hydrate-runtime.js";
import { runTaskStateStatus } from "../../modules/task-engine/persistence/task-state-status-runtime.js";
import { flushTaskSyncOutbox } from "./task-sync-handlers.js";

const SERVICE_SYNC_POLICY_APPROVAL = {
  confirmed: true as const,
  rationale: "dashboard-service background task-state sync (workflow-cannon)"
};

export type DashboardTaskSyncWorkerPosture = "stopped" | "running" | "paused";

export type DashboardTaskSyncWorkerStatus = {
  posture: DashboardTaskSyncWorkerPosture;
  outboxPolling: boolean;
  hydrateIntervalMs: number;
  lastHydrateCycleAt: string | null;
  lastHydrateAction: "none" | "hydrated" | "applied" | "skipped" | "error";
  lastHydrateCode: string | null;
};

type SetIntervalFn = (handler: () => void, timeoutMs: number) => NodeJS.Timeout;
type ClearIntervalFn = (handle: NodeJS.Timeout) => void;

export type DashboardTaskSyncWorkerOptions = {
  ctx: ModuleLifecycleContext;
  hydrateIntervalMs?: number;
  debounceMs?: number;
  setIntervalFn?: SetIntervalFn;
  clearIntervalFn?: ClearIntervalFn;
  /** Test hook: skip opening long-lived outbox (hydrate-only). */
  skipOutboxPublisher?: boolean;
};

function readPositiveInt(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const value = Math.trunc(raw);
  return value > 0 ? value : fallback;
}

export function readDashboardTaskSyncWorkerConfig(
  config?: Record<string, unknown> | null
): { enabled: boolean; hydrateIntervalMs: number } {
  const dashboardService = config?.dashboardService as Record<string, unknown> | undefined;
  const taskSync = dashboardService?.taskSync as Record<string, unknown> | undefined;
  const enabled = taskSync?.enabled !== false;
  const hydrateIntervalMs = readPositiveInt(taskSync?.hydrateIntervalMs, 300_000);
  return { enabled, hydrateIntervalMs };
}

function cycleResultToFlush(cycle: Awaited<ReturnType<CanonicalEventOutboxPublisher["runCycle"]>>): TaskSyncFlushResultV1 {
  const generatedAt = new Date().toISOString();
  const ok =
    cycle.publishedCount > 0 ||
    (cycle.enabled && cycle.pendingRowsFetched === 0 && cycle.publishCode === null);
  const code =
    cycle.publishCode ??
    (cycle.publishedCount > 0
      ? "task-sync-flushed"
      : cycle.enabled
        ? "task-sync-nothing-to-flush"
        : "task-sync-flush-disabled");
  return {
    schemaVersion: TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION,
    generatedAt,
    ok,
    code,
    enabled: cycle.enabled,
    publishedCount: cycle.publishedCount,
    conflictCount: cycle.conflictCount,
    failedCount: cycle.failedCount,
    deferredCount: cycle.deferredCount
  };
}

/**
 * Service-owned background sync: outbox polling + hydrate/apply schedule.
 * CLI task-state-* commands remain the fallback when the service is not running.
 */
export class DashboardTaskSyncWorker {
  private readonly hydrateIntervalMs: number;
  private readonly debounceMs: number;
  private readonly setIntervalImpl: SetIntervalFn;
  private readonly clearIntervalImpl: ClearIntervalFn;
  private readonly skipOutboxPublisher: boolean;

  private posture: DashboardTaskSyncWorkerPosture = "stopped";
  private outboxRuntime: CanonicalEventOutboxRuntime | null = null;
  private publisher: CanonicalEventOutboxPublisher | null = null;
  private hydrateTimer: NodeJS.Timeout | null = null;
  private hydrateDebounce: NodeJS.Timeout | null = null;
  private hydrateInFlight: Promise<void> | null = null;

  private lastHydrateCycleAt: string | null = null;
  private lastHydrateAction: DashboardTaskSyncWorkerStatus["lastHydrateAction"] = "none";
  private lastHydrateCode: string | null = null;

  constructor(
    private readonly ctx: ModuleLifecycleContext,
    options: DashboardTaskSyncWorkerOptions = { ctx }
  ) {
    const workerConfig = readDashboardTaskSyncWorkerConfig(
      ctx.effectiveConfig as Record<string, unknown> | undefined
    );
    this.hydrateIntervalMs = options.hydrateIntervalMs ?? workerConfig.hydrateIntervalMs;
    this.debounceMs = options.debounceMs ?? 2_000;
    this.setIntervalImpl = options.setIntervalFn ?? setInterval;
    this.clearIntervalImpl = options.clearIntervalFn ?? clearInterval;
    this.skipOutboxPublisher = options.skipOutboxPublisher === true;
  }

  getStatus(): DashboardTaskSyncWorkerStatus {
    return {
      posture: this.posture,
      outboxPolling: this.publisher !== null && this.posture === "running",
      hydrateIntervalMs: this.hydrateIntervalMs,
      lastHydrateCycleAt: this.lastHydrateCycleAt,
      lastHydrateAction: this.lastHydrateAction,
      lastHydrateCode: this.lastHydrateCode
    };
  }

  isActive(): boolean {
    return this.posture === "running";
  }

  async start(): Promise<boolean> {
    if (this.posture !== "stopped") {
      return false;
    }
    if (!isGitTaskStateCanonicalAuthority(this.ctx)) {
      return false;
    }
    const workerConfig = readDashboardTaskSyncWorkerConfig(
      this.ctx.effectiveConfig as Record<string, unknown> | undefined
    );
    if (!workerConfig.enabled) {
      return false;
    }

    if (!this.skipOutboxPublisher) {
      try {
        this.outboxRuntime = await openCanonicalEventOutboxRuntime(this.ctx);
        this.publisher = new CanonicalEventOutboxPublisher({
          ctx: this.ctx,
          repository: this.outboxRuntime.repository,
          setIntervalFn: this.setIntervalImpl,
          clearIntervalFn: this.clearIntervalImpl
        });
        this.publisher.start();
      } catch {
        this.teardownOutbox();
      }
    }

    this.posture = "running";
    this.scheduleHydrateInterval();
    setImmediate(() => void this.runHydrateCycle("startup"));
    return true;
  }

  pause(): boolean {
    if (this.posture !== "running") {
      return false;
    }
    this.publisher?.stop();
    this.clearHydrateTimers();
    this.posture = "paused";
    return true;
  }

  resume(): boolean {
    if (this.posture !== "paused") {
      return false;
    }
    this.publisher?.start();
    this.posture = "running";
    this.scheduleHydrateInterval();
    void this.runHydrateCycle("resume");
    return true;
  }

  async stop(): Promise<void> {
    this.clearHydrateTimers();
    this.publisher?.stop();
    this.teardownOutbox();
    this.posture = "stopped";
  }

  async flush(): Promise<TaskSyncFlushResultV1> {
    if (this.publisher) {
      try {
        return cycleResultToFlush(await this.publisher.runCycle());
      } catch {
        // fall through to one-shot flush
      }
    }
    return flushTaskSyncOutbox(this.ctx);
  }

  requestHydrate(reason: string): void {
    if (this.posture === "stopped") {
      return;
    }
    if (this.hydrateDebounce) {
      clearTimeout(this.hydrateDebounce);
    }
    this.hydrateDebounce = setTimeout(() => {
      this.hydrateDebounce = null;
      void this.runHydrateCycle(reason);
    }, this.debounceMs);
  }

  private scheduleHydrateInterval(): void {
    if (this.hydrateIntervalMs <= 0 || this.hydrateTimer) {
      return;
    }
    this.hydrateTimer = this.setIntervalImpl(() => {
      this.requestHydrate("interval");
    }, this.hydrateIntervalMs);
  }

  private clearHydrateTimers(): void {
    if (this.hydrateTimer) {
      this.clearIntervalImpl(this.hydrateTimer);
      this.hydrateTimer = null;
    }
    if (this.hydrateDebounce) {
      clearTimeout(this.hydrateDebounce);
      this.hydrateDebounce = null;
    }
  }

  private teardownOutbox(): void {
    this.publisher = null;
    if (this.outboxRuntime) {
      this.outboxRuntime.close();
      this.outboxRuntime = null;
    }
  }

  private async runHydrateCycle(reason: string): Promise<void> {
    if (this.posture === "stopped" || this.posture === "paused") {
      return;
    }
    if (this.hydrateInFlight) {
      await this.hydrateInFlight;
      return;
    }
    const cycle = this.executeHydrateCycle(reason);
    this.hydrateInFlight = cycle;
    try {
      await cycle;
    } finally {
      if (this.hydrateInFlight === cycle) {
        this.hydrateInFlight = null;
      }
    }
  }

  private async executeHydrateCycle(reason: string): Promise<void> {
    this.lastHydrateCycleAt = new Date().toISOString();
    const status = await runTaskStateStatus(this.ctx, { fetch: true });
    if (!status.ok) {
      this.lastHydrateAction = "error";
      this.lastHydrateCode = status.code;
      return;
    }
    const data = status.data && typeof status.data === "object" ? (status.data as Record<string, unknown>) : {};
    const syncState = typeof data.syncState === "string" ? data.syncState : "unknown";

    if (syncState === "conflict") {
      this.lastHydrateAction = "skipped";
      this.lastHydrateCode = "task-state-sync-conflict";
      return;
    }

    const queueEnabled = readCanonicalPublishQueueConfig(
      this.ctx.effectiveConfig as Record<string, unknown> | undefined
    ).enabled;

    if (syncState === "behind" || syncState === "missing") {
      const hydrate = await runTaskStateHydrate(this.ctx, {
        fetch: true,
        policyApproval: SERVICE_SYNC_POLICY_APPROVAL
      });
      this.lastHydrateCode = hydrate.code;
      this.lastHydrateAction = hydrate.ok ? "hydrated" : "error";
      return;
    }

    const apply = await runApplyTaskStateEvents(this.ctx, {
      policyApproval: SERVICE_SYNC_POLICY_APPROVAL
    });
    this.lastHydrateCode = apply.code;
    if (!apply.ok) {
      this.lastHydrateAction = "error";
      return;
    }
    this.lastHydrateAction = apply.code === "task-state-events-applied" ? "applied" : "none";

    if (queueEnabled && this.publisher) {
      const flush = await this.publisher.runCycle();
      if (flush.conflictCount > 0) {
        this.lastHydrateAction = "skipped";
        this.lastHydrateCode = "task-state-publish-task-conflict";
      }
    }
  }
}

export async function createDashboardTaskSyncWorker(
  ctx: ModuleLifecycleContext,
  options?: Omit<DashboardTaskSyncWorkerOptions, "ctx">
): Promise<DashboardTaskSyncWorker> {
  return new DashboardTaskSyncWorker(ctx, { ctx, ...options });
}
