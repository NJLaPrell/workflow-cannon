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
import { phaseNoteTaskSuggestionsTableExists } from "../phase-journal/phase-journal-store.js";
import type { PlanningStateProjectionV1 } from "./planning-projection-types.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

function phaseNotesTableAvailable(db: SqliteDb): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'phase_notes'`)
    .get() as { ok: number } | undefined;
  return row !== undefined;
}

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

  if (phaseNotesTableAvailable(db)) {
    db.transaction(() => {
      db.prepare(`DELETE FROM phase_note_refs`).run();
      if (phaseNoteTaskSuggestionsTableExists(db)) {
        db.prepare(`DELETE FROM phase_note_task_suggestions`).run();
      }
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

      if (phaseNoteTaskSuggestionsTableExists(db)) {
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
      }
    })();
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
    workspaceStatus: readKitWorkspaceStatusRow(db),
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set<string>(),
    appliedNoteIdempotencyKeys: new Set<string>(),
    appliedSuggestionMutationIds: new Set<string>(),
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
  return projection;
}
