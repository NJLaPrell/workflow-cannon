/**
 * Canonical agent guidance tier catalog (RPG party v1) + resolve helpers.
 * @see docs/maintainers/ADR-agent-guidance-profile-rpg-party-v1.md
 */

export const RPG_PARTY_PROFILE_SET_ID = "rpg_party_v1" as const;

/** When `kit.agentGuidance` is absent, effective resolution uses this tier (Adventurer). */
export const DEFAULT_GUIDANCE_TIER = 2;

export type GuidanceTierEntry = {
  tier: number;
  id: string;
  label: string;
  description: string;
};

/** Frozen v1 catalog — order by tier ascending. */
export const RPG_PARTY_CATALOG: readonly GuidanceTierEntry[] = [
  {
    tier: 1,
    id: "npc",
    label: "NPC",
    description:
      "Bare minimum: shortest answers, rare check-ins, ask only when blocked."
  },
  {
    tier: 2,
    id: "adventurer",
    label: "Adventurer",
    description:
      "Balanced default: clear and efficient, normal check-ins, questions when scope is ambiguous."
  },
  {
    tier: 3,
    id: "bard",
    label: "Bard",
    description: "Friendlier narration, slightly more context in summaries, moderate clarifiers."
  },
  {
    tier: 4,
    id: "wizard",
    label: "Wizard",
    description:
      "Deep explanations when helpful, more explicit reasoning, higher clarifier rate on risky steps."
  },
  {
    tier: 5,
    id: "bbeg",
    label: "BBEG",
    description:
      "Maximum verbosity and caution: frequent check-ins on big moves, many clarifying questions before irreversible actions."
  }
] as const;

const TIER_BY_NUMBER = new Map(RPG_PARTY_CATALOG.map((e) => [e.tier, e]));

export function catalogEntryForTier(tier: number): GuidanceTierEntry | undefined {
  return TIER_BY_NUMBER.get(tier);
}

export function isAllowedProfileSetId(id: string): boolean {
  return id === RPG_PARTY_PROFILE_SET_ID;
}

export type ResolvedAgentGuidance = {
  schemaVersion: 1;
  profileSetId: string;
  tier: number;
  displayLabel: string;
  catalog: GuidanceTierEntry;
  hints: {
    explanationStyle: string;
    checkInStyle: string;
    questionStyle: string;
  };
  /** True when no persisted `kit.agentGuidance.tier` contributed to the effective tier. */
  usingDefaultTier: boolean;
};

function hintsForEntry(e: GuidanceTierEntry): ResolvedAgentGuidance["hints"] {
  switch (e.tier) {
    case 1:
      return {
        explanationStyle: "minimal",
        checkInStyle: "rare",
        questionStyle: "only_when_blocked"
      };
    case 2:
      return {
        explanationStyle: "balanced",
        checkInStyle: "normal",
        questionStyle: "when_ambiguous"
      };
    case 3:
      return {
        explanationStyle: "narrative_light",
        checkInStyle: "normal_plus",
        questionStyle: "moderate"
      };
    case 4:
      return {
        explanationStyle: "deep_when_helpful",
        checkInStyle: "frequent_on_risk",
        questionStyle: "elevated_on_risk"
      };
    case 5:
      return {
        explanationStyle: "maximal",
        checkInStyle: "very_frequent",
        questionStyle: "high_before_irreversible"
      };
    default:
      return {
        explanationStyle: "balanced",
        checkInStyle: "normal",
        questionStyle: "when_ambiguous"
      };
  }
}

/**
 * Read effective guidance from merged workspace config (kit domain already merged).
 */
export function resolveAgentGuidanceFromEffectiveConfig(
  effective: Record<string, unknown> | undefined
): ResolvedAgentGuidance {
  const kit =
    effective && typeof effective.kit === "object" && effective.kit !== null && !Array.isArray(effective.kit)
      ? (effective.kit as Record<string, unknown>)
      : {};
  const ag =
    kit.agentGuidance &&
    typeof kit.agentGuidance === "object" &&
    kit.agentGuidance !== null &&
    !Array.isArray(kit.agentGuidance)
      ? (kit.agentGuidance as Record<string, unknown>)
      : {};

  const rawSet =
    typeof ag.profileSetId === "string" && ag.profileSetId.trim().length > 0
      ? ag.profileSetId.trim()
      : RPG_PARTY_PROFILE_SET_ID;
  const profileSetId = isAllowedProfileSetId(rawSet) ? rawSet : RPG_PARTY_PROFILE_SET_ID;

  let usingDefaultTier = true;
  let tier = DEFAULT_GUIDANCE_TIER;
  if (typeof ag.tier === "number" && Number.isInteger(ag.tier) && ag.tier >= 1 && ag.tier <= 5) {
    tier = ag.tier;
    usingDefaultTier = false;
  }

  const entry =
    profileSetId === RPG_PARTY_PROFILE_SET_ID
      ? catalogEntryForTier(tier) ?? catalogEntryForTier(DEFAULT_GUIDANCE_TIER)!
      : catalogEntryForTier(DEFAULT_GUIDANCE_TIER)!;

  const displayLabel =
    typeof ag.displayLabel === "string" && ag.displayLabel.trim().length > 0
      ? ag.displayLabel.trim()
      : entry.label;

  return {
    schemaVersion: 1,
    profileSetId,
    tier: entry.tier,
    displayLabel,
    catalog: entry,
    hints: hintsForEntry(entry),
    usingDefaultTier
  };
}

export type AdvisoryModulation = {
  explanationDepth: "terse" | "normal" | "verbose";
  checkIns: "rare" | "normal" | "frequent";
  clarifyingQuestions: "few" | "normal" | "many";
};

/**
 * Combine guidance tier with coarse behavior-profile explanation verbosity rank (1–3).
 * Advisory only — does not mutate stored profiles.
 */
export function advisoryModulationForProfile(
  guidance: ResolvedAgentGuidance,
  explanationVerbosityRank: number
): AdvisoryModulation {
  const g = guidance.tier;
  const p = Math.min(3, Math.max(1, Math.round(explanationVerbosityRank)));

  const base = ((): AdvisoryModulation => {
    if (g <= 1) {
      return { explanationDepth: "terse", checkIns: "rare", clarifyingQuestions: "few" };
    }
    if (g === 2) {
      return { explanationDepth: "normal", checkIns: "normal", clarifyingQuestions: "normal" };
    }
    if (g === 3) {
      return { explanationDepth: "normal", checkIns: "normal", clarifyingQuestions: "normal" };
    }
    if (g === 4) {
      return { explanationDepth: "verbose", checkIns: "frequent", clarifyingQuestions: "many" };
    }
    return { explanationDepth: "verbose", checkIns: "frequent", clarifyingQuestions: "many" };
  })();

  // Nudge toward profile habit: high verbosity profile + low tier → don't drop below normal depth.
  if (p >= 3 && base.explanationDepth === "terse") {
    base.explanationDepth = "normal";
  }
  if (p <= 1 && base.explanationDepth === "verbose" && g <= 2) {
    base.explanationDepth = "normal";
  }
  return base;
}

/** Map profile dimension string to rank 1–3 for modulation. */
export function explanationVerbosityRank(value: string | undefined): number {
  const v = (value ?? "").toLowerCase();
  if (v.includes("minimal") || v.includes("low")) return 1;
  if (v.includes("high") || v.includes("max")) return 3;
  return 2;
}
