import type Database from "better-sqlite3";
import type { DashboardTaskStateProjectionSummary } from "../../../contracts/dashboard-summary-run.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable
} from "../persistence/task-state-projection-meta-store.js";

const EMPTY: DashboardTaskStateProjectionSummary = {
  schemaVersion: 1,
  available: false,
  backend: null,
  appliedSequence: null,
  sourceCommit: null,
  syncStatus: null,
  updatedAt: null
};

/** Read-only projection cursor for dashboard / extension (no git fetch). */
export function buildDashboardTaskStateProjectionSummary(
  db: Database.Database | undefined
): DashboardTaskStateProjectionSummary {
  if (!db || !taskStateProjectionMetaTableAvailable(db)) {
    return { ...EMPTY };
  }

  const meta = readTaskStateProjectionMeta(db);
  if (!meta) {
    return {
      schemaVersion: 1,
      available: true,
      backend: "git-event-log",
      appliedSequence: 0,
      sourceCommit: null,
      syncStatus: "empty",
      updatedAt: null
    };
  }

  return {
    schemaVersion: 1,
    available: true,
    backend: meta.backend,
    appliedSequence: meta.appliedSequence,
    sourceCommit: meta.sourceCommit,
    syncStatus: meta.syncStatus,
    updatedAt: meta.updatedAt
  };
}
