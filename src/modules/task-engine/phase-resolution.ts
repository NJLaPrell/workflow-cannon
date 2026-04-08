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
