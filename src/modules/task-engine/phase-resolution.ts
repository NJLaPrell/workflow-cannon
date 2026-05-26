import type { WorkspaceStatusSnapshot } from "./dashboard/dashboard-status.js";
import type { TaskEntity } from "./types.js";

/** Phase digits from `kit.currentPhaseNumber` when set (bootstrap / operator UX; not canonical over DB workspace status). */
export function configKitPhaseKeyFromEffective(effectiveConfig: Record<string, unknown> | undefined): string | null {
  const kit = effectiveConfig?.kit;
  const kitObj =
    kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : undefined;
  const rawNum = kitObj?.currentPhaseNumber;
  if (typeof rawNum === "number" && Number.isFinite(rawNum) && rawNum > 0) {
    return String(Math.floor(rawNum));
  }
  return null;
}

/** Parse leading digits from maintainer status YAML `current_kit_phase` (e.g. `"28"`). */
export function parseKitPhaseNumberFromYaml(phaseRaw: string | null | undefined): string | null {
  if (phaseRaw === null || phaseRaw === undefined) {
    return null;
  }
  const trimmed = String(phaseRaw).trim();
  const m = trimmed.match(/^(\d+)/);
  return m ? m[1]! : null;
}

/**
 * Infer stable phase key from free-text `task.phase` (e.g. "Phase 28 (foo)") or explicit `task.phaseKey`.
 */
export function inferTaskPhaseKey(task: Pick<TaskEntity, "phaseKey" | "phase">): string | null {
  if (typeof task.phaseKey === "string" && task.phaseKey.trim().length > 0) {
    return task.phaseKey.trim();
  }
  if (typeof task.phase === "string" && task.phase.trim().length > 0) {
    const p = task.phase.trim();
    const labeled = p.match(/Phase\s*(\d+)/i);
    if (labeled) {
      return labeled[1]!;
    }
    const leading = p.match(/^(\d+)\b/);
    if (leading) {
      return leading[1]!;
    }
  }
  return null;
}

export type CanonicalPhaseResolution = {
  /** Normalized phase number string when resolvable (e.g. `"28"`). */
  canonicalPhaseKey: string | null;
  /** Where `canonicalPhaseKey` came from when set. */
  source: "workspace-status" | "config" | "none";
  configPhaseKey: string | null;
  /** Phase digits parsed from workspace status `current_kit_phase` (DB or YAML-derived snapshot). */
  workspaceStatusPhaseKey: string | null;
  /**
   * When both config and workspace status supply a phase number: true if equal, false if they disagree.
   * Informational only — canonical runtime phase is workspace status when its snapshot is present; config is a bootstrap hint.
   */
  configMatchesWorkspaceStatus: boolean | null;
};

/**
 * Precedence: workspace status `current_kit_phase` (when parseable) wins; otherwise `kit.currentPhaseNumber` as fallback seed.
 */
export function resolveCanonicalPhase(args: {
  effectiveConfig: Record<string, unknown> | undefined;
  workspaceStatus: WorkspaceStatusSnapshot | null;
}): CanonicalPhaseResolution {
  const configPhaseKey = configKitPhaseKeyFromEffective(args.effectiveConfig);
  const workspaceStatusPhaseKey = parseKitPhaseNumberFromYaml(args.workspaceStatus?.currentKitPhase ?? null);

  const canonicalPhaseKey = workspaceStatusPhaseKey ?? configPhaseKey ?? null;
  const source: CanonicalPhaseResolution["source"] = workspaceStatusPhaseKey
    ? "workspace-status"
    : configPhaseKey
      ? "config"
      : "none";

  let configMatchesWorkspaceStatus: boolean | null = null;
  if (configPhaseKey !== null && workspaceStatusPhaseKey !== null) {
    configMatchesWorkspaceStatus = configPhaseKey === workspaceStatusPhaseKey;
  }

  return {
    canonicalPhaseKey,
    source,
    configPhaseKey,
    workspaceStatusPhaseKey,
    configMatchesWorkspaceStatus
  };
}

/**
 * Leading integer segment of a phase key for ladder-style comparisons.
 * Returns `null` when the key has no leading digits (opaque / custom bucket).
 */
export function parseLeadingPhaseOrdinal(phaseKey: string | null | undefined): number | null {
  if (phaseKey === null || phaseKey === undefined) {
    return null;
  }
  const m = String(phaseKey).trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * When true, numeric phase keys whose leading ordinal sorts strictly before workspace
 * current kit phase are rejected by assign-task-phase and upsert-phase-catalog-entry.
 * Default false — maintainers may bucket tasks to past phases while the workspace advances.
 */
export function phaseLadderBlocksBeforeCurrent(effectiveConfig: Record<string, unknown> | undefined): boolean {
  const kit = effectiveConfig?.kit;
  const kitObj =
    kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : undefined;
  const ladder = kitObj?.phaseLadder;
  const ladderObj =
    ladder !== null && typeof ladder === "object" && !Array.isArray(ladder)
      ? (ladder as Record<string, unknown>)
      : undefined;
  return ladderObj?.blockBeforeCurrent === true;
}

/**
 * When set, numeric phase keys with leading ordinal in `[0, N]` are treated as delivered
 * for dashboard tags/roster (pre–delivery-evidence history). Omit or null disables.
 */
export function resolveLegacyDeliveredMaxOrdinal(
  effectiveConfig: Record<string, unknown> | undefined
): number | null {
  const kit = effectiveConfig?.kit;
  const kitObj =
    kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : undefined;
  const delivery = kitObj?.phaseDelivery;
  const deliveryObj =
    delivery !== null && typeof delivery === "object" && !Array.isArray(delivery)
      ? (delivery as Record<string, unknown>)
      : undefined;
  const raw = deliveryObj?.legacyDeliveredMaxOrdinal;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return null;
}

/** True when `phaseKey` leading ordinal is within the configured legacy delivered ceiling. */
export function isPhaseLegacyDeliveredByOrdinal(
  phaseKey: string,
  legacyDeliveredMaxOrdinal: number | null | undefined
): boolean {
  if (legacyDeliveredMaxOrdinal === null || legacyDeliveredMaxOrdinal === undefined) {
    return false;
  }
  const ord = parseLeadingPhaseOrdinal(phaseKey);
  return ord !== null && ord >= 0 && ord <= legacyDeliveredMaxOrdinal;
}

/**
 * How a task's target phase relates to the workspace's current kit phase
 * (authoritative "where we are" from `resolveCanonicalPhase`, not per-task `phaseKey` alone).
 */
export type PhaseScheduleRelation = "current" | "future" | "past" | "unknown";

export function resolvePhaseScheduleRelation(args: {
  taskPhaseKey: string | null;
  workspacePhaseKey: string | null;
}): PhaseScheduleRelation {
  const wk = args.workspacePhaseKey;
  const tk = args.taskPhaseKey;
  if (!wk || !tk) {
    return "unknown";
  }
  const wn = parseLeadingPhaseOrdinal(wk);
  const tn = parseLeadingPhaseOrdinal(tk);
  if (wn === null || tn === null) {
    return "unknown";
  }
  if (tn < wn) {
    return "past";
  }
  if (tn > wn) {
    return "future";
  }
  return "current";
}
