import type { PhaseNoteRefRow, PhaseNoteRow, PhaseNoteTaskSuggestionRow } from "../phase-journal/phase-journal-types.js";
import type {
  PlanningPhaseNoteSnapshotV1,
  PlanningPhaseNoteSuggestionSnapshotV1
} from "./planning-event-payloads.js";

export function phaseNoteRowToEventSnapshot(note: PhaseNoteRow): PlanningPhaseNoteSnapshotV1 {
  return {
    id: note.id,
    phaseKey: note.phaseKey,
    phaseLabel: note.phaseLabel,
    taskId: note.taskId,
    author: note.author,
    authorKind: note.authorKind,
    sessionId: note.sessionId,
    sourceCommand: note.sourceCommand,
    planningGeneration: note.planningGeneration,
    policyTraceId: note.policyTraceId,
    noteType: note.noteType,
    summary: note.summary,
    details: note.details,
    status: note.status,
    priority: note.priority,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    expiresAt: note.expiresAt,
    supersededBy: note.supersededBy,
    convertedTaskId: note.convertedTaskId,
    idempotencyKey: note.idempotencyKey,
    refs: note.refs.map((r) => ({ refType: r.refType, refValue: r.refValue }))
  };
}

export function phaseNoteSuggestionRowToEventSnapshot(
  row: PhaseNoteTaskSuggestionRow
): PlanningPhaseNoteSuggestionSnapshotV1 {
  return {
    id: row.id,
    noteId: row.noteId,
    title: row.title,
    description: row.description,
    suggestedStatus: row.suggestedStatus,
    suggestedPhaseKey: row.suggestedPhaseKey,
    suggestedPhaseLabel: row.suggestedPhaseLabel,
    suggestedTaskType: row.suggestedTaskType,
    acceptanceCriteriaJson: row.acceptanceCriteriaJson,
    convertedTaskId: row.convertedTaskId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function eventSnapshotToPhaseNoteRow(snapshot: PlanningPhaseNoteSnapshotV1): PhaseNoteRow {
  const refs: PhaseNoteRefRow[] = snapshot.refs.map((r, idx) => ({
    id: `${snapshot.id}-ref-${idx}`,
    noteId: snapshot.id,
    refType: r.refType,
    refValue: r.refValue
  }));
  return {
    id: snapshot.id,
    phaseKey: snapshot.phaseKey,
    phaseLabel: snapshot.phaseLabel,
    taskId: snapshot.taskId,
    author: snapshot.author,
    authorKind: snapshot.authorKind,
    sessionId: snapshot.sessionId,
    sourceCommand: snapshot.sourceCommand,
    planningGeneration: snapshot.planningGeneration,
    policyTraceId: snapshot.policyTraceId,
    noteType: snapshot.noteType,
    summary: snapshot.summary,
    details: snapshot.details,
    status: snapshot.status,
    priority: snapshot.priority,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    expiresAt: snapshot.expiresAt,
    supersededBy: snapshot.supersededBy,
    convertedTaskId: snapshot.convertedTaskId,
    idempotencyKey: snapshot.idempotencyKey,
    refs
  };
}

export function eventSnapshotToPhaseNoteSuggestionRow(
  snapshot: PlanningPhaseNoteSuggestionSnapshotV1
): PhaseNoteTaskSuggestionRow {
  return {
    id: snapshot.id,
    noteId: snapshot.noteId,
    title: snapshot.title,
    description: snapshot.description,
    suggestedStatus: snapshot.suggestedStatus,
    suggestedPhaseKey: snapshot.suggestedPhaseKey,
    suggestedPhaseLabel: snapshot.suggestedPhaseLabel,
    suggestedTaskType: snapshot.suggestedTaskType,
    acceptanceCriteriaJson: snapshot.acceptanceCriteriaJson,
    convertedTaskId: snapshot.convertedTaskId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  };
}
