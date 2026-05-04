import type DatabaseCtor from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { PHASE_JOURNAL_MIN_KIT_USER_VERSION, PHASE_NOTE_LIST_MAX_LIMIT } from "./phase-journal-constants.js";
import { filterOutPassiveExpiredActiveNotes } from "./phase-journal-expiry.js";
import { createPhaseJournalStore } from "./phase-journal-store.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

/** Bounded, body-free summary for phase-status / observability. */
export type PhaseJournalStatusSummary = {
  supported: boolean;
  kitSqliteUserVersion: number;
  phaseKey: string | null;
  activeCriticalNoteCount: number | null;
};

export function buildPhaseJournalStatusSummary(params: {
  db: SqliteDb;
  dbAbsPath: string;
  canonicalPhaseKey: string | null;
  nowMs: number;
}): PhaseJournalStatusSummary {
  const uv = readKitSqliteUserVersion(params.dbAbsPath);
  if (uv < PHASE_JOURNAL_MIN_KIT_USER_VERSION) {
    return {
      supported: false,
      kitSqliteUserVersion: uv,
      phaseKey: params.canonicalPhaseKey,
      activeCriticalNoteCount: null
    };
  }
  if (!params.canonicalPhaseKey) {
    return {
      supported: true,
      kitSqliteUserVersion: uv,
      phaseKey: null,
      activeCriticalNoteCount: null
    };
  }
  const store = createPhaseJournalStore(params.db);
  const rows = filterOutPassiveExpiredActiveNotes(
    store.listNotes({
      phaseKey: params.canonicalPhaseKey,
      status: "active",
      limit: PHASE_NOTE_LIST_MAX_LIMIT
    }),
    false,
    params.nowMs
  );
  const activeCriticalNoteCount = rows.filter((r) => r.priority === "critical").length;
  return {
    supported: true,
    kitSqliteUserVersion: uv,
    phaseKey: params.canonicalPhaseKey,
    activeCriticalNoteCount
  };
}
