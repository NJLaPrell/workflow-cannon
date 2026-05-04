/** MVP limits from PHASE_JOURNAL.md */
export const PHASE_NOTE_SUMMARY_MAX = 280;
export const PHASE_NOTE_DETAILS_MAX = 1200;
export const PHASE_NOTE_REFS_MAX = 10;
export const PHASE_NOTE_LIST_DEFAULT_LIMIT = 8;
export const PHASE_NOTE_LIST_MAX_LIMIT = 50;
export const PHASE_JOURNAL_MIN_KIT_USER_VERSION = 19;

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

/** `get-next-actions` phaseContext: relevance-ranked notes (non-authoritative). */
export const PHASE_CONTEXT_NEXT_ACTIONS_RELEVANT_MAX = 8;
/** `get-next-actions` phaseContext: follow-up / task-suggestion rows. */
export const PHASE_CONTEXT_NEXT_ACTIONS_SUGGESTIONS_MAX = 5;
