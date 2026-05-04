/**
 * Versioned read-model shapes for phase journal CLI projections (list-phase-notes,
 * get-phase-context, propose-tasks-from-phase-notes, get-next-actions `phaseContext`,
 * agent-session-snapshot `phaseJournal`). Bounded array sizes match
 * `phase-journal-constants.ts` / `phase-journal-snapshot-summary.ts`; string caps for
 * notes match `PHASE_NOTE_SUMMARY_MAX` / `PHASE_NOTE_DETAILS_MAX` in kit code.
 */

/** Small note row used in `get-next-actions` phaseContext and snapshot `topNotes`. */
export type AgentPhaseJournalHintNote = {
  id: string;
  noteType: string;
  priority: string;
  summary: string;
};

/**
 * Non-authoritative phase journal facet on `get-next-actions` `data`.
 * Omitted when phase is unknown or kit SQLite lacks phase journal DDL.
 */
export type AgentNextActionsPhaseContext = {
  phaseKey: string;
  relevantNotes: AgentPhaseJournalHintNote[];
  taskSuggestionsFromNotes: AgentPhaseJournalHintNote[];
};

/** Alias: snapshot top rows reuse the same hint shape as next-actions rows. */
export type AgentPhaseJournalSnapshotTopNote = AgentPhaseJournalHintNote;

/** Bounded summary on `agent-session-snapshot` / `agent-bootstrap` when phase + DDL allow. */
export type AgentPhaseJournalSnapshotBlock = {
  phaseKey: string;
  phaseLabel: string | null;
  activeNoteCount: number;
  criticalCount: number;
  openFollowUpCount: number;
  topNotes: AgentPhaseJournalSnapshotTopNote[];
};

export type AgentPhaseNoteProjectionRef = {
  type: string;
  value: string;
};

/** Stable projection for `list-phase-notes`, `get-phase-context`, etc. */
export type AgentPhaseNoteProjection = {
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
  refs: AgentPhaseNoteProjectionRef[];
};

/** Row shape returned when `propose-tasks-from-phase-notes` persists suggestions (v20+). */
export type AgentPhaseNoteTaskSuggestionProjection = {
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
