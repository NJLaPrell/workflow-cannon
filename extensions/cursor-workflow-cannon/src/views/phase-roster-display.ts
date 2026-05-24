/**
 * Narrow phase roster for dashboard / status UIs: last delivered, current workspace phase, and future phases only.
 * Ordering matches {@link buildOrderedPhaseCatalogList} (leading digit ordinal, then localeCompare).
 */

export type PhaseCatalogListRow = {
  phaseKey: string;
  shortDescription: string | null;
  inCatalog: boolean;
};

export type PhaseRosterDisplayRow = PhaseCatalogListRow & {
  status: "delivered" | "current" | "next" | "future";
};

/** Leading integer segment of a phase key (e.g. `87` from `87` or `87-rollout`). */
export function parseLeadingPhaseOrdinalFromKey(phaseKey: string): number | null {
  const m = String(phaseKey).trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/** Leading digits from workspace / canonical phase strings (e.g. `Phase 87` → 87). */
export function parseLeadingDigitsOrdinal(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function resolveWorkspacePhaseOrdinal(phaseSlice: Record<string, unknown>): number | null {
  return (
    parseLeadingDigitsOrdinal(phaseSlice.currentKitPhase) ??
    parseLeadingDigitsOrdinal(phaseSlice.canonicalPhaseKey) ??
    parseLeadingDigitsOrdinal(phaseSlice.workspaceStatusPhaseKey)
  );
}

export type PhaseRosterNarrowResult =
  | { ok: true; rows: PhaseRosterDisplayRow[] }
  | { ok: false; reason: "no-workspace-ordinal" };

/**
 * Picks at most one delivered row (max ordinal &lt; workspace), one current, and all future ordinals &gt; workspace.
 * Non-numeric phase keys are omitted unless they match current by exact `phaseKey` trim equality.
 */
export function buildNarrowPhaseRosterRows(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  phaseSlice: Record<string, unknown>
): PhaseRosterNarrowResult {
  const wOrd = resolveWorkspacePhaseOrdinal(phaseSlice);
  if (wOrd === null) {
    return { ok: false, reason: "no-workspace-ordinal" };
  }

  let delivered: PhaseCatalogListRow | null = null;
  let bestPastOrd = -Infinity;
  for (const p of phases) {
    const o = parseLeadingPhaseOrdinalFromKey(p.phaseKey);
    if (o !== null && o < wOrd && o > bestPastOrd) {
      bestPastOrd = o;
      delivered = p;
    }
  }

  const currentKitTrim =
    typeof phaseSlice.currentKitPhase === "string" ? phaseSlice.currentKitPhase.trim() : "";
  const currentFromOrd = phases.find((p) => parseLeadingPhaseOrdinalFromKey(p.phaseKey) === wOrd);
  const currentFromString =
    !currentFromOrd && currentKitTrim.length > 0
      ? phases.find((p) => p.phaseKey.trim() === currentKitTrim)
      : undefined;
  const currentRow = currentFromOrd ?? currentFromString;

  const currentDisplayKey =
    currentRow?.phaseKey ??
    (currentKitTrim.length > 0 ? currentKitTrim : String(wOrd));

  const nextKitTrim =
    typeof phaseSlice.nextKitPhase === "string" ? phaseSlice.nextKitPhase.trim() : "";
  const nextOrd = parseLeadingDigitsOrdinal(phaseSlice.nextKitPhase);

  const future = phases.filter((p) => {
    const o = parseLeadingPhaseOrdinalFromKey(p.phaseKey);
    return o !== null && o > wOrd;
  });

  const rows: PhaseRosterDisplayRow[] = [];
  if (delivered) {
    rows.push({ ...delivered, status: "delivered" });
  }
  if (currentRow) {
    rows.push({ ...currentRow, status: "current" });
  } else {
    rows.push({
      phaseKey: currentDisplayKey,
      shortDescription: null,
      inCatalog: false,
      status: "current"
    });
  }
  for (const p of future) {
    const pk = p.phaseKey.trim();
    const po = parseLeadingPhaseOrdinalFromKey(pk);
    const isNext =
      (nextKitTrim.length > 0 && pk === nextKitTrim) ||
      (nextOrd !== null && po !== null && po === nextOrd);
    rows.push({ ...p, status: isNext ? "next" : "future" });
  }

  return { ok: true, rows };
}

/**
 * When workspace has no current phase, anchor roster on `nextKitPhase` (or all numeric phases).
 */
export function buildPhaseRosterRowsWhenNoCurrent(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  phaseSlice: Record<string, unknown>
): PhaseRosterDisplayRow[] {
  const nextOrd = parseLeadingDigitsOrdinal(phaseSlice.nextKitPhase);
  if (nextOrd === null) {
    return phases
      .filter((p) => parseLeadingPhaseOrdinalFromKey(p.phaseKey) !== null)
      .map((p) => ({ ...p, status: "future" as const }));
  }

  let delivered: PhaseCatalogListRow | null = null;
  let bestPastOrd = -Infinity;
  for (const p of phases) {
    const o = parseLeadingPhaseOrdinalFromKey(p.phaseKey);
    if (o !== null && o < nextOrd && o > bestPastOrd) {
      bestPastOrd = o;
      delivered = p;
    }
  }

  const rows: PhaseRosterDisplayRow[] = [];
  if (delivered) {
    rows.push({ ...delivered, status: "delivered" });
  }
  for (const p of phases) {
    const o = parseLeadingPhaseOrdinalFromKey(p.phaseKey);
    if (o === null || o < nextOrd) {
      continue;
    }
    rows.push({ ...p, status: o === nextOrd ? "next" : "future" });
  }
  return rows;
}

/** @deprecated Prefer {@link phaseScheduleTagLabel} from `phase-schedule-tag.ts`. */
export function phaseRosterStatusLabel(status: PhaseRosterDisplayRow["status"]): string {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "current":
      return "Current";
    case "next":
      return "Next";
    case "future":
      return "Future";
    default:
      return "";
  }
}
