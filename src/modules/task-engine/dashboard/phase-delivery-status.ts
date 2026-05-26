import type DatabaseCtor from "better-sqlite3";
import {
  buildPhaseCloseoutReadiness,
  buildPhaseDeliveryPreflight,
  isPhaseDeliveryTask
} from "../delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import {
  inferTaskPhaseKey,
  isPhaseLegacyDeliveredByOrdinal,
  resolveLegacyDeliveredMaxOrdinal
} from "../phase-resolution.js";
import type { TaskEntity, TaskStatus } from "../types.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

export type DashboardCurrentPhaseQueue = {
  ready: number;
  proposed: number;
  blocked: number;
  inProgress: number;
  research: number;
};

export type DashboardCurrentPhaseSegments = {
  completed: number;
  cancelled: number;
  inProgress: number;
  ready: number;
  proposed: number;
  blocked: number;
  research: number;
};

export type DashboardCurrentPhaseDelivery = {
  schemaVersion: 2;
  phaseKey: string | null;
  closeoutPassed: boolean;
  released: boolean;
  remainingCount: number;
  terminalCount: number;
  checkedTaskCount: number;
  /** All non-archived tasks in this phase (any type), by queue status. */
  queue: DashboardCurrentPhaseQueue;
  /** Phase delivery tasks only — drives the progress bar segments. */
  segments: DashboardCurrentPhaseSegments;
  /** Completed + cancelled delivery tasks / all delivery tasks in phase. */
  progressPercent: number;
  /** 100 when `closeoutPassed`; otherwise mirrors `progressPercent` (cap 99). */
  releaseReadyPercent: number;
  /** Delivery-evidence preflight violations for phase delivery tasks (0 when none or no phase). */
  deliveryEvidenceViolationCount: number;
};

function workspaceStatusEventsReadable(db: SqliteDb): boolean {
  try {
    const raw = db.pragma("user_version", { simple: true });
    const v = typeof raw === "number" ? raw : Number(raw);
    if (v < 10) {
      return false;
    }
    const row = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'kit_workspace_status_events'`)
      .get();
    return row != null;
  } catch {
    return false;
  }
}

/** Phase keys with closeout-passed delivery evidence among workspace rollover candidates. */
export function collectDeliveredPhaseKeys(
  db: SqliteDb,
  tasks: TaskEntity[],
  limit = 300
): string[] {
  const candidates = collectRolledOutPhaseKeys(db, limit);
  const delivered: string[] = [];
  for (const phaseKey of candidates) {
    const closeout = buildPhaseCloseoutReadiness({ tasks, phaseKey });
    if (closeout.passed) {
      delivered.push(phaseKey);
    }
  }
  return delivered;
}

/**
 * Phase key → ISO timestamp when workspace rolled off that phase (`previousCurrentKitPhase`
 * on `set_current_phase` events). Later rollovers overwrite earlier entries for the same key.
 */
export function collectPhaseReleaseDatesByKey(db: SqliteDb, limit = 500): Record<string, string> {
  const out: Record<string, string> = {};
  if (!workspaceStatusEventsReadable(db)) {
    return out;
  }
  const rows = db
    .prepare(
      `SELECT created_at, details_json
       FROM kit_workspace_status_events
       WHERE event_kind = 'set_current_phase'
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(limit) as Array<{ created_at: string; details_json: string }>;
  for (const row of rows) {
    try {
      const details = JSON.parse(row.details_json) as Record<string, unknown>;
      const prior =
        typeof details.previousCurrentKitPhase === "string"
          ? details.previousCurrentKitPhase.trim()
          : "";
      if (prior.length > 0 && typeof row.created_at === "string" && row.created_at.trim().length > 0) {
        out[prior] = row.created_at.trim();
      }
    } catch {
      /* Ignore malformed historical details. */
    }
  }
  return out;
}

/** Unique phase keys rolled off via `set_current_phase` events (newest events first, capped). */
export function collectRolledOutPhaseKeys(db: SqliteDb, limit = 300): string[] {
  const out = new Set<string>();
  if (!workspaceStatusEventsReadable(db)) {
    return [];
  }
  const rows = db
    .prepare(
      `SELECT details_json
       FROM kit_workspace_status_events
       WHERE event_kind = 'set_current_phase'
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ details_json: string }>;
  for (const row of rows) {
    try {
      const details = JSON.parse(row.details_json) as Record<string, unknown>;
      const prior =
        typeof details.previousCurrentKitPhase === "string"
          ? details.previousCurrentKitPhase.trim()
          : "";
      if (prior.length > 0) {
        out.add(prior);
      }
    } catch {
      /* Ignore malformed historical details. */
    }
  }
  return [...out].sort((a, b) => {
    const ao = parseLeadingPhaseOrdinal(a);
    const bo = parseLeadingPhaseOrdinal(b);
    if (ao !== null && bo !== null && ao !== bo) {
      return ao - bo;
    }
    return a.localeCompare(b);
  });
}

const TERMINAL_QUEUE_STATUSES = new Set<TaskStatus>(["completed", "cancelled"]);

/**
 * Phase keys with at least one non-terminal, non-archived task (ready, proposed, in progress, etc.).
 * Dashboard roster and schedule tags keep these visible even when legacy rollover marks the phase delivered.
 */
export function collectPhaseKeysWithActiveQueueWork(tasks: TaskEntity[]): string[] {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (task.archived) {
      continue;
    }
    if (TERMINAL_QUEUE_STATUSES.has(task.status)) {
      continue;
    }
    const key = inferTaskPhaseKey(task);
    if (key && key.length > 0) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => {
    const ao = parseLeadingPhaseOrdinal(a);
    const bo = parseLeadingPhaseOrdinal(b);
    if (ao !== null && bo !== null && ao !== bo) {
      return ao - bo;
    }
    return a.localeCompare(b);
  });
}

/** True when a live `set-current-phase` rolled workspace off this phase key. */
export function wasWorkspacePhaseRolledOut(db: SqliteDb, phaseKey: string): boolean {
  const key = phaseKey.trim();
  if (!key || !workspaceStatusEventsReadable(db)) {
    return false;
  }
  const rows = db
    .prepare(
      `SELECT details_json
       FROM kit_workspace_status_events
       WHERE event_kind = 'set_current_phase'
       ORDER BY id DESC
       LIMIT 300`
    )
    .all() as Array<{ details_json: string }>;
  for (const row of rows) {
    try {
      const details = JSON.parse(row.details_json) as Record<string, unknown>;
      const prior =
        typeof details.previousCurrentKitPhase === "string"
          ? details.previousCurrentKitPhase.trim()
          : "";
      if (prior.length > 0 && prior === key) {
        return true;
      }
    } catch {
      /* Ignore malformed historical details. */
    }
  }
  return false;
}

function parseLeadingPhaseOrdinal(phaseKey: string | null | undefined): number | null {
  if (phaseKey == null) {
    return null;
  }
  const m = String(phaseKey).trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Phase ordinal strictly before workspace `currentKitPhase` (roster Delivered semantics). */
export function isPhaseBehindWorkspaceCurrent(
  phaseKey: string,
  workspaceStatus: { currentKitPhase?: string | null } | null | undefined
): boolean {
  const pkOrd = parseLeadingPhaseOrdinal(phaseKey);
  const curOrd = parseLeadingPhaseOrdinal(workspaceStatus?.currentKitPhase);
  if (pkOrd === null || curOrd === null) {
    return false;
  }
  return pkOrd < curOrd;
}

function taskMatchesPhase(task: TaskEntity, phaseKey: string): boolean {
  return inferTaskPhaseKey(task) === phaseKey;
}

function bumpInProgressQueue(queue: DashboardCurrentPhaseQueue): void {
  queue.inProgress += 1;
}

export function countPhaseQueueMetrics(
  tasks: TaskEntity[],
  phaseKey: string | null
): DashboardCurrentPhaseQueue {
  const queue: DashboardCurrentPhaseQueue = {
    ready: 0,
    proposed: 0,
    blocked: 0,
    inProgress: 0,
    research: 0
  };
  if (!phaseKey) {
    return queue;
  }
  for (const task of tasks) {
    if (task.archived || !taskMatchesPhase(task, phaseKey)) {
      continue;
    }
    switch (task.status) {
      case "ready":
        queue.ready += 1;
        break;
      case "proposed":
        queue.proposed += 1;
        break;
      case "blocked":
        queue.blocked += 1;
        break;
      case "in_progress":
      case "awaiting_review":
      case "awaiting_policy_approval":
      case "awaiting_external_decision":
        bumpInProgressQueue(queue);
        break;
      case "research":
        queue.research += 1;
        break;
      default:
        break;
    }
  }
  return queue;
}

function segmentKeyForStatus(status: TaskStatus): keyof DashboardCurrentPhaseSegments | null {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "ready":
      return "ready";
    case "proposed":
      return "proposed";
    case "blocked":
      return "blocked";
    case "research":
      return "research";
    case "in_progress":
    case "awaiting_review":
    case "awaiting_policy_approval":
    case "awaiting_external_decision":
      return "inProgress";
    default:
      return null;
  }
}

export function countPhaseDeliverySegments(
  tasks: TaskEntity[],
  phaseKey: string | null
): DashboardCurrentPhaseSegments {
  const segments: DashboardCurrentPhaseSegments = {
    completed: 0,
    cancelled: 0,
    inProgress: 0,
    ready: 0,
    proposed: 0,
    blocked: 0,
    research: 0
  };
  if (!phaseKey) {
    return segments;
  }
  for (const task of tasks) {
    if (!isPhaseDeliveryTask(task) || !taskMatchesPhase(task, phaseKey)) {
      continue;
    }
    const key = segmentKeyForStatus(task.status);
    if (key) {
      segments[key] += 1;
    }
  }
  return segments;
}

export function segmentTotal(segments: DashboardCurrentPhaseSegments): number {
  return (
    segments.completed +
    segments.cancelled +
    segments.inProgress +
    segments.ready +
    segments.proposed +
    segments.blocked +
    segments.research
  );
}

export function buildDashboardCurrentPhaseDelivery(args: {
  tasks: TaskEntity[];
  workspaceStatus: { currentKitPhase?: string | null; nextKitPhase?: string | null } | null;
  db: SqliteDb | null;
  effectiveConfig?: Record<string, unknown>;
}): DashboardCurrentPhaseDelivery {
  const phaseKey =
    args.workspaceStatus?.currentKitPhase != null
      ? String(args.workspaceStatus.currentKitPhase).trim() || null
      : null;
  const closeout = buildPhaseCloseoutReadiness({
    tasks: args.tasks,
    phaseKey
  });
  let released = false;
  if (phaseKey) {
    const legacyMax = resolveLegacyDeliveredMaxOrdinal(args.effectiveConfig);
    if (isPhaseLegacyDeliveredByOrdinal(phaseKey, legacyMax)) {
      released = true;
    } else if (args.db) {
      released =
        wasWorkspacePhaseRolledOut(args.db, phaseKey) &&
        buildPhaseCloseoutReadiness({ tasks: args.tasks, phaseKey }).passed;
    }
  }

  const queue = countPhaseQueueMetrics(args.tasks, phaseKey);
  const segments = countPhaseDeliverySegments(args.tasks, phaseKey);
  const checkedTaskCount = closeout.checkedTaskCount;
  const progressPercent =
    checkedTaskCount > 0 ? Math.round((closeout.terminalCount / checkedTaskCount) * 100) : 0;
  const releaseReadyPercent = closeout.passed
    ? 100
    : checkedTaskCount > 0
      ? Math.min(99, progressPercent)
      : 0;

  let deliveryEvidenceViolationCount = 0;
  if (phaseKey) {
    const policyContextByTaskId = Object.fromEntries(
      args.tasks.map((task) => {
        const resolved = resolveMaintainerDeliveryPolicy({
          effectiveConfig: args.effectiveConfig,
          task
        });
        return [task.id, buildDeliveryEvidencePolicyContext(resolved)];
      })
    );
    const preflight = buildPhaseDeliveryPreflight({
      tasks: args.tasks,
      phaseKey,
      includeInProgress: true,
      policyContextByTaskId
    });
    deliveryEvidenceViolationCount = preflight.violationCount;
  }

  return {
    schemaVersion: 2,
    phaseKey,
    closeoutPassed: closeout.passed,
    released,
    remainingCount: closeout.remainingCount,
    terminalCount: closeout.terminalCount,
    checkedTaskCount,
    queue,
    segments,
    progressPercent,
    releaseReadyPercent,
    deliveryEvidenceViolationCount
  };
}
