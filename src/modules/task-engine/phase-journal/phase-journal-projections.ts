import type { PhaseNoteRow } from "./phase-journal-types.js";

/** Bounded JSON for agent-facing phase journal commands (not raw SQLite rows). */
export type PhaseNoteProjection = {
  id: string;
  phaseKey: string;
  phaseLabel: string | null;
  taskId: string | null;
  noteType: string;
  summary: string;
  details: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  supersededBy: string | null;
  convertedTaskId: string | null;
  idempotencyKey: string | null;
  refs: Array<{ type: string; value: string }>;
};

export function projectPhaseNote(row: PhaseNoteRow): PhaseNoteProjection {
  return {
    id: row.id,
    phaseKey: row.phaseKey,
    phaseLabel: row.phaseLabel,
    taskId: row.taskId,
    noteType: row.noteType,
    summary: row.summary,
    details: row.details,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    supersededBy: row.supersededBy,
    convertedTaskId: row.convertedTaskId,
    idempotencyKey: row.idempotencyKey,
    refs: row.refs.map((r) => ({ type: r.refType, value: r.refValue }))
  };
}
