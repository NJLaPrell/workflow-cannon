import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { PROJECT_CONFIG_REL } from "../../core/workspace-kit-config.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  dashboardServiceSliceNamesForPollGroup,
  DASHBOARD_SERVICE_POLL_INTERVAL_MS,
  listDashboardServicePollGroups
} from "./poll-groups.js";
import type { DashboardSliceRefresher } from "./slice-refreshers.js";

const TASK_STATE_EVENT_LOG_REL = ".workspace-kit/tasks/task-state-events.jsonl";

/** Slices invalidated when the planning SQLite file or generation changes. */
const PLANNING_WATCH_SLICES = ["overview", "ideas", "phaseJournal", "queue"] as const;

/** Slices invalidated when workspace config changes. */
const CONFIG_WATCH_SLICES = ["status", "config", "agent"] as const;

/** Slices invalidated when task store or git task-state stream changes. */
const TASK_STORE_WATCH_SLICES = [
  "overview",
  "queue",
  "phase",
  "agent",
  "team",
  "subagents",
  "checkpoints",
  "status"
] as const;

export type DashboardServiceWatchersOptions = {
  workspacePath: string;
  ctx: ModuleLifecycleContext;
  refresher: DashboardSliceRefresher;
  /** Override poll intervals (tests). */
  pollIntervalMs?: Partial<typeof DASHBOARD_SERVICE_POLL_INTERVAL_MS>;
  debounceMs?: number;
};

export class DashboardServiceWatchers {
  private readonly workspacePath: string;
  private readonly ctx: ModuleLifecycleContext;
  private readonly refresher: DashboardSliceRefresher;
  private readonly pollIntervalMs: typeof DASHBOARD_SERVICE_POLL_INTERVAL_MS;
  private readonly debounceMs: number;
  private readonly fsWatchers: FSWatcher[] = [];
  private readonly intervalHandles = new Set<ReturnType<typeof setInterval>>();
  private readonly pendingSlices = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPlanningGeneration: number | null = null;
  private planningPollHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: DashboardServiceWatchersOptions) {
    this.workspacePath = options.workspacePath;
    this.ctx = options.ctx;
    this.refresher = options.refresher;
    this.pollIntervalMs = { ...DASHBOARD_SERVICE_POLL_INTERVAL_MS, ...options.pollIntervalMs };
    this.debounceMs = options.debounceMs ?? 250;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastPlanningGeneration = await this.refresher.readPlanningGeneration();

    await this.refresher.refreshSlices([...dashboardServiceSliceNamesForPollGroup("critical")]);

    for (const group of listDashboardServicePollGroups()) {
      const intervalMs = this.pollIntervalMs[group];
      const handle = setInterval(() => {
        void this.refresher.refreshSlices(dashboardServiceSliceNamesForPollGroup(group));
      }, intervalMs);
      this.intervalHandles.add(handle);
    }

    this.planningPollHandle = setInterval(() => {
      void this.pollPlanningGeneration();
    }, 1000);

    this.attachFileWatcher(this.resolvePlanningDbPath(), [...TASK_STORE_WATCH_SLICES, ...PLANNING_WATCH_SLICES]);
    this.attachFileWatcher(path.join(this.workspacePath, PROJECT_CONFIG_REL), [...CONFIG_WATCH_SLICES]);
    this.attachFileWatcher(path.join(this.workspacePath, TASK_STATE_EVENT_LOG_REL), [
      ...TASK_STORE_WATCH_SLICES,
      "status"
    ]);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.planningPollHandle) {
      clearInterval(this.planningPollHandle);
      this.planningPollHandle = null;
    }
    for (const handle of this.intervalHandles) {
      clearInterval(handle);
    }
    this.intervalHandles.clear();
    for (const watcher of this.fsWatchers) {
      watcher.close();
    }
    this.fsWatchers.length = 0;
    this.pendingSlices.clear();
  }

  queueSlices(sliceNames: readonly string[]): void {
    for (const name of sliceNames) {
      this.pendingSlices.add(name);
    }
    if (this.debounceTimer) {
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushPending();
    }, this.debounceMs);
  }

  private resolvePlanningDbPath(): string {
    return path.join(this.workspacePath, planningSqliteDatabaseRelativePath(this.ctx));
  }

  private attachFileWatcher(absPath: string, slices: readonly string[]): void {
    try {
      const watcher = watch(absPath, () => {
        this.queueSlices(slices);
      });
      this.fsWatchers.push(watcher);
    } catch {
      // Missing files are normal on fresh workspaces; interval pollers still cover freshness.
    }
  }

  private async pollPlanningGeneration(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      const next = await this.refresher.readPlanningGeneration();
      if (this.lastPlanningGeneration !== null && next !== this.lastPlanningGeneration) {
        this.queueSlices(PLANNING_WATCH_SLICES);
      }
      this.lastPlanningGeneration = next;
    } catch {
      // Keep polling; store may appear later.
    }
  }

  private async flushPending(): Promise<void> {
    if (this.pendingSlices.size === 0) {
      return;
    }
    const names = [...this.pendingSlices];
    this.pendingSlices.clear();
    await this.refresher.refreshSlices(names);
  }
}
