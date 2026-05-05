import type { PhaseNoteRow, PhaseNoteTaskSuggestionRow } from "./phase-journal-types.js";

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

export type PhaseNoteTaskSuggestionProjection = {
  id: string;
  noteId: string;
  title: string;
  description: string;
  suggestedStatus: string;
  suggestedPhaseKey: string;
  suggestedPhaseLabel: string | null;
  suggestedTaskType: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function projectPhaseNoteTaskSuggestion(row: PhaseNoteTaskSuggestionRow): PhaseNoteTaskSuggestionProjection {
  return {
    id: row.id,
    noteId: row.noteId,
    title: row.title,
    description: row.description,
    suggestedStatus: row.suggestedStatus,
    suggestedPhaseKey: row.suggestedPhaseKey,
    suggestedPhaseLabel: row.suggestedPhaseLabel,
    suggestedTaskType: row.suggestedTaskType,
    convertedTaskId: row.convertedTaskId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
