import type { WorkspaceStatusSnapshot } from "./dashboard-status.js";
import type { TaskEntity } from "./types.js";

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
  source: "config" | "status-yaml" | "none";
  configPhaseKey: string | null;
  yamlPhaseKey: string | null;
  /**
   * When both config and YAML supply a phase number: true if equal, false if they disagree.
   * Null when not comparable (either side missing).
   */
  statusYamlMatchesConfig: boolean | null;
};

/**
 * Precedence: project `kit.currentPhaseNumber` (when set) wins; otherwise YAML `current_kit_phase`.
 */
export function resolveCanonicalPhase(args: {
  effectiveConfig: Record<string, unknown> | undefined;
  workspaceStatus: WorkspaceStatusSnapshot | null;
}): CanonicalPhaseResolution {
  const kit = args.effectiveConfig?.kit;
  const kitObj =
    kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : undefined;
  const rawNum = kitObj?.currentPhaseNumber;
  let configPhaseKey: string | null = null;
  if (typeof rawNum === "number" && Number.isFinite(rawNum) && rawNum > 0) {
    configPhaseKey = String(Math.floor(rawNum));
  }
  const yamlPhaseKey = parseKitPhaseNumberFromYaml(args.workspaceStatus?.currentKitPhase ?? null);

  const canonicalPhaseKey = configPhaseKey ?? yamlPhaseKey ?? null;
  const source: CanonicalPhaseResolution["source"] = configPhaseKey
    ? "config"
    : yamlPhaseKey
      ? "status-yaml"
      : "none";

  let statusYamlMatchesConfig: boolean | null = null;
  if (configPhaseKey !== null && yamlPhaseKey !== null) {
    statusYamlMatchesConfig = configPhaseKey === yamlPhaseKey;
  }

  return {
    canonicalPhaseKey,
    source,
    configPhaseKey,
    yamlPhaseKey,
    statusYamlMatchesConfig
  };
}
