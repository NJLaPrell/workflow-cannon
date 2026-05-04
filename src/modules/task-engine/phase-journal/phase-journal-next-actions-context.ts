import type Database from "better-sqlite3";
import {
  PHASE_CONTEXT_NEXT_ACTIONS_RELEVANT_MAX,
  PHASE_CONTEXT_NEXT_ACTIONS_SUGGESTIONS_MAX
} from "./phase-journal-constants.js";
import { createPhaseJournalStore } from "./phase-journal-store.js";
import { sortPhaseNotesForContext } from "./phase-journal-scoring.js";
import { isPhaseJournalPersistedOnDb } from "./phase-journal-snapshot-summary.js";

type SqliteDb = InstanceType<typeof Database>;

export type NextActionsPhaseContextNote = {
  id: string;
  noteType: string;
  priority: string;
  summary: string;
};

export type NextActionsPhaseContext = {
  phaseKey: string;
  relevantNotes: NextActionsPhaseContextNote[];
  taskSuggestionsFromNotes: NextActionsPhaseContextNote[];
};

/**
 * Non-authoritative phase journal facet for `get-next-actions`.
 * Does not alter ready queue ordering — advisory context only.
 */
export function buildNextActionsPhaseContext(
  db: SqliteDb,
  phaseKey: string | null | undefined,
  suggestedTaskId: string | undefined
): NextActionsPhaseContext | null {
  if (!phaseKey || !String(phaseKey).trim()) {
    return null;
  }
  const key = String(phaseKey).trim();
  if (!isPhaseJournalPersistedOnDb(db)) {
    return null;
  }
  const store = createPhaseJournalStore(db);
  const pool = store.listNotes({ phaseKey: key, status: "active", limit: 200 });
  const ranked = sortPhaseNotesForContext(pool, {
    phaseKey: key,
    taskId: suggestedTaskId,
    refKeys: new Set()
  });
  const relevantNotes: NextActionsPhaseContextNote[] = ranked
    .slice(0, PHASE_CONTEXT_NEXT_ACTIONS_RELEVANT_MAX)
    .map((n) => ({
      id: n.id,
      noteType: n.noteType,
      priority: n.priority,
      summary: n.summary
    }));

  const suggestionCandidates = pool
    .filter((n) => n.noteType === "task-suggestion" || n.noteType === "follow-up")
    .sort((a, b) => {
      const tb = Date.parse(b.createdAt);
      const ta = Date.parse(a.createdAt);
      if (tb !== ta) {
        return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
      }
      return a.id.localeCompare(b.id);
    });
  const taskSuggestionsFromNotes: NextActionsPhaseContextNote[] = suggestionCandidates
    .slice(0, PHASE_CONTEXT_NEXT_ACTIONS_SUGGESTIONS_MAX)
    .map((n) => ({
      id: n.id,
      noteType: n.noteType,
      priority: n.priority,
      summary: n.summary
    }));

  return {
    phaseKey: key,
    relevantNotes,
    taskSuggestionsFromNotes
  };
}
