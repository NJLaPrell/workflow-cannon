import { randomUUID } from "node:crypto";
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
import {
  KIT_PHASE_DELIVERY_HISTORY_TABLE,
  listPhaseDeliveryHistory,
  phaseDeliveryHistoryTableAvailable,
  upsertPhaseDeliveryHistory
} from "../persistence/phase-delivery-history-store.js";
import { phaseNoteTaskSuggestionsTableExists } from "../phase-journal/phase-journal-store.js";
import type { PlanningStateProjectionV1 } from "./planning-projection-types.js";
import { MODULE_STATE_PLANNING_SYNC_ALLOWLIST } from "./module-state-planning-sync-allowlist.js";
import type { PlanningSyncDomainId } from "../persistence/planning-canonical-sync-domains.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

function phaseNotesTableAvailable(db: SqliteDb): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'phase_notes'`)
    .get() as { ok: number } | undefined;
  return row !== undefined;
}

function workflowIdeasTableAvailable(db: SqliteDb): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'workflow_ideas'`)
    .get() as { ok: number } | undefined;
  return row !== undefined;
}

function workspaceModuleStateTableAvailable(db: SqliteDb): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'workspace_module_state'`)
    .get() as { ok: number } | undefined;
  return row !== undefined;
}

const insertModuleStateSql = `
INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
VALUES (@module_id, @state_schema_version, @state_json, @updated_at)
ON CONFLICT(module_id) DO UPDATE SET
  state_schema_version=excluded.state_schema_version,
  state_json=excluded.state_json,
  updated_at=excluded.updated_at
`;

const insertWorkflowIdeaSql = `
INSERT INTO workflow_ideas (
  id, title, note, status, sort_order, linked_plan_artifact,
  previous_plan_artifacts_json, created_at, updated_at
) VALUES (
  @id, @title, @note, @status, @sort_order, @linked_plan_artifact,
  @previous_plan_artifacts_json, @created_at, @updated_at
)`;

const insertPhaseNoteSql = `
INSERT INTO phase_notes (
  id, phase_key, phase_label, task_id, author, author_kind, session_id, source_command,
  planning_generation, policy_trace_id, note_type, summary, details, status, priority,
  created_at, updated_at, expires_at, superseded_by, converted_task_id, idempotency_key
) VALUES (
  @id, @phase_key, @phase_label, @task_id, @author, @author_kind, @session_id, @source_command,
  @planning_generation, @policy_trace_id, @note_type, @summary, @details, @status, @priority,
  @created_at, @updated_at, @expires_at, @superseded_by, @converted_task_id, @idempotency_key
)`;

const insertPhaseNoteRefSql = `
INSERT INTO phase_note_refs (id, note_id, ref_type, ref_value)
VALUES (@id, @note_id, @ref_type, @ref_value)
`;

const insertPhaseNoteSuggestionSql = `
INSERT INTO phase_note_task_suggestions (
  id, note_id, title, description, suggested_status, suggested_phase_key, suggested_phase_label,
  suggested_task_type, acceptance_criteria_json, converted_task_id, created_at, updated_at
) VALUES (
  @id, @note_id, @title, @description, @suggested_status, @suggested_phase_key, @suggested_phase_label,
  @suggested_task_type, @acceptance_criteria_json, @converted_task_id, @created_at, @updated_at
)`;

type StoredWorkspaceStatusEventRow = {
  created_at: string;
  event_kind: string;
  actor: string | null;
  command: string | null;
  revision_before: number;
  revision_after: number;
  details_json: string;
};

/** Normalize audit event_kind for kit_workspace_status_events (roster reads set_current_phase). */
export function normalizeWorkspaceStatusEventKind(eventKind: string): string {
  return eventKind === "set-current-phase" ? "set_current_phase" : eventKind;
}

export function previousCurrentKitPhaseFromDetailsJson(detailsJson: string): string | null {
  try {
    const parsed = JSON.parse(detailsJson) as { previousCurrentKitPhase?: unknown };
    if (typeof parsed.previousCurrentKitPhase === "string" && parsed.previousCurrentKitPhase.trim().length > 0) {
      return parsed.previousCurrentKitPhase.trim();
    }
  } catch {
    /* ignore malformed historical rows */
  }
  return null;
}

function readStoredRolloverWorkspaceStatusEvents(db: SqliteDb): StoredWorkspaceStatusEventRow[] {
  if (!workspaceStatusTableAvailable(db)) {
    return [];
  }
  return db
    .prepare(
      `SELECT created_at, event_kind, actor, command, revision_before, revision_after, details_json
       FROM kit_workspace_status_events
       WHERE event_kind = 'set_current_phase'`
    )
    .all() as StoredWorkspaceStatusEventRow[];
}

/** Merge git-replayed audits without dropping local rollover history missing from the canonical stream. */
export function rewriteWorkspaceStatusFromProjection(
  db: SqliteDb,
  projection: PlanningStateProjectionV1,
  preservedRollovers: StoredWorkspaceStatusEventRow[]
): void {
  const ws = projection.workspaceStatus;
  if (!ws) {
    return;
  }
  const now = ws.updatedAt;
  const insertAudit = db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, actor, command, revision_before, revision_after, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
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
    const insertedRolloverPhases = new Set<string>();
    for (const audit of projection.workspaceStatusAudits) {
      const eventKind = normalizeWorkspaceStatusEventKind(audit.eventKind);
      insertAudit.run(
        audit.createdAt,
        eventKind,
        audit.actor,
        audit.command,
        audit.revisionBefore,
        audit.revisionAfter,
        audit.detailsJson
      );
      const prior = previousCurrentKitPhaseFromDetailsJson(audit.detailsJson);
      if (prior && eventKind === "set_current_phase") {
        insertedRolloverPhases.add(prior);
      }
    }
    for (const row of preservedRollovers) {
      const prior = previousCurrentKitPhaseFromDetailsJson(row.details_json);
      if (prior && insertedRolloverPhases.has(prior)) {
        continue;
      }
      insertAudit.run(
        row.created_at,
        row.event_kind,
        row.actor,
        row.command,
        row.revision_before,
        row.revision_after,
        row.details_json
      );
    }
  })();
}

/** Persist in-memory planning projection into kit SQLite (full rebuild path). */
export function persistPlanningProjectionToSqlite(
  db: SqliteDb,
  projection: PlanningStateProjectionV1,
  options?: { replaceCatalog?: boolean; enabledDomains?: ReadonlySet<PlanningSyncDomainId> }
): void {
  const replaceCatalog = options?.replaceCatalog !== false;
  const domainEnabled = (domain: PlanningSyncDomainId): boolean =>
    !options?.enabledDomains || options.enabledDomains.has(domain);

  if (replaceCatalog && domainEnabled("phase_catalog") && phaseCatalogTableAvailable(db)) {
    db.prepare(`DELETE FROM ${KIT_PHASE_CATALOG_TABLE}`).run();
    for (const row of Object.values(projection.phaseCatalogByKey)) {
      upsertPhaseCatalogRow(db, row.phaseKey, row.shortDescription, row.updatedAt);
    }
  }

  if (domainEnabled("phase_notes") && phaseNotesTableAvailable(db)) {
    db.transaction(() => {
      db.prepare(`DELETE FROM phase_note_refs`).run();
      db.prepare(`DELETE FROM phase_notes`).run();

      const insertNote = db.prepare(insertPhaseNoteSql);
      const insertRef = db.prepare(insertPhaseNoteRefSql);
      for (const note of Object.values(projection.phaseNotesById)) {
        insertNote.run({
          id: note.id,
          phase_key: note.phaseKey,
          phase_label: note.phaseLabel,
          task_id: note.taskId,
          author: note.author,
          author_kind: note.authorKind,
          session_id: note.sessionId,
          source_command: note.sourceCommand,
          planning_generation: note.planningGeneration,
          policy_trace_id: note.policyTraceId,
          note_type: note.noteType,
          summary: note.summary,
          details: note.details,
          status: note.status,
          priority: note.priority,
          created_at: note.createdAt,
          updated_at: note.updatedAt,
          expires_at: note.expiresAt,
          superseded_by: note.supersededBy,
          converted_task_id: note.convertedTaskId,
          idempotency_key: note.idempotencyKey
        });
        for (const ref of note.refs) {
          insertRef.run({
            id: ref.id || randomUUID(),
            note_id: note.id,
            ref_type: ref.refType,
            ref_value: ref.refValue
          });
        }
      }
    })();
  }

  if (domainEnabled("phase_note_suggestions") && phaseNotesTableAvailable(db) && phaseNoteTaskSuggestionsTableExists(db)) {
    db.transaction(() => {
      db.prepare(`DELETE FROM phase_note_task_suggestions`).run();
      const insertSuggestion = db.prepare(insertPhaseNoteSuggestionSql);
      for (const suggestion of Object.values(projection.phaseNoteSuggestionsById)) {
        insertSuggestion.run({
          id: suggestion.id,
          note_id: suggestion.noteId,
          title: suggestion.title,
          description: suggestion.description,
          suggested_status: suggestion.suggestedStatus,
          suggested_phase_key: suggestion.suggestedPhaseKey,
          suggested_phase_label: suggestion.suggestedPhaseLabel,
          suggested_task_type: suggestion.suggestedTaskType,
          acceptance_criteria_json: suggestion.acceptanceCriteriaJson,
          converted_task_id: suggestion.convertedTaskId,
          created_at: suggestion.createdAt,
          updated_at: suggestion.updatedAt
        });
      }
    })();
  }

  if (domainEnabled("ideas") && workflowIdeasTableAvailable(db)) {
    db.transaction(() => {
      db.prepare(`DELETE FROM workflow_ideas`).run();
      const insertIdea = db.prepare(insertWorkflowIdeaSql);
      for (const idea of Object.values(projection.ideasById)) {
        insertIdea.run({
          id: idea.id,
          title: idea.title,
          note: idea.note,
          status: idea.status,
          sort_order: idea.sortOrder,
          linked_plan_artifact: idea.linkedPlanArtifact,
          previous_plan_artifacts_json: JSON.stringify(idea.previousPlanArtifacts),
          created_at: idea.createdAt,
          updated_at: idea.updatedAt
        });
      }
    })();
  }

  if (domainEnabled("module_state") && workspaceModuleStateTableAvailable(db)) {
    db.transaction(() => {
      for (const moduleId of MODULE_STATE_PLANNING_SYNC_ALLOWLIST) {
        if (!projection.moduleStateById[moduleId]) {
          db.prepare(`DELETE FROM workspace_module_state WHERE module_id = ?`).run(moduleId);
        }
      }
      const insertModuleState = db.prepare(insertModuleStateSql);
      for (const row of Object.values(projection.moduleStateById)) {
        insertModuleState.run({
          module_id: row.moduleId,
          state_schema_version: row.stateSchemaVersion,
          state_json: JSON.stringify(row.state),
          updated_at: row.updatedAt
        });
      }
    })();
  }

  if (domainEnabled("phase_delivery_history") && phaseDeliveryHistoryTableAvailable(db)) {
    db.transaction(() => {
      db.prepare(`DELETE FROM ${KIT_PHASE_DELIVERY_HISTORY_TABLE}`).run();
      for (const row of Object.values(projection.phaseDeliveryHistoryByKey)) {
        upsertPhaseDeliveryHistory(db, {
          phaseKey: row.phaseKey,
          status: row.status,
          deliveredAt: row.deliveredAt,
          releaseVersion: row.releaseVersion,
          gitTag: row.gitTag,
          githubReleaseUrl: row.githubReleaseUrl,
          npmPackage: row.npmPackage,
          npmDistTag: row.npmDistTag,
          releaseWorkflowUrl: row.releaseWorkflowUrl,
          mainCommitSha: row.mainCommitSha,
          releaseBranch: row.releaseBranch,
          releasePrUrl: row.releasePrUrl,
          evidence: row.evidence,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        });
      }
    })();
  }

  if (domainEnabled("workspace_status") && workspaceStatusTableAvailable(db) && projection.workspaceStatus) {
    const preservedRollovers = readStoredRolloverWorkspaceStatusEvents(db);
    rewriteWorkspaceStatusFromProjection(db, projection, preservedRollovers);
  }
}

function loadPhaseNoteRefs(
  db: SqliteDb,
  noteId: string
): Array<{ id: string; noteId: string; refType: string; refValue: string }> {
  const rows = db
    .prepare(`SELECT id, note_id, ref_type, ref_value FROM phase_note_refs WHERE note_id = ? ORDER BY id`)
    .all(noteId) as Array<{ id: string; note_id: string; ref_type: string; ref_value: string }>;
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    refType: r.ref_type,
    refValue: r.ref_value
  }));
}

/** Seed planning projection from current SQLite rows (baseline / snapshot paths). */
export function planningProjectionFromSqlite(db: SqliteDb): PlanningStateProjectionV1 {
  const projection: PlanningStateProjectionV1 = {
    schemaVersion: 1,
    phaseCatalogByKey: {},
    phaseNotesById: {},
    phaseNoteSuggestionsById: {},
    ideasById: {},
    phaseDeliveryHistoryByKey: {},
    moduleStateById: {},
    workspaceStatus: readKitWorkspaceStatusRow(db),
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set<string>(),
    appliedNoteIdempotencyKeys: new Set<string>(),
    appliedSuggestionMutationIds: new Set<string>(),
    appliedIdeaMutationIds: new Set<string>(),
    appliedPhaseDeliveryHistoryMutationIds: new Set<string>(),
    appliedModuleStateMutationIds: new Set<string>(),
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
  if (phaseNotesTableAvailable(db)) {
    const noteRows = db.prepare(`SELECT * FROM phase_notes`).all() as Record<string, unknown>[];
    for (const row of noteRows) {
      const id = String(row.id);
      projection.phaseNotesById[id] = {
        id,
        phaseKey: String(row.phase_key),
        phaseLabel: row.phase_label == null ? null : String(row.phase_label),
        taskId: row.task_id == null ? null : String(row.task_id),
        author: row.author == null ? null : String(row.author),
        authorKind: row.author_kind == null ? null : String(row.author_kind),
        sessionId: row.session_id == null ? null : String(row.session_id),
        sourceCommand: row.source_command == null ? null : String(row.source_command),
        planningGeneration:
          row.planning_generation == null || row.planning_generation === ""
            ? null
            : Number(row.planning_generation),
        policyTraceId: row.policy_trace_id == null ? null : String(row.policy_trace_id),
        noteType: String(row.note_type),
        summary: String(row.summary),
        details: row.details == null ? null : String(row.details),
        status: String(row.status) as PlanningStateProjectionV1["phaseNotesById"][string]["status"],
        priority: String(row.priority) as PlanningStateProjectionV1["phaseNotesById"][string]["priority"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        expiresAt: row.expires_at == null ? null : String(row.expires_at),
        supersededBy: row.superseded_by == null ? null : String(row.superseded_by),
        convertedTaskId: row.converted_task_id == null ? null : String(row.converted_task_id),
        idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
        refs: loadPhaseNoteRefs(db, id)
      };
    }
  }
  if (phaseNoteTaskSuggestionsTableExists(db)) {
    const suggestionRows = db.prepare(`SELECT * FROM phase_note_task_suggestions`).all() as Record<
      string,
      unknown
    >[];
    for (const row of suggestionRows) {
      const id = String(row.id);
      projection.phaseNoteSuggestionsById[id] = {
        id,
        noteId: String(row.note_id),
        title: String(row.title),
        description: String(row.description),
        suggestedStatus: String(row.suggested_status),
        suggestedPhaseKey: String(row.suggested_phase_key),
        suggestedPhaseLabel: row.suggested_phase_label == null ? null : String(row.suggested_phase_label),
        suggestedTaskType: row.suggested_task_type == null ? null : String(row.suggested_task_type),
        acceptanceCriteriaJson:
          row.acceptance_criteria_json == null ? null : String(row.acceptance_criteria_json),
        convertedTaskId: row.converted_task_id == null ? null : String(row.converted_task_id),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      };
    }
  }
  if (workflowIdeasTableAvailable(db)) {
    const ideaRows = db
      .prepare(`SELECT * FROM workflow_ideas ORDER BY sort_order ASC, id ASC`)
      .all() as Array<{
      id: string;
      title: string;
      note: string | null;
      status: "open" | "planning" | "planned";
      sort_order: number;
      linked_plan_artifact: string | null;
      previous_plan_artifacts_json: string;
      created_at: string;
      updated_at: string;
    }>;
    for (const row of ideaRows) {
      let previousPlanArtifacts: string[] = [];
      try {
        const parsed = JSON.parse(row.previous_plan_artifacts_json) as unknown;
        previousPlanArtifacts = Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string")
          : [];
      } catch {
        previousPlanArtifacts = [];
      }
      projection.ideasById[row.id] = {
        id: row.id,
        title: row.title,
        note: row.note,
        status: row.status,
        sortOrder: row.sort_order,
        linkedPlanArtifact: row.linked_plan_artifact,
        previousPlanArtifacts,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }
  }
  if (workspaceModuleStateTableAvailable(db)) {
    const moduleRows = db
      .prepare(
        `SELECT module_id, state_schema_version, state_json, updated_at FROM workspace_module_state ORDER BY module_id ASC`
      )
      .all() as Array<{
      module_id: string;
      state_schema_version: number;
      state_json: string;
      updated_at: string;
    }>;
    for (const row of moduleRows) {
      let state: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(row.state_json) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          state = parsed as Record<string, unknown>;
        }
      } catch {
        state = {};
      }
      projection.moduleStateById[row.module_id] = {
        moduleId: row.module_id,
        stateSchemaVersion: row.state_schema_version,
        state,
        updatedAt: row.updated_at
      };
    }
  }
  if (phaseDeliveryHistoryTableAvailable(db)) {
    for (const row of listPhaseDeliveryHistory(db, 10000)) {
      projection.phaseDeliveryHistoryByKey[row.phaseKey] = row;
    }
  }
  return projection;
}
