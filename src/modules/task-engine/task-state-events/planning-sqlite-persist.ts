import type DatabaseCtor from "better-sqlite3";
import {
  deletePhaseCatalogRow,
  KIT_PHASE_CATALOG_TABLE,
  phaseCatalogTableAvailable,
  upsertPhaseCatalogRow
} from "../persistence/phase-catalog-store.js";
import {
  readKitWorkspaceStatusRow,
  workspaceStatusTableAvailable
} from "../persistence/workspace-status-store.js";
import type { PlanningStateProjectionV1 } from "./planning-projection-types.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

/** Persist in-memory planning projection into kit SQLite (full rebuild path). */
export function persistPlanningProjectionToSqlite(
  db: SqliteDb,
  projection: PlanningStateProjectionV1,
  options?: { replaceCatalog?: boolean }
): void {
  const replaceCatalog = options?.replaceCatalog !== false;
  if (replaceCatalog && phaseCatalogTableAvailable(db)) {
    db.prepare(`DELETE FROM ${KIT_PHASE_CATALOG_TABLE}`).run();
    for (const row of Object.values(projection.phaseCatalogByKey)) {
      upsertPhaseCatalogRow(db, row.phaseKey, row.shortDescription, row.updatedAt);
    }
  }

  if (!workspaceStatusTableAvailable(db) || !projection.workspaceStatus) {
    return;
  }

  const ws = projection.workspaceStatus;
  const now = ws.updatedAt;
  db.transaction(() => {
    db.prepare(
      `UPDATE kit_workspace_status SET
        workspace_revision = ?,
        current_kit_phase = ?,
        next_kit_phase = ?,
        active_focus = ?,
        last_updated = ?,
        blockers_json = ?,
        pending_decisions_json = ?,
        next_agent_actions_json = ?,
        updated_at = ?
      WHERE id = 1`
    ).run(
      ws.workspaceRevision,
      ws.currentKitPhase,
      ws.nextKitPhase,
      ws.activeFocus,
      ws.lastUpdated,
      JSON.stringify(ws.blockers),
      JSON.stringify(ws.pendingDecisions),
      JSON.stringify(ws.nextAgentActions),
      now
    );
    db.prepare(`DELETE FROM kit_workspace_status_events`).run();
    for (const audit of projection.workspaceStatusAudits) {
      db.prepare(
        `INSERT INTO kit_workspace_status_events (
          created_at, event_kind, actor, command, revision_before, revision_after, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        audit.createdAt,
        audit.eventKind,
        audit.actor,
        audit.command,
        audit.revisionBefore,
        audit.revisionAfter,
        audit.detailsJson
      );
    }
  })();
}

/** Seed planning projection from current SQLite rows (baseline / snapshot paths). */
export function planningProjectionFromSqlite(db: SqliteDb): PlanningStateProjectionV1 {
  const projection: PlanningStateProjectionV1 = {
    schemaVersion: 1,
    phaseCatalogByKey: {},
    workspaceStatus: readKitWorkspaceStatusRow(db),
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set<string>(),
    lastEventSequence: 0,
    lastUpdated: new Date().toISOString()
  };
  if (phaseCatalogTableAvailable(db)) {
    const rows = db
      .prepare(`SELECT phase_key, short_description, updated_at FROM ${KIT_PHASE_CATALOG_TABLE}`)
      .all() as Array<{ phase_key: string; short_description: string | null; updated_at: string }>;
    for (const row of rows) {
      projection.phaseCatalogByKey[row.phase_key] = {
        phaseKey: row.phase_key,
        shortDescription: row.short_description,
        updatedAt: row.updated_at
      };
    }
  }
  return projection;
}
