import type Database from "better-sqlite3";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import { replayTaskStateEvents } from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import { readTaskStateEventLogJsonl } from "../task-state-events/task-state-event-log-io.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable,
  type TaskStateProjectionMeta,
  type TaskStateProjectionSyncStatus
} from "./task-state-projection-meta-store.js";

export type TaskStateProjectionHealthCode =
  | "projection-meta-unavailable"
  | "event-log-empty"
  | "projection-empty"
  | "projection-fresh"
  | "projection-stale"
  | "projection-ahead-of-log"
  | "projection-corrupt"
  | "event-log-admission-failed";

export type TaskStateProjectionHealth = {
  schemaVersion: 1;
  code: TaskStateProjectionHealthCode;
  message: string;
  appliedSequence: number;
  logMaxSequence: number;
  logEventCount: number;
  syncStatus: TaskStateProjectionSyncStatus | null;
  recommendedCommand: string | null;
};

function maxSequence(events: TaskStateEventV1[]): number {
  let max = 0;
  for (const event of events) {
    if (event.sequence > max) {
      max = event.sequence;
    }
  }
  return max;
}

export function evaluateTaskStateProjectionHealth(
  workspacePath: string,
  db: Database.Database,
  eventLogRelativePath?: string
): TaskStateProjectionHealth {
  if (!taskStateProjectionMetaTableAvailable(db)) {
    return {
      schemaVersion: 1,
      code: "projection-meta-unavailable",
      message: "kit_task_state_projection_meta not present (kit SQLite user_version < 28)",
      appliedSequence: 0,
      logMaxSequence: 0,
      logEventCount: 0,
      syncStatus: null,
      recommendedCommand: null
    };
  }

  const meta = readTaskStateProjectionMeta(db);
  const appliedSequence = meta?.appliedSequence ?? 0;
  const syncStatus = meta?.syncStatus ?? null;
  const raw = readTaskStateEventLogJsonl(workspacePath, eventLogRelativePath);
  const admitted = admitTaskStateEventStream(raw);
  if (!admitted.ok) {
    return {
      schemaVersion: 1,
      code: "event-log-admission-failed",
      message: admitted.error.message,
      appliedSequence,
      logMaxSequence: 0,
      logEventCount: raw.length,
      syncStatus,
      recommendedCommand: "pnpm exec wk run rebuild-task-state-cache '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"fix corrupt event log\"}}'"
    };
  }

  const logMaxSequence = maxSequence(admitted.events);
  const logEventCount = admitted.events.length;

  if (logEventCount === 0 && appliedSequence === 0) {
    return {
      schemaVersion: 1,
      code: "projection-empty",
      message: "Canonical event log and projection are empty",
      appliedSequence,
      logMaxSequence,
      logEventCount,
      syncStatus,
      recommendedCommand: null
    };
  }

  if (appliedSequence > logMaxSequence && logEventCount > 0) {
    return {
      schemaVersion: 1,
      code: "projection-ahead-of-log",
      message: `Projection sequence ${appliedSequence} is ahead of log max ${logMaxSequence}`,
      appliedSequence,
      logMaxSequence,
      logEventCount,
      syncStatus,
      recommendedCommand:
        "pnpm exec wk run repair-task-state-cache '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"repair ahead-of-log projection\"}}'"
    };
  }

  if (syncStatus === "corrupt") {
    return {
      schemaVersion: 1,
      code: "projection-corrupt",
      message: "Projection metadata sync_status is corrupt",
      appliedSequence,
      logMaxSequence,
      logEventCount,
      syncStatus,
      recommendedCommand:
        "pnpm exec wk run repair-task-state-cache '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"repair corrupt projection\"}}'"
    };
  }

  if (appliedSequence < logMaxSequence) {
    return {
      schemaVersion: 1,
      code: "projection-stale",
      message: `Projection at sequence ${appliedSequence}; log has events through ${logMaxSequence}`,
      appliedSequence,
      logMaxSequence,
      logEventCount,
      syncStatus,
      recommendedCommand:
        "pnpm exec wk run apply-task-state-events '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"catch up stale projection\"}}'"
    };
  }

  const replayed = replayTaskStateEvents(admitted.events);
  if (!replayed.ok) {
    return {
      schemaVersion: 1,
      code: "projection-corrupt",
      message: `Canonical log failed replay: ${replayed.error.message}`,
      appliedSequence,
      logMaxSequence,
      logEventCount,
      syncStatus,
      recommendedCommand:
        "pnpm exec wk run repair-task-state-cache '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"replay failed\"}}'"
    };
  }

  return {
    schemaVersion: 1,
    code: "projection-fresh",
    message: `Projection matches canonical log through sequence ${appliedSequence}`,
    appliedSequence,
    logMaxSequence,
    logEventCount,
    syncStatus: meta?.syncStatus ?? "fresh",
    recommendedCommand: null
  };
}

export function collectTaskStateProjectionDoctorIssues(
  workspacePath: string,
  dbAbs: string,
  db: Database.Database,
  eventLogRelativePath?: string
): Array<{ path: string; reason: string }> {
  const health = evaluateTaskStateProjectionHealth(workspacePath, db, eventLogRelativePath);
  const rel = dbAbs;
  switch (health.code) {
    case "projection-stale":
      return [
        {
          path: rel,
          reason: `task-state-projection-stale: ${health.message} — ${health.recommendedCommand ?? "apply-task-state-events"}`
        }
      ];
    case "projection-ahead-of-log":
    case "projection-corrupt":
    case "event-log-admission-failed":
      return [
        {
          path: rel,
          reason: `task-state-projection-${health.code}: ${health.message} — ${health.recommendedCommand ?? "repair-task-state-cache"}`
        }
      ];
    default:
      return [];
  }
}

export type { TaskStateProjectionMeta };
