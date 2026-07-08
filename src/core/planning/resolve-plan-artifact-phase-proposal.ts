import type { PlanArtifactPhaseRecommendation } from "./plan-artifact-v1.js";

/** Aligns with task-engine `PHASE_KEY_RE` (keep in sync manually — core must not import modules). */
export const PLAN_ARTIFACT_PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS = 5;

/** Placeholder plan phase keys — not real roster targets; finalize resolves a numeric phase at materialization. */
export const DEFERRED_PLAN_PHASE_RECOMMENDATION_KEYS = new Set([
  "planner-resolved",
  "deferred",
  "at-finalize",
  "auto"
]);

export function isDeferredPlanPhaseRecommendationKey(phaseKey: string): boolean {
  return DEFERRED_PLAN_PHASE_RECOMMENDATION_KEYS.has(phaseKey.trim().toLowerCase());
}

export type PlanArtifactPhaseProposal = {
  phaseKey: string;
  label: string;
  /** Short operator-facing description (target ≤5 words). */
  description: string;
};

export type PlanArtifactPhaseProposalFinding = {
  code: string;
  message: string;
  severity: "blocker" | "warning";
  field?: string;
};

export type ResolvePlanArtifactPhaseProposalInput = {
  /** Command argv override (wins). */
  targetPhaseKey?: string;
  targetPhase?: string;
  /** Alias for explicit phase key (WORKFLOW_PLAN). */
  preferredPhaseKey?: string;
  phaseShortDescription?: string;
  phaseRecommendations: PlanArtifactPhaseRecommendation[];
  /** Phase keys with active execution work (e.g. ready / in_progress). */
  activePhaseKeys?: string[];
  /** Phase keys with any non-archived task (used for auto-empty resolution). */
  occupiedPhaseKeys?: string[];
  /** Workspace kit `nextKitPhase` when set (roster operator intent). */
  workspaceNextPhaseKey?: string;
  /** When true, an explicit key may reuse an active phase bucket. */
  allowPhaseKeyCollision?: boolean;
  /** Long descriptions are blockers when true; warnings when false. */
  strict?: boolean;
};

export type ResolvePlanArtifactPhaseProposalSuccess = {
  ok: true;
  proposal: PlanArtifactPhaseProposal;
  findings: PlanArtifactPhaseProposalFinding[];
  source: "explicit" | "workspace-next" | "auto-empty" | "recommendation" | "auto";
};

export type ResolvePlanArtifactPhaseProposalFailure = {
  ok: false;
  code: "plan-artifact-phase-proposal-blocked";
  findings: PlanArtifactPhaseProposalFinding[];
};

export type ResolvePlanArtifactPhaseProposalResult =
  | ResolvePlanArtifactPhaseProposalSuccess
  | ResolvePlanArtifactPhaseProposalFailure;

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function parseLeadingPhaseOrdinal(phaseKey: string): number | null {
  const m = phaseKey.trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

function maxNumericPhaseOrdinal(keys: string[]): number {
  let max = 0;
  for (const key of keys) {
    const ord = parseLeadingPhaseOrdinal(key);
    if (ord !== null && ord > max) {
      max = ord;
    }
  }
  return max;
}

function nextAutoPhaseKey(activePhaseKeys: string[], recommendationKeys: string[]): string {
  const max = maxNumericPhaseOrdinal([...activePhaseKeys, ...recommendationKeys]);
  return String(max + 1);
}

/**
 * Next numeric phase key strictly after the highest occupied ordinal that has zero tasks.
 * Skips occupied keys when incrementing (e.g. gaps at 135–138 with work in 134/137/139 → 140).
 */
export function resolveNextEmptyNumericPhaseKey(
  occupiedPhaseKeys: string[],
  hintKeys: string[] = []
): string {
  const occupied = occupiedPhaseKeys.map((k) => k.trim()).filter((k) => k.length > 0);
  const occupiedSet = new Set(occupied);
  let maxOccupied = 0;
  for (const key of occupied) {
    const ord = parseLeadingPhaseOrdinal(key);
    if (ord !== null && ord > maxOccupied) {
      maxOccupied = ord;
    }
  }
  for (const key of hintKeys) {
    const ord = parseLeadingPhaseOrdinal(key);
    if (ord !== null && ord > maxOccupied) {
      maxOccupied = ord;
    }
  }
  let candidate = maxOccupied + 1;
  while (occupiedSet.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

export function countDescriptionWords(description: string): number {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).filter((w) => w.length > 0).length;
}

function validateDescription(
  description: string | undefined,
  strict: boolean
): PlanArtifactPhaseProposalFinding[] {
  if (description === undefined) {
    return [];
  }
  const words = countDescriptionWords(description);
  if (words <= PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS) {
    return [];
  }
  const finding: PlanArtifactPhaseProposalFinding = {
    code: "PLAN-PHASE-DESCRIPTION-LONG",
    message: `phase description has ${words} words; target is ${PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS} or fewer`,
    severity: strict ? "blocker" : "warning",
    field: "phaseShortDescription"
  };
  return [finding];
}

function hasBlocker(findings: PlanArtifactPhaseProposalFinding[]): boolean {
  return findings.some((f) => f.severity === "blocker");
}

/**
 * Deterministic phase target for finalize-plan-to-phase (WP-6 / T-6.2).
 * Pure function — no task-store or filesystem I/O.
 */
export function resolvePlanArtifactPhaseProposal(
  input: ResolvePlanArtifactPhaseProposalInput
): ResolvePlanArtifactPhaseProposalResult {
  const strict = input.strict !== false;
  const activeKeys = (input.activePhaseKeys ?? []).map((k) => k.trim()).filter((k) => k.length > 0);
  const activeSet = new Set(activeKeys);
  const recommendationKeys = input.phaseRecommendations
    .map((r) => r.phaseKey.trim())
    .filter((k) => k.length > 0 && !isDeferredPlanPhaseRecommendationKey(k));

  const explicitKeyRaw = trimOptional(input.targetPhaseKey) ?? trimOptional(input.preferredPhaseKey);
  const explicitKey =
    explicitKeyRaw && !isDeferredPlanPhaseRecommendationKey(explicitKeyRaw) ? explicitKeyRaw : undefined;
  const explicitLabel = trimOptional(input.targetPhase);
  const description = trimOptional(input.phaseShortDescription);

  const descriptionFindings = validateDescription(description, strict);

  let phaseKey: string;
  let source: ResolvePlanArtifactPhaseProposalSuccess["source"];
  let labelFromRecommendation: string | undefined;

  if (explicitKey) {
    if (!PLAN_ARTIFACT_PHASE_KEY_RE.test(explicitKey)) {
      const findings: PlanArtifactPhaseProposalFinding[] = [
        {
          code: "PLAN-PHASE-KEY-INVALID",
          message:
            "phase key must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars",
          severity: "blocker",
          field: "targetPhaseKey"
        },
        ...descriptionFindings
      ];
      return { ok: false, code: "plan-artifact-phase-proposal-blocked", findings };
    }
    if (activeSet.has(explicitKey) && input.allowPhaseKeyCollision !== true) {
      const findings: PlanArtifactPhaseProposalFinding[] = [
        {
          code: "PLAN-PHASE-KEY-COLLISION",
          message: `phase key '${explicitKey}' already has active tasks; set allowPhaseKeyCollision to reuse`,
          severity: "blocker",
          field: "targetPhaseKey"
        },
        ...descriptionFindings
      ];
      return { ok: false, code: "plan-artifact-phase-proposal-blocked", findings };
    }
    phaseKey = explicitKey;
    source = "explicit";
    const match = input.phaseRecommendations.find((r) => r.phaseKey.trim() === explicitKey);
    labelFromRecommendation = match?.label.trim();
  } else {
    const workspaceNext = trimOptional(input.workspaceNextPhaseKey);
    const occupiedKeys = (input.occupiedPhaseKeys ?? []).map((k) => k.trim()).filter((k) => k.length > 0);

    if (workspaceNext) {
      if (!PLAN_ARTIFACT_PHASE_KEY_RE.test(workspaceNext)) {
        const findings: PlanArtifactPhaseProposalFinding[] = [
          {
            code: "PLAN-PHASE-KEY-INVALID",
            message: `workspace nextKitPhase '${workspaceNext}' is not a valid phase key`,
            severity: "blocker",
            field: "workspaceNextPhaseKey"
          },
          ...descriptionFindings
        ];
        return { ok: false, code: "plan-artifact-phase-proposal-blocked", findings };
      }
      phaseKey = workspaceNext;
      source = "workspace-next";
      const match = input.phaseRecommendations.find((r) => r.phaseKey.trim() === workspaceNext);
      labelFromRecommendation = match?.label.trim();
    } else {
      phaseKey = resolveNextEmptyNumericPhaseKey(occupiedKeys, [...activeKeys, ...recommendationKeys]);
      source = "auto-empty";
      const match = input.phaseRecommendations.find((r) => r.phaseKey.trim() === phaseKey);
      labelFromRecommendation = match?.label.trim();
    }
  }

  const label = explicitLabel ?? labelFromRecommendation ?? `Phase ${phaseKey}`;
  const proposal: PlanArtifactPhaseProposal = {
    phaseKey,
    label,
    description: description ?? ""
  };

  if (hasBlocker(descriptionFindings)) {
    return { ok: false, code: "plan-artifact-phase-proposal-blocked", findings: descriptionFindings };
  }

  return {
    ok: true,
    proposal,
    findings: descriptionFindings,
    source
  };
}
