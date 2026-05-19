import type DatabaseCtor from "better-sqlite3";
import { parseLeadingPhaseOrdinal } from "../phase-resolution.js";
import { filterOutPassiveExpiredActiveNotes } from "../phase-journal/phase-journal-expiry.js";
import {
  PHASE_JOURNAL_MIN_KIT_USER_VERSION,
  PHASE_NOTE_LIST_DEFAULT_LIMIT
} from "../phase-journal/phase-journal-constants.js";
import { projectPhaseNote, type PhaseNoteProjection } from "../phase-journal/phase-journal-projections.js";
import { createPhaseJournalStore } from "../phase-journal/phase-journal-store.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

export const DASHBOARD_PAST_PHASE_NOTES_MAX_KEYS = 120;
export const DASHBOARD_PAST_PHASE_NOTES_ROW_CAP = 2000;

export type DashboardPastPhaseNotesEntry = {
  phaseKey: string;
  notes: PhaseNoteProjection[];
};

function readKitUserVersion(db: SqliteDb): number {
  const raw = db.pragma("user_version", { simple: true });
  return typeof raw === "number" ? raw : Number(raw);
}

function phaseJournalTableExists(db: SqliteDb): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'phase_notes'`)
    .get() as { ok: number } | undefined;
  return row !== undefined;
}

/** Workspace ordinals strictly before `currentKitPhase` (matches dashboard extension rollup). */
export function derivePastPhaseKeysFromCatalog(
  phases: readonly { phaseKey?: string | null }[],
  currentKitPhase: string | null | undefined
): string[] {
  const curOrd = parseLeadingPhaseOrdinal(
    currentKitPhase != null ? String(currentKitPhase).trim() : ""
  );
  if (curOrd === null) {
    return [];
  }
  const keys: string[] = [];
  for (const entry of phases) {
    const pk = entry?.phaseKey != null ? String(entry.phaseKey).trim() : "";
    if (!pk) {
      continue;
    }
    const ord = parseLeadingPhaseOrdinal(pk);
    if (ord !== null && ord < curOrd) {
      keys.push(pk);
    }
  }
  keys.sort((a, b) => {
    const oa = parseLeadingPhaseOrdinal(a);
    const ob = parseLeadingPhaseOrdinal(b);
    if (oa !== null && ob !== null && oa !== ob) {
      return oa - ob;
    }
    return a.localeCompare(b);
  });
  return keys.slice(0, DASHBOARD_PAST_PHASE_NOTES_MAX_KEYS);
}

export function buildDashboardPastPhaseNotes(args: {
  db: SqliteDb | null;
  phaseCatalogPhases: readonly { phaseKey?: string | null }[];
  currentKitPhase: string | null | undefined;
}): DashboardPastPhaseNotesEntry[] {
  const db = args.db;
  if (!db || !phaseJournalTableExists(db) || readKitUserVersion(db) < PHASE_JOURNAL_MIN_KIT_USER_VERSION) {
    return [];
  }
  const pastKeys = derivePastPhaseKeysFromCatalog(args.phaseCatalogPhases, args.currentKitPhase);
  if (pastKeys.length === 0) {
    return [];
  }
  const store = createPhaseJournalStore(db);
  const grouped = store.listNotesGroupedByPhaseKeys({
    phaseKeys: pastKeys,
    status: "active",
    limitPerPhase: PHASE_NOTE_LIST_DEFAULT_LIMIT,
    rowCap: DASHBOARD_PAST_PHASE_NOTES_ROW_CAP
  });
  const now = Date.now();
  const out: DashboardPastPhaseNotesEntry[] = [];
  for (const phaseKey of pastKeys) {
    let rows = grouped.get(phaseKey) ?? [];
    rows = filterOutPassiveExpiredActiveNotes(rows, false, now);
    if (rows.length === 0) {
      continue;
    }
    out.push({ phaseKey, notes: rows.map(projectPhaseNote) });
  }
  return out;
}
