/**
 * Narrow phase roster for dashboard / status UIs: last delivered, current workspace phase, and undelivered phases.
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
  const fromCurrent = parseLeadingDigitsOrdinal(phaseSlice.currentKitPhase);
  if (fromCurrent !== null) {
    return fromCurrent;
  }
  const fromWorkspaceStatus = parseLeadingDigitsOrdinal(phaseSlice.workspaceStatusPhaseKey);
  if (fromWorkspaceStatus !== null) {
    return fromWorkspaceStatus;
  }
  // Config hints are UX/bootstrap only — when SQLite workspace phase is unset, do not
  // anchor the narrow roster on stale kit.currentPhaseNumber.
  if (phaseSlice.currentKitPhase === null && phaseSlice.workspaceStatusPhaseKey === null) {
    return null;
  }
  return parseLeadingDigitsOrdinal(phaseSlice.canonicalPhaseKey);
}

function phaseHasActiveQueueWork(
  phaseKey: string,
  activeQueuePhaseKeys?: ReadonlySet<string>
): boolean {
  if (!activeQueuePhaseKeys || activeQueuePhaseKeys.size === 0) {
    return false;
  }
  return activeQueuePhaseKeys.has(phaseKey.trim());
}

function phaseIsDelivered(
  phaseKey: string,
  deliveredSet: Set<string>,
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: ReadonlySet<string>
): boolean {
  const pk = phaseKey.trim();
  if (deliveredSet.has(pk)) {
    return true;
  }
  if (phaseHasActiveQueueWork(pk, activeQueuePhaseKeys)) {
    return false;
  }
  if (typeof legacyDeliveredMaxOrdinal === "number" && Number.isFinite(legacyDeliveredMaxOrdinal)) {
    const ord = parseLeadingPhaseOrdinalFromKey(pk);
    return ord !== null && ord >= 0 && ord <= legacyDeliveredMaxOrdinal;
  }
  return false;
}

function activeQueuePhaseKeySet(
  activeQueuePhaseKeys: ReadonlySet<string> | readonly string[] | undefined
): Set<string> | undefined {
  if (!activeQueuePhaseKeys) {
    return undefined;
  }
  if (activeQueuePhaseKeys instanceof Set) {
    return activeQueuePhaseKeys.size > 0 ? activeQueuePhaseKeys : undefined;
  }
  const out = new Set<string>();
  for (const raw of activeQueuePhaseKeys) {
    const key = String(raw).trim();
    if (key.length > 0) {
      out.add(key);
    }
  }
  return out.size > 0 ? out : undefined;
}

function deliveredPhaseKeySet(
  deliveredPhaseKeys: ReadonlySet<string> | readonly string[] | undefined
): Set<string> {
  if (!deliveredPhaseKeys) {
    return new Set();
  }
  if (deliveredPhaseKeys instanceof Set) {
    return deliveredPhaseKeys;
  }
  const out = new Set<string>();
  for (const raw of deliveredPhaseKeys) {
    const key = String(raw).trim();
    if (key.length > 0) {
      out.add(key);
    }
  }
  return out;
}

function resolveCurrentPhaseRow(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  phaseSlice: Record<string, unknown>,
  wOrd: number
): { currentRow: PhaseCatalogListRow | undefined; currentDisplayKey: string } {
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
  return { currentRow, currentDisplayKey };
}

function pickMostRecentDeliveredRow(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  deliveredSet: Set<string>,
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: ReadonlySet<string>,
  lastDeliveredPhaseKey?: string | null
): PhaseCatalogListRow | null {
  const catalogByKey = new Map(phases.map((p) => [p.phaseKey.trim(), p]));
  const preferredKey =
    typeof lastDeliveredPhaseKey === "string" ? lastDeliveredPhaseKey.trim() : "";
  if (
    preferredKey.length > 0 &&
    phaseIsDelivered(preferredKey, deliveredSet, legacyDeliveredMaxOrdinal, activeQueuePhaseKeys)
  ) {
    return (
      catalogByKey.get(preferredKey) ??
      ({
        phaseKey: preferredKey,
        shortDescription: null,
        inCatalog: false
      } satisfies PhaseCatalogListRow)
    );
  }
  const keysToCheck = new Set<string>(deliveredSet);
  for (const p of phases) {
    keysToCheck.add(p.phaseKey.trim());
  }
  let delivered: PhaseCatalogListRow | null = null;
  let bestDeliveredOrd = -Infinity;
  for (const pk of keysToCheck) {
    if (!phaseIsDelivered(pk, deliveredSet, legacyDeliveredMaxOrdinal, activeQueuePhaseKeys)) {
      continue;
    }
    const o = parseLeadingPhaseOrdinalFromKey(pk);
    if (o !== null && o > bestDeliveredOrd) {
      bestDeliveredOrd = o;
      delivered =
        catalogByKey.get(pk) ??
        ({
          phaseKey: pk,
          shortDescription: null,
          inCatalog: false
        } satisfies PhaseCatalogListRow);
    }
  }
  return delivered;
}

function rosterFutureStatus(
  phaseKey: string,
  phaseSlice: Record<string, unknown>
): "next" | "future" {
  const pk = phaseKey.trim();
  const nextKitTrim =
    typeof phaseSlice.nextKitPhase === "string" ? phaseSlice.nextKitPhase.trim() : "";
  return nextKitTrim.length > 0 && pk === nextKitTrim ? "next" : "future";
}

function resolveMaxDeliveredOrdinal(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  deliveredSet: Set<string>,
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: ReadonlySet<string>
): number | null {
  let best: number | null =
    typeof legacyDeliveredMaxOrdinal === "number" && Number.isFinite(legacyDeliveredMaxOrdinal)
      ? legacyDeliveredMaxOrdinal
      : null;
  const consider = (phaseKey: string) => {
    const pk = phaseKey.trim();
    if (!phaseIsDelivered(pk, deliveredSet, legacyDeliveredMaxOrdinal, activeQueuePhaseKeys)) {
      return;
    }
    const ord = parseLeadingPhaseOrdinalFromKey(pk);
    if (ord !== null && (best === null || ord > best)) {
      best = ord;
    }
  };
  for (const p of phases) {
    consider(p.phaseKey);
  }
  for (const pk of deliveredSet) {
    consider(pk);
  }
  return best;
}

/** When workspace has no current phase, hide stale catalog gaps below the latest delivered build. */
function shouldShowUndeliveredPhaseOnIdleRoster(
  phaseKey: string,
  phaseSlice: Record<string, unknown>,
  deliveredSet: Set<string>,
  legacyDeliveredMaxOrdinal: number | null | undefined,
  activeQueuePhaseKeys: ReadonlySet<string> | undefined,
  maxDeliveredOrdinal: number | null
): boolean {
  const pk = phaseKey.trim();
  if (phaseIsDelivered(pk, deliveredSet, legacyDeliveredMaxOrdinal, activeQueuePhaseKeys)) {
    return false;
  }
  if (phaseHasActiveQueueWork(pk, activeQueuePhaseKeys)) {
    return true;
  }
  const nextKitTrim =
    typeof phaseSlice.nextKitPhase === "string" ? phaseSlice.nextKitPhase.trim() : "";
  if (nextKitTrim.length > 0 && pk === nextKitTrim) {
    return true;
  }
  const ord = parseLeadingPhaseOrdinalFromKey(pk);
  if (ord === null) {
    return false;
  }
  if (maxDeliveredOrdinal !== null && ord <= maxDeliveredOrdinal) {
    return false;
  }
  return true;
}

export type PhaseRosterNarrowResult =
  | { ok: true; rows: PhaseRosterDisplayRow[] }
  | { ok: false; reason: "no-workspace-ordinal" };

/**
 * Picks at most one delivered row (max ordinal among closeout-delivered phases), one current,
 * and all undelivered catalog phases as future/next (including numeric gaps below workspace current).
 */
export function buildNarrowPhaseRosterRows(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  phaseSlice: Record<string, unknown>,
  deliveredPhaseKeys?: ReadonlySet<string> | readonly string[],
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: ReadonlySet<string> | readonly string[],
  lastDeliveredPhaseKey?: string | null
): PhaseRosterNarrowResult {
  const wOrd = resolveWorkspacePhaseOrdinal(phaseSlice);
  if (wOrd === null) {
    return { ok: false, reason: "no-workspace-ordinal" };
  }

  const deliveredSet = deliveredPhaseKeySet(deliveredPhaseKeys);
  const activeSet = activeQueuePhaseKeySet(activeQueuePhaseKeys);
  const deliveredRow = pickMostRecentDeliveredRow(
    phases,
    deliveredSet,
    legacyDeliveredMaxOrdinal,
    activeSet,
    lastDeliveredPhaseKey
  );
  const { currentRow, currentDisplayKey } = resolveCurrentPhaseRow(phases, phaseSlice, wOrd);
  const currentKey = (currentRow?.phaseKey ?? currentDisplayKey).trim();

  const future = phases.filter((p) => {
    const pk = p.phaseKey.trim();
    if (pk === currentKey) {
      return false;
    }
    if (phaseIsDelivered(pk, deliveredSet, legacyDeliveredMaxOrdinal, activeSet)) {
      return false;
    }
    return true;
  });

  const rows: PhaseRosterDisplayRow[] = [];
  if (deliveredRow) {
    rows.push({ ...deliveredRow, status: "delivered" });
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
    rows.push({ ...p, status: rosterFutureStatus(p.phaseKey, phaseSlice) });
  }

  return { ok: true, rows };
}

/**
 * When workspace has no current phase, anchor roster on `nextKitPhase` (or all numeric phases).
 */
export function buildPhaseRosterRowsWhenNoCurrent(
  phases: ReadonlyArray<PhaseCatalogListRow>,
  phaseSlice: Record<string, unknown>,
  deliveredPhaseKeys?: ReadonlySet<string> | readonly string[],
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: ReadonlySet<string> | readonly string[],
  lastDeliveredPhaseKey?: string | null
): PhaseRosterDisplayRow[] {
  const deliveredSet = deliveredPhaseKeySet(deliveredPhaseKeys);
  const activeSet = activeQueuePhaseKeySet(activeQueuePhaseKeys);
  const maxDeliveredOrdinal = resolveMaxDeliveredOrdinal(
    phases,
    deliveredSet,
    legacyDeliveredMaxOrdinal,
    activeSet
  );
  const deliveredRow = pickMostRecentDeliveredRow(
    phases,
    deliveredSet,
    legacyDeliveredMaxOrdinal,
    activeSet,
    lastDeliveredPhaseKey
  );

  const rows: PhaseRosterDisplayRow[] = [];
  if (deliveredRow) {
    rows.push({ ...deliveredRow, status: "delivered" });
  }
  for (const p of phases) {
    const pk = p.phaseKey.trim();
    if (
      !shouldShowUndeliveredPhaseOnIdleRoster(
        pk,
        phaseSlice,
        deliveredSet,
        legacyDeliveredMaxOrdinal,
        activeSet,
        maxDeliveredOrdinal
      )
    ) {
      continue;
    }
    const o = parseLeadingPhaseOrdinalFromKey(pk);
    if (o === null) {
      continue;
    }
    rows.push({ ...p, status: rosterFutureStatus(pk, phaseSlice) });
  }
  return rows;
}

export type PhaseCloseoutOrderingRisk = {
  currentOrdinal: number;
  laterDeliveredPhaseKeys: string[];
  message: string;
};

const PHASE_CLOSEOUT_ORDERING_RUNBOOK = ".ai/runbooks/phase-closeout-ordering-recovery.md";

/**
 * True when the workspace current phase is behind phases already marked delivered on the roster
 * (common when git shipped later `release/phase-<N>` branches before the workspace pointer caught up).
 */
export function detectPhaseCloseoutOrderingRisk(args: {
  currentKitPhase: string | null | undefined;
  phases: ReadonlyArray<PhaseCatalogListRow>;
  deliveredPhaseKeys?: ReadonlySet<string> | readonly string[];
  legacyDeliveredMaxOrdinal?: number | null;
  activeQueuePhaseKeys?: ReadonlySet<string> | readonly string[];
}): PhaseCloseoutOrderingRisk | null {
  const currentOrd = parseLeadingDigitsOrdinal(args.currentKitPhase);
  if (currentOrd === null) {
    return null;
  }
  const deliveredSet = deliveredPhaseKeySet(args.deliveredPhaseKeys);
  const activeSet = activeQueuePhaseKeySet(args.activeQueuePhaseKeys);
  const later: string[] = [];
  for (const row of args.phases) {
    const pk = row.phaseKey.trim();
    const ord = parseLeadingPhaseOrdinalFromKey(pk);
    if (
      ord !== null &&
      ord > currentOrd &&
      phaseIsDelivered(pk, deliveredSet, args.legacyDeliveredMaxOrdinal, activeSet)
    ) {
      later.push(pk);
    }
  }
  later.sort(
    (a, b) =>
      (parseLeadingPhaseOrdinalFromKey(a) ?? 0) - (parseLeadingPhaseOrdinalFromKey(b) ?? 0)
  );
  const legacy = args.legacyDeliveredMaxOrdinal;
  const legacyAhead =
    typeof legacy === "number" && Number.isFinite(legacy) && legacy > currentOrd;
  if (later.length === 0 && !legacyAhead) {
    return null;
  }
  const laterLabel =
    later.length > 0 ? later.map((k) => "Phase " + k).join(", ") : "later catalog phases";
  const message =
    "Workspace is on Phase " +
    String(currentOrd) +
    " but the roster already marks " +
    laterLabel +
    " as delivered. Confirm `origin/release/phase-" +
    String(currentOrd) +
    "` exists and matches git before Complete & Release. Recovery: " +
    PHASE_CLOSEOUT_ORDERING_RUNBOOK;
  return { currentOrdinal: currentOrd, laterDeliveredPhaseKeys: later, message };
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
