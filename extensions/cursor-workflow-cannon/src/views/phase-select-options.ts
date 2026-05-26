/**
 * Phase dropdown labels and ordering for Dashboard assign-phase flows.
 */

import { parseLeadingPhaseOrdinalFromKey } from "./phase-roster-display.js";

export const ASSIGN_PHASE_CUSTOM = "__custom__";
export const ASSIGN_PHASE_BACKLOG = "__backlog__";

export type PhaseKeySuggestion = {
  phaseKey: string;
  /** Display label for select options (Phase N or Phase N - description). */
  label: string;
  shortDescription?: string | null;
};

/** User-facing label: `Phase N - Short description` or `Phase N` when N is the leading numeric segment. */
export function formatPhaseSelectLabel(phaseKey: string, shortDescription?: string | null): string {
  const k = phaseKey.trim();
  if (!k.length) {
    return "Phase";
  }
  const ord = parseLeadingPhaseOrdinalFromKey(k);
  const base = ord !== null ? `Phase ${String(ord)}` : `Phase ${k}`;
  const sd = typeof shortDescription === "string" ? shortDescription.trim() : "";
  return sd.length > 0 ? `${base} - ${sd}` : base;
}

export function comparePhaseKeysDescending(a: string, b: string): number {
  const oa = parseLeadingPhaseOrdinalFromKey(a);
  const ob = parseLeadingPhaseOrdinalFromKey(b);
  if (oa !== null && ob !== null) {
    return ob - oa;
  }
  if (oa !== null) {
    return -1;
  }
  if (ob !== null) {
    return 1;
  }
  return b.localeCompare(a, undefined, { numeric: true });
}

/** Queue phase-filter ordering: release date descending, then phase key descending. */
export function compareQueuePhaseFilterValues(
  a: string,
  b: string,
  releaseDates?: Readonly<Record<string, string>>
): number {
  if (a === "__no_phase__") {
    return 1;
  }
  if (b === "__no_phase__") {
    return -1;
  }
  const dateA = releaseDates?.[a];
  const dateB = releaseDates?.[b];
  if (dateA && dateB && dateA !== dateB) {
    return dateB.localeCompare(dateA);
  }
  const ordCmp = comparePhaseKeysDescending(a, b);
  if (ordCmp !== 0) {
    return ordCmp;
  }
  if (dateA && !dateB) {
    return -1;
  }
  if (!dateA && dateB) {
    return 1;
  }
  return 0;
}

export function sortPhaseKeySuggestions(suggestions: readonly PhaseKeySuggestion[]): PhaseKeySuggestion[] {
  return [...suggestions].sort((x, y) => comparePhaseKeysDescending(x.phaseKey, y.phaseKey));
}

export function buildPhaseKeySuggestion(
  phaseKey: string,
  shortDescription?: string | null
): PhaseKeySuggestion {
  const k = phaseKey.trim();
  return {
    phaseKey: k,
    shortDescription: shortDescription ?? null,
    label: formatPhaseSelectLabel(k, shortDescription)
  };
}
