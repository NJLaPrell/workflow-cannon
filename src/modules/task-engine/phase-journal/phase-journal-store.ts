import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  CreatePhaseNoteInput,
  CreatePhaseNoteResult,
  ListPhaseNotesFilter,
  PhaseNotePriority,
  PhaseNoteRefRow,
  PhaseNoteRow,
  PhaseNoteStatus
} from "./phase-journal-types.js";

type SqliteDb = InstanceType<typeof Database>;

function mapNote(row: Record<string, unknown>, refs: PhaseNoteRefRow[]): PhaseNoteRow {
  return {
    id: String(row.id),
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
    status: String(row.status) as PhaseNoteStatus,
    priority: String(row.priority) as PhaseNotePriority,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    supersededBy: row.superseded_by == null ? null : String(row.superseded_by),
    convertedTaskId: row.converted_task_id == null ? null : String(row.converted_task_id),
    idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
    refs
  };
}

function loadRefs(db: SqliteDb, noteId: string): PhaseNoteRefRow[] {
  const rows = db
    .prepare(
      `SELECT id, note_id, ref_type, ref_value FROM phase_note_refs WHERE note_id = ? ORDER BY id`
    )
    .all(noteId) as Array<{ id: string; note_id: string; ref_type: string; ref_value: string }>;
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    refType: r.ref_type,
    refValue: r.ref_value
  }));
}

function getNoteById(db: SqliteDb, id: string): PhaseNoteRow | null {
  const row = db.prepare(`SELECT * FROM phase_notes WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return null;
  }
  return mapNote(row, loadRefs(db, id));
}

const insertPhaseNoteSql = `
INSERT INTO phase_notes (
  id, phase_key, phase_label, task_id, author, author_kind, session_id, source_command,
  planning_generation, policy_trace_id, note_type, summary, details, status, priority,
  created_at, updated_at, expires_at, superseded_by, converted_task_id, idempotency_key
) VALUES (
  @id, @phase_key, @phase_label, @task_id, @author, @author_kind, @session_id, @source_command,
  @planning_generation, @policy_trace_id, @note_type, @summary, @details, @status, @priority,
  @created_at, @updated_at, @expires_at, NULL, NULL, @idempotency_key
)`;

const insertPhaseNoteRefSql = `
INSERT INTO phase_note_refs (id, note_id, ref_type, ref_value)
VALUES (@id, @note_id, @ref_type, @ref_value)
`;

/**
 * Insert one phase note (+ refs). Caller supplies an outer transaction when needed.
 * Idempotent when `idempotencyKey` matches an existing row (same as {@link PhaseJournalStore#createNoteIdempotent}).
 */
export function insertPhaseNoteInConnection(db: SqliteDb, input: CreatePhaseNoteInput): CreatePhaseNoteResult {
  const now = new Date().toISOString();
  const status: PhaseNoteStatus = input.status ?? "active";
  const priority: PhaseNotePriority = input.priority ?? "normal";
  const refs = input.refs ?? [];

  if (input.idempotencyKey) {
    const existing = db
      .prepare(`SELECT id FROM phase_notes WHERE idempotency_key = ?`)
      .get(input.idempotencyKey) as { id: string } | undefined;
    if (existing) {
      const note = getNoteById(db, existing.id);
      if (!note) {
        throw new Error("phase journal: idempotency hit but note row missing");
      }
      return { created: false, note };
    }
  }

  const id = randomUUID();
  const insert = db.prepare(insertPhaseNoteSql);
  const insertRef = db.prepare(insertPhaseNoteRefSql);

  insert.run({
    id,
    phase_key: input.phaseKey,
    phase_label: input.phaseLabel ?? null,
    task_id: input.taskId ?? null,
    author: input.author ?? null,
    author_kind: input.authorKind ?? null,
    session_id: input.sessionId ?? null,
    source_command: input.sourceCommand ?? null,
    planning_generation: input.planningGeneration ?? null,
    policy_trace_id: input.policyTraceId ?? null,
    note_type: input.noteType,
    summary: input.summary,
    details: input.details ?? null,
    status,
    priority,
    created_at: now,
    updated_at: now,
    expires_at: input.expiresAt ?? null,
    idempotency_key: input.idempotencyKey ?? null
  });
  for (const r of refs) {
    insertRef.run({
      id: randomUUID(),
      note_id: id,
      ref_type: r.refType,
      ref_value: r.refValue
    });
  }

  const note = getNoteById(db, id);
  if (!note) {
    throw new Error("phase journal: insert succeeded but note not readable");
  }
  return { created: true, note };
}

export class PhaseJournalStore {
  constructor(private readonly db: SqliteDb) {}

  getById(noteId: string): PhaseNoteRow | null {
    return getNoteById(this.db, noteId);
  }

  /**
   * Insert a note and refs, or return the existing row when `idempotencyKey` matches.
   */
  createNoteIdempotent(input: CreatePhaseNoteInput): CreatePhaseNoteResult {
    return this.db.transaction(() => insertPhaseNoteInConnection(this.db, input))();
  }

  listNotes(filter: ListPhaseNotesFilter): PhaseNoteRow[] {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const clauses: string[] = ["phase_key = ?"];
    const params: unknown[] = [filter.phaseKey];
    if (filter.status !== undefined) {
      if (Array.isArray(filter.status)) {
        if (filter.status.length === 0) {
          return [];
        }
        clauses.push(`status IN (${filter.status.map(() => "?").join(", ")})`);
        params.push(...filter.status);
      } else {
        clauses.push("status = ?");
        params.push(filter.status);
      }
    }
    const sql = `
SELECT * FROM phase_notes
WHERE ${clauses.join(" AND ")}
ORDER BY created_at DESC
LIMIT ${limit}
`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => mapNote(row, loadRefs(this.db, String(row.id))));
  }

  dismissNote(noteId: string): PhaseNoteRow | null {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `UPDATE phase_notes SET status = 'dismissed', updated_at = ? WHERE id = ? AND status != 'dismissed'`
      )
      .run(now, noteId);
    if (res.changes === 0) {
      return getNoteById(this.db, noteId);
    }
    return getNoteById(this.db, noteId);
  }

  supersedeNote(fromNoteId: string, supersededByNoteId: string): PhaseNoteRow | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE phase_notes SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ?`
      )
      .run(supersededByNoteId, now, fromNoteId);
    return getNoteById(this.db, fromNoteId);
  }
}

export function createPhaseJournalStore(db: SqliteDb): PhaseJournalStore {
  return new PhaseJournalStore(db);
}
