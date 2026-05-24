/** Phase journal field limits and enums (canonical; see task-engine instructions). */
export const PHASE_NOTE_SUMMARY_MAX = 280;
export const PHASE_NOTE_DETAILS_MAX = 1200;
export const PHASE_NOTE_REFS_MAX = 10;
export const PHASE_NOTE_LIST_DEFAULT_LIMIT = 8;
export const PHASE_NOTE_LIST_MAX_LIMIT = 50;
export const PHASE_JOURNAL_MIN_KIT_USER_VERSION = 19;
/** Kit SQLite DDL for `phase_note_task_suggestions` (T100034). */
export const PHASE_NOTE_TASK_SUGGESTIONS_MIN_KIT_USER_VERSION = 20;

/** Max notes accepted on a single `run-transition` (bounded advisory batch). */
export const PHASE_NOTES_RUN_TRANSITION_MAX = 20;

export const PHASE_NOTE_TYPES = new Set([
  "finding",
  "gotcha",
  "decision",
  "blocker",
  "follow-up",
  "task-suggestion",
  "risk",
  "reusable-context"
]);

export const PHASE_NOTE_REF_TYPES = new Set([
  "file",
  "command",
  "task",
  "module",
  "doc",
  "decision",
  "test",
  "generated-artifact"
]);

export const PHASE_NOTE_PRIORITIES = new Set(["low", "normal", "high", "critical"]);

export const PHASE_NOTE_STATUSES = new Set([
  "active",
  "converted",
  "superseded",
  "dismissed",
  "expired"
]);

/** Notes eligible for `convert-phase-note-to-task` (proposal harvest). */
export const PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK = new Set(["task-suggestion", "follow-up"]);

/** `get-next-actions` phaseContext: relevance-ranked notes (non-authoritative). */
export const PHASE_CONTEXT_NEXT_ACTIONS_RELEVANT_MAX = 8;
/** `get-next-actions` phaseContext: follow-up / task-suggestion rows. */
export const PHASE_CONTEXT_NEXT_ACTIONS_SUGGESTIONS_MAX = 5;
