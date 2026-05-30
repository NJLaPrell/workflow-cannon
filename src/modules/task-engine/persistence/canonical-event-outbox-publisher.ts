import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import {
  publishTaskStateEvents,
  type PublishTaskStateEventsResult
} from "../task-state-git/publish-task-state-events.js";
import { remoteBranchHeadSha, resolveTaskStateGitRef } from "../task-state-git/git-io.js";
import {
  readCanonicalPublishQueueConfig,
  type CanonicalPublishQueueConfig
} from "./task-state-canonical-authority.js";
import type { CanonicalEventOutboxRepository } from "./canonical-event-outbox-runtime.js";
import type { CanonicalEventOutboxRow } from "./canonical-event-outbox-store.js";

type SetIntervalFn = (handler: () => void, timeoutMs: number) => NodeJS.Timeout;
type ClearIntervalFn = (handle: NodeJS.Timeout) => void;

export type CanonicalOutboxPublishCycleResult = {
  enabled: boolean;
  resetToPendingCount: number;
  pendingRowsFetched: number;
  markedPublishingCount: number;
  publishedCount: number;
  conflictCount: number;
  failedCount: number;
  deferredCount: number;
  publishCode: string | null;
};

export type CanonicalEventOutboxPublisherOptions = {
  ctx: ModuleLifecycleContext;
  repository: CanonicalEventOutboxRepository;
  branch?: string;
  publish?: typeof publishTaskStateEvents;
  resolveHeadSha?: (workspacePath: string, branch: string) => string | null;
  setIntervalFn?: SetIntervalFn;
  clearIntervalFn?: ClearIntervalFn;
};

function mergeExpectedTaskVersions(rows: readonly CanonicalEventOutboxRow[]): Record<string, number> {
  const merged = new Map<string, number>();
  for (const row of rows) {
    for (const [taskId, version] of Object.entries(row.expectedTaskVersions)) {
      if (typeof version !== "number" || !Number.isFinite(version)) {
        continue;
      }
      const next = Math.max(0, Math.trunc(version));
      const prior = merged.get(taskId);
      merged.set(taskId, prior === undefined ? next : Math.min(prior, next));
    }
  }
  return Object.fromEntries([...merged.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function resolveExpectedHeadSha(workspacePath: string, branch: string): string | null {
  const resolved = resolveTaskStateGitRef(workspacePath, branch);
  if ("missing" in resolved) {
    return remoteBranchHeadSha(workspacePath, branch);
  }
  return resolved.tipSha;
}

function failedRowsForAttempts(
  rows: readonly CanonicalEventOutboxRow[],
  maxAttempts: number
): { failedIds: string[]; deferredIds: string[] } {
  const failedIds: string[] = [];
  const deferredIds: string[] = [];
  for (const row of rows) {
    if (row.attempts + 1 >= maxAttempts) {
      failedIds.push(row.id);
    } else {
      deferredIds.push(row.id);
    }
  }
  return { failedIds, deferredIds };
}

export class CanonicalEventOutboxPublisher {
  private readonly branch: string;
  private readonly publishImpl: typeof publishTaskStateEvents;
  private readonly resolveHeadShaImpl: (workspacePath: string, branch: string) => string | null;
  private readonly setIntervalImpl: SetIntervalFn;
  private readonly clearIntervalImpl: ClearIntervalFn;
  private readonly queueConfig: CanonicalPublishQueueConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: CanonicalEventOutboxPublisherOptions) {
    this.branch = options.branch?.trim() || TASK_STATE_GIT_BRANCH;
    this.publishImpl = options.publish ?? publishTaskStateEvents;
    this.resolveHeadShaImpl = options.resolveHeadSha ?? resolveExpectedHeadSha;
    this.setIntervalImpl = options.setIntervalFn ?? setInterval;
    this.clearIntervalImpl = options.clearIntervalFn ?? clearInterval;
    this.queueConfig = readCanonicalPublishQueueConfig(
      options.ctx.effectiveConfig as Record<string, unknown> | undefined
    );
  }

  config(): CanonicalPublishQueueConfig {
    return { ...this.queueConfig };
  }

  isEnabled(): boolean {
    return this.queueConfig.enabled;
  }

  async runCycle(): Promise<CanonicalOutboxPublishCycleResult> {
    if (!this.queueConfig.enabled) {
      return {
        enabled: false,
        resetToPendingCount: 0,
        pendingRowsFetched: 0,
        markedPublishingCount: 0,
        publishedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        deferredCount: 0,
        publishCode: null
      };
    }

    const resetToPendingCount = this.options.repository.resetStalePublishing(
      this.queueConfig.batchMaxAgeMs
    );
    const pending = this.options.repository.listPendingCanonicalEvents(
      this.queueConfig.batchMaxEvents
    );
    if (pending.length === 0) {
      return {
        enabled: true,
        resetToPendingCount,
        pendingRowsFetched: 0,
        markedPublishingCount: 0,
        publishedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        deferredCount: 0,
        publishCode: null
      };
    }

    const ids = pending.map((row) => row.id);
    const markedPublishingCount = this.options.repository.markPublishing(ids);
    if (markedPublishingCount <= 0) {
      return {
        enabled: true,
        resetToPendingCount,
        pendingRowsFetched: pending.length,
        markedPublishingCount: 0,
        publishedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        deferredCount: pending.length,
        publishCode: null
      };
    }

    const markedRows = pending.slice(0, markedPublishingCount);
    const markedIds = markedRows.map((row) => row.id);
    const expectedTaskVersions = mergeExpectedTaskVersions(markedRows);
    const expectedHeadSha = this.resolveHeadShaImpl(this.options.ctx.workspacePath, this.branch);
    if (!expectedHeadSha) {
      const { failedIds, deferredIds } = failedRowsForAttempts(markedRows, this.queueConfig.maxAttempts);
      let failedCount = 0;
      if (failedIds.length > 0) {
        failedCount = this.options.repository.markFailed(
          failedIds,
          "Canonical branch missing while publishing outbox events"
        );
      }
      return {
        enabled: true,
        resetToPendingCount,
        pendingRowsFetched: pending.length,
        markedPublishingCount,
        publishedCount: 0,
        conflictCount: 0,
        failedCount,
        deferredCount: deferredIds.length,
        publishCode: "task-state-branch-missing"
      };
    }

    const publishResult: PublishTaskStateEventsResult = await this.publishImpl({
      workspacePath: this.options.ctx.workspacePath,
      branch: this.branch,
      events: markedRows.map((row) => row.event),
      expectedHeadSha,
      expectedTaskVersions,
      maxAttempts: this.queueConfig.maxAttempts,
      push: true
    });

    if (publishResult.ok) {
      const publishedCount = this.options.repository.markPublished(markedIds, {
        headSha: publishResult.headSha,
        sequenceStart: publishResult.publishedEvents[0]?.sequence ?? null,
        sequenceEnd: publishResult.publishedEvents.at(-1)?.sequence ?? null
      });
      return {
        enabled: true,
        resetToPendingCount,
        pendingRowsFetched: pending.length,
        markedPublishingCount,
        publishedCount,
        conflictCount: 0,
        failedCount: 0,
        deferredCount: 0,
        publishCode: null
      };
    }

    if (publishResult.code === "task-state-publish-task-conflict") {
      const conflictCount = this.options.repository.markConflict(markedIds, publishResult.message);
      return {
        enabled: true,
        resetToPendingCount,
        pendingRowsFetched: pending.length,
        markedPublishingCount,
        publishedCount: 0,
        conflictCount,
        failedCount: 0,
        deferredCount: 0,
        publishCode: publishResult.code
      };
    }

    const { failedIds, deferredIds } = failedRowsForAttempts(markedRows, this.queueConfig.maxAttempts);
    let failedCount = 0;
    if (failedIds.length > 0) {
      failedCount = this.options.repository.markFailed(failedIds, publishResult.message);
    }
    return {
      enabled: true,
      resetToPendingCount,
      pendingRowsFetched: pending.length,
      markedPublishingCount,
      publishedCount: 0,
      conflictCount: 0,
      failedCount,
      deferredCount: deferredIds.length,
      publishCode: publishResult.code
    };
  }

  start(): boolean {
    if (!this.queueConfig.enabled || this.timer) {
      return false;
    }
    this.timer = this.setIntervalImpl(() => {
      if (this.running) {
        return;
      }
      this.running = true;
      void this.runCycle().finally(() => {
        this.running = false;
      });
    }, this.queueConfig.intervalMs);
    return true;
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    this.clearIntervalImpl(this.timer);
    this.timer = null;
  }
}
