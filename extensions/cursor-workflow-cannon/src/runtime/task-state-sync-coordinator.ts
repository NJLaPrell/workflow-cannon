import type { KitRunResult } from "./command-client.js";

export type TaskStateSyncCoordinatorDeps = {
  run: (command: string, args: Record<string, unknown>) => Promise<KitRunResult>;
  policyApproval: () => { confirmed: true; rationale: string };
  onSynced?: (result: TaskStateSyncCycleResult) => void;
  log?: (message: string) => void;
  debounceMs?: number;
  /** Background interval; omit or 0 to disable periodic sync. */
  intervalMs?: number;
};

export type TaskStateSyncCycleResult = {
  ok: boolean;
  action: "none" | "hydrated" | "applied" | "skipped" | "error";
  syncState?: string;
  code?: string;
  message?: string;
};

/**
 * Background git task-state sync for the VS Code extension (Phase 115 S4.2).
 * Single-flight + debounced explicit refresh; dashboard reads stay read-only (no git fetch).
 */
export class TaskStateSyncCoordinator {
  private inFlight: Promise<TaskStateSyncCycleResult> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private readonly debounceMs: number;

  constructor(private readonly deps: TaskStateSyncCoordinatorDeps) {
    this.debounceMs = deps.debounceMs ?? 2_000;
  }

  start(): void {
    const ms = this.deps.intervalMs ?? 0;
    if (ms <= 0 || this.intervalTimer) {
      return;
    }
    this.intervalTimer = setInterval(() => {
      this.requestSync("interval");
    }, ms);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /** Debounced background sync (interval, kit watcher, manual command). */
  requestSync(reason: string): void {
    this.deps.log?.(`task-state sync requested (${reason})`);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.syncNow(reason);
    }, this.debounceMs);
  }

  /** Immediate sync — coalesces onto in-flight work. */
  async syncNow(reason = "explicit"): Promise<TaskStateSyncCycleResult> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const cycle = this.runCycle(reason);
    this.inFlight = cycle;
    try {
      return await cycle;
    } finally {
      if (this.inFlight === cycle) {
        this.inFlight = undefined;
      }
    }
  }

  private async runCycle(reason: string): Promise<TaskStateSyncCycleResult> {
    this.deps.log?.(`task-state sync start (${reason})`);
    const status = await this.deps.run("task-state-status", { fetch: true });
    if (!status.ok) {
      const result: TaskStateSyncCycleResult = {
        ok: false,
        action: "error",
        code: typeof status.code === "string" ? status.code : undefined,
        message: typeof status.message === "string" ? status.message : "task-state-status failed"
      };
      this.deps.onSynced?.(result);
      return result;
    }

    const data = status.data ?? {};
    const syncState = typeof data.syncState === "string" ? data.syncState : "unknown";

    if (syncState === "conflict") {
      const result: TaskStateSyncCycleResult = {
        ok: true,
        action: "skipped",
        syncState,
        message: typeof data.reason === "string" ? data.reason : "projection conflict — manual repair required"
      };
      this.deps.onSynced?.(result);
      return result;
    }

    const policyApproval = this.deps.policyApproval();
    let action: TaskStateSyncCycleResult["action"] = "none";
    let lastCode: string | undefined;
    let lastMessage: string | undefined;

    if (syncState === "behind" || syncState === "missing") {
      const hydrate = await this.deps.run("task-state-hydrate", {
        fetch: true,
        policyApproval
      });
      lastCode = typeof hydrate.code === "string" ? hydrate.code : undefined;
      lastMessage = typeof hydrate.message === "string" ? hydrate.message : undefined;
      if (!hydrate.ok) {
        const result: TaskStateSyncCycleResult = {
          ok: false,
          action: "error",
          syncState,
          code: lastCode,
          message: lastMessage ?? "task-state-hydrate failed"
        };
        this.deps.onSynced?.(result);
        return result;
      }
      action = "hydrated";
    } else {
      const apply = await this.deps.run("apply-task-state-events", { policyApproval });
      lastCode = typeof apply.code === "string" ? apply.code : undefined;
      lastMessage = typeof apply.message === "string" ? apply.message : undefined;
      if (!apply.ok) {
        const result: TaskStateSyncCycleResult = {
          ok: false,
          action: "error",
          syncState,
          code: lastCode,
          message: lastMessage ?? "apply-task-state-events failed"
        };
        this.deps.onSynced?.(result);
        return result;
      }
      if (lastCode === "task-state-events-applied") {
        action = "applied";
      }
    }

    const result: TaskStateSyncCycleResult = {
      ok: true,
      action,
      syncState,
      code: lastCode,
      message: lastMessage
    };
    this.deps.onSynced?.(result);
    this.deps.log?.(`task-state sync done action=${action} syncState=${syncState}`);
    return result;
  }
}
