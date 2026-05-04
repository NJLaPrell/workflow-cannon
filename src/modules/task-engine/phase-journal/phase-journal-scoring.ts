import type { PhaseNoteRow } from "./phase-journal-types.js";

export type PhaseContextScoreInput = {
  phaseKey: string;
  taskId?: string;
  refKeys: Set<string>;
};

/** Deterministic relevance score for `get-phase-context` (PHASE_JOURNAL.md). */
export function scorePhaseNoteForContext(note: PhaseNoteRow, ctx: PhaseContextScoreInput): number {
  let score = 0;
  if (ctx.taskId && note.taskId === ctx.taskId) {
    score += 100;
  }
  for (const r of note.refs) {
    const key = `${r.refType}:${r.refValue}`;
    if (ctx.refKeys.has(key)) {
      if (r.refType === "module") {
        score += 40;
      } else if (r.refType === "file") {
        score += 30;
      } else {
        score += 15;
      }
    }
  }
  if (note.status === "active" && (note.noteType === "blocker" || note.noteType === "risk")) {
    score += 25;
  }
  if (note.priority === "critical") {
    score += 35;
  } else if (note.priority === "high") {
    score += 20;
  }
  const created = Date.parse(note.createdAt);
  if (!Number.isNaN(created)) {
    const days = (Date.now() - created) / (86400 * 1000);
    if (days <= 7) {
      score += 15;
    }
  }
  if (
    note.noteType === "decision" ||
    note.noteType === "gotcha" ||
    note.noteType === "risk" ||
    note.noteType === "reusable-context" ||
    note.noteType === "follow-up"
  ) {
    score += 10;
  }
  return score;
}

export function sortPhaseNotesForContext(notes: PhaseNoteRow[], ctx: PhaseContextScoreInput): PhaseNoteRow[] {
  const scored = notes.map((n) => ({ n, s: scorePhaseNoteForContext(n, ctx) }));
  scored.sort((a, b) => {
    if (b.s !== a.s) {
      return b.s - a.s;
    }
    const ta = Date.parse(a.n.createdAt);
    const tb = Date.parse(b.n.createdAt);
    if (tb !== ta) {
      return tb - ta;
    }
    return a.n.id.localeCompare(b.n.id);
  });
  return scored.map((x) => x.n);
}

const SNAPSHOT_PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1
};

/** Top-note ordering for agent-session-snapshot (priority, recency, id). */
export function sortPhaseNotesForSnapshotTop(notes: PhaseNoteRow[]): PhaseNoteRow[] {
  const rank = (p: string) => SNAPSHOT_PRIORITY_RANK[p] ?? 2;
  return [...notes].sort((a, b) => {
    const pr = rank(b.priority) - rank(a.priority);
    if (pr !== 0) {
      return pr;
    }
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (tb !== ta) {
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    }
    return a.id.localeCompare(b.id);
  });
}
