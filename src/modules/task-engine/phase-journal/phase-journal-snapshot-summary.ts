import type Database from "better-sqlite3";
import { PHASE_JOURNAL_MIN_KIT_USER_VERSION } from "./phase-journal-constants.js";
import { createPhaseJournalStore } from "./phase-journal-store.js";
import { sortPhaseNotesForSnapshotTop } from "./phase-journal-scoring.js";

type SqliteDb = InstanceType<typeof Database>;

function readKitUserVersion(db: SqliteDb): number {
  const raw = db.pragma("user_version", { simple: true });
  return typeof raw === "number" ? raw : Number(raw);
}

function phaseNotesTableExists(db: SqliteDb): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'phase_notes'")
    .get() as { ok: number } | undefined;
  return Boolean(row?.ok);
}

/** Default cap for `topNotes` in agent-session-snapshot (PHASE_JOURNAL.md). */
export const PHASE_JOURNAL_SNAPSHOT_TOP_NOTES = 3;

export type PhaseJournalSnapshotTopNote = {
  id: string;
  noteType: string;
  priority: string;
  summary: string;
};

export type PhaseJournalSnapshotBlock = {
  phaseKey: string;
  phaseLabel: string | null;
  activeNoteCount: number;
  criticalCount: number;
  openFollowUpCount: number;
  topNotes: PhaseJournalSnapshotTopNote[];
};

/**
 * Bounded phase journal summary for `agent-session-snapshot` / `agent-bootstrap`.
 * Returns `null` when phase is unknown, kit SQLite is below v19, or tables are absent.
 */
export function buildPhaseJournalSnapshotSummary(
  db: SqliteDb,
  phaseKey: string | null | undefined
): PhaseJournalSnapshotBlock | null {
  if (!phaseKey || !String(phaseKey).trim()) {
    return null;
  }
  const key = String(phaseKey).trim();
  if (readKitUserVersion(db) < PHASE_JOURNAL_MIN_KIT_USER_VERSION || !phaseNotesTableExists(db)) {
    return null;
  }
  const store = createPhaseJournalStore(db);
  const notes = store.listNotes({ phaseKey: key, status: "active", limit: 500 });
  const activeNoteCount = notes.length;
  const criticalCount = notes.filter((n) => n.priority === "critical").length;
  const openFollowUpCount = notes.filter(
    (n) => n.noteType === "follow-up" || n.noteType === "task-suggestion"
  ).length;
  const phaseLabel = notes.map((n) => n.phaseLabel).find((l) => l && l.trim()) ?? null;
  const sorted = sortPhaseNotesForSnapshotTop(notes);
  const topNotes: PhaseJournalSnapshotTopNote[] = sorted.slice(0, PHASE_JOURNAL_SNAPSHOT_TOP_NOTES).map((n) => ({
    id: n.id,
    noteType: n.noteType,
    priority: n.priority,
    summary: n.summary
  }));
  return {
    phaseKey: key,
    phaseLabel,
    activeNoteCount,
    criticalCount,
    openFollowUpCount,
    topNotes
  };
}
