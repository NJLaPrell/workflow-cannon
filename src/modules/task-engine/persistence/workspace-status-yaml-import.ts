import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { TaskEngineError } from "../transitions.js";
import {
  WORKSPACE_KIT_STATUS_YAML_RELATIVE,
  parseWorkspaceKitStatusYaml,
  type WorkspaceStatusSnapshot
} from "../dashboard/dashboard-status.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

function snapshotToRowFields(s: WorkspaceStatusSnapshot): {
  current_kit_phase: string | null;
  next_kit_phase: string | null;
  active_focus: string | null;
  last_updated: string | null;
  blockers_json: string;
  pending_decisions_json: string;
  next_agent_actions_json: string;
} {
  return {
    current_kit_phase: s.currentKitPhase,
    next_kit_phase: s.nextKitPhase,
    active_focus: s.activeFocus,
    last_updated: s.lastUpdated,
    blockers_json: JSON.stringify(s.blockers),
    pending_decisions_json: JSON.stringify(s.pendingDecisions),
    next_agent_actions_json: JSON.stringify(s.nextAgentActions)
  };
}

/**
 * One-time import from maintainer YAML into `kit_workspace_status` when revision is still 0.
 * YAML row content is authoritative for this seed; `kit.currentPhaseNumber` is not consulted (config is a non-canonical hint).
 */
export function syncWorkspaceKitStatusFromYamlIfNeeded(workspacePath: string, db: SqliteDb): void {
  const dbPath = db.name;
  let uv = 0;
  try {
    uv = readKitSqliteUserVersion(dbPath);
  } catch {
    return;
  }
  if (uv < 10) {
    return;
  }

  const row = db
    .prepare(
      "SELECT workspace_revision AS r, current_kit_phase AS c FROM kit_workspace_status WHERE id = 1"
    )
    .get() as { r: number; c: string | null } | undefined;
  if (!row) {
    return;
  }
  const rev = Number(row.r) || 0;
  if (rev > 0) {
    return;
  }

  const yamlAbs = path.join(workspacePath, WORKSPACE_KIT_STATUS_YAML_RELATIVE);
  if (!fs.existsSync(yamlAbs)) {
    return;
  }

  let rawYaml: string;
  try {
    rawYaml = fs.readFileSync(yamlAbs, "utf8");
  } catch (e) {
    throw new TaskEngineError(
      "storage-read-error",
      `Cannot read ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}: ${(e as Error).message}`
    );
  }

  const snap = parseWorkspaceKitStatusYaml(rawYaml);

  const f = snapshotToRowFields(snap);
  const now = new Date().toISOString();
  const details = JSON.stringify({
    yamlRelativePath: WORKSPACE_KIT_STATUS_YAML_RELATIVE,
    importedAt: now
  });

  db.transaction(() => {
    db.prepare(
      `UPDATE kit_workspace_status SET
        workspace_revision = 1,
        current_kit_phase = @current_kit_phase,
        next_kit_phase = @next_kit_phase,
        active_focus = @active_focus,
        last_updated = @last_updated,
        blockers_json = @blockers_json,
        pending_decisions_json = @pending_decisions_json,
        next_agent_actions_json = @next_agent_actions_json,
        updated_at = @updated_at
      WHERE id = 1`
    ).run({
      ...f,
      updated_at: now
    });
    db.prepare(
      `INSERT INTO kit_workspace_status_events (
        created_at, event_kind, actor, command, revision_before, revision_after, details_json
      ) VALUES (?, 'yaml_seed_import', 'workspace-kit', 'sqlite-open-migration', 0, 1, ?)`
    ).run(now, details);
  })();
}
