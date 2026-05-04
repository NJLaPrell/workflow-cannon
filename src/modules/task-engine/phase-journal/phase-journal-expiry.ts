import type { PhaseNoteRow } from "./phase-journal-types.js";

/** True when `expiresAt` parses to a finite instant strictly before `nowMs`. */
export function phaseNoteExpiryElapsed(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (expiresAt == null || !String(expiresAt).trim()) {
    return false;
  }
  const t = Date.parse(String(expiresAt).trim());
  return Number.isFinite(t) && t < nowMs;
}

/** Active row still in DB but past `expires_at` — hidden from default “active” surfaces unless opted in. */
export function isPassivelyExpiredActiveNote(note: PhaseNoteRow, nowMs: number): boolean {
  return note.status === "active" && phaseNoteExpiryElapsed(note.expiresAt, nowMs);
}

export function filterOutPassiveExpiredActiveNotes(notes: PhaseNoteRow[], includeExpired: boolean, nowMs: number): PhaseNoteRow[] {
  if (includeExpired) {
    return notes;
  }
  return notes.filter((n) => !isPassivelyExpiredActiveNote(n, nowMs));
}

/** Reject unparseable or already-elapsed expiry timestamps on writes (add / update / run-transition notes). */
export function validatePhaseNoteExpiresAtForWrite(
  expiresAt: string | null | undefined,
  nowMs: number
): { ok: true } | { ok: false; message: string } {
  if (expiresAt == null || !String(expiresAt).trim()) {
    return { ok: true };
  }
  const t = Date.parse(String(expiresAt).trim());
  if (!Number.isFinite(t)) {
    return { ok: false, message: "expiresAt must be a parseable ISO-8601 timestamp when provided." };
  }
  if (t < nowMs) {
    return { ok: false, message: "expiresAt must be at or after the current instant." };
  }
  return { ok: true };
}
