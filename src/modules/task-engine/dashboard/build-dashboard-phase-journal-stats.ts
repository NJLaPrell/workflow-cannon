import type DatabaseCtor from "better-sqlite3";
import { isPhaseJournalPersistedOnDb } from "../phase-journal/phase-journal-snapshot-summary.js";
import { filterOutPassiveExpiredActiveNotes } from "../phase-journal/phase-journal-expiry.js";
import { createPhaseJournalStore } from "../phase-journal/phase-journal-store.js";
import type { PhaseNoteRow } from "../phase-journal/phase-journal-types.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

/** Completed delivery tasks in phase before showing journal silence warning. */
export const PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD = 1;

export type DashboardPhaseNoteCountRow = {
  phaseKey: string;
  activeNoteCount: number;
  latestNoteAt: string | null;
};

export type DashboardPhaseJournalStats = {
  schemaVersion: 1;
  available: boolean;
  phases: DashboardPhaseNoteCountRow[];
  currentPhase: {
    phaseKey: string | null;
    activeNoteCount: number;
    completedDeliveryTaskCount: number;
    silenceWarning: boolean;
  };
};

export function buildDashboardPhaseJournalStats(args: {
  db: SqliteDb | null;
  currentKitPhase: string | null | undefined;
  completedDeliveryTaskCount?: number;
}): DashboardPhaseJournalStats {
  const currentKey =
    args.currentKitPhase != null && String(args.currentKitPhase).trim().length > 0
      ? String(args.currentKitPhase).trim()
      : null;
  const completedCount = Math.max(0, args.completedDeliveryTaskCount ?? 0);
  const emptyCurrent = {
    phaseKey: currentKey,
    activeNoteCount: 0,
    completedDeliveryTaskCount: completedCount,
    silenceWarning: false
  };
  const db = args.db;
  if (!db || !isPhaseJournalPersistedOnDb(db)) {
    return { schemaVersion: 1, available: false, phases: [], currentPhase: emptyCurrent };
  }

  const store = createPhaseJournalStore(db);
  const keyRows = db
    .prepare(`SELECT DISTINCT phase_key FROM phase_notes WHERE status = 'active' LIMIT 200`)
    .all() as Array<{ phase_key: string }>;
  const phaseKeys = keyRows.map((r) => String(r.phase_key ?? "").trim()).filter((k) => k.length > 0);
  const grouped =
    phaseKeys.length > 0
      ? store.listNotesGroupedByPhaseKeys({
          phaseKeys,
          status: "active",
          limitPerPhase: 500
        })
      : new Map<string, PhaseNoteRow[]>();
  const nowMs = Date.now();
  const phases: DashboardPhaseNoteCountRow[] = [];
  let currentActive = 0;

  for (const [phaseKey, rawNotes] of grouped.entries()) {
    const rows = filterOutPassiveExpiredActiveNotes(rawNotes, false, nowMs);
    const latestNoteAt =
      rows.length > 0
        ? [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null
        : null;
    phases.push({ phaseKey, activeNoteCount: rows.length, latestNoteAt });
    if (currentKey && phaseKey === currentKey) {
      currentActive = rows.length;
    }
  }

  phases.sort((a, b) => a.phaseKey.localeCompare(b.phaseKey, undefined, { numeric: true }));

  const silenceWarning =
    currentKey !== null &&
    currentActive === 0 &&
    completedCount >= PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD;

  return {
    schemaVersion: 1,
    available: true,
    phases,
    currentPhase: {
      phaseKey: currentKey,
      activeNoteCount: currentActive,
      completedDeliveryTaskCount: completedCount,
      silenceWarning
    }
  };
}
