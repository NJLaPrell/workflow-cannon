import type { AgentModelTier } from "../../contracts/agent-orchestration.js";
import type {
  ModelSelectionMapV1,
  ModelSelectionResult,
  ModelSelectionScopeInput,
  ModelSelectionScopeLevel,
  ModelSelectionScopeMatch,
  ModelSelectionScopeWeight
} from "../../contracts/model-selection-map.v1.js";

const LEVEL_RANK: Record<ModelSelectionScopeLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const HIGH_WEIGHTS = new Set<ModelSelectionScopeWeight>(["high", "critical"]);

function levelAtOrAbove(
  actual: ModelSelectionScopeLevel | undefined,
  threshold: ModelSelectionScopeLevel
): boolean {
  if (!actual) {
    return false;
  }
  return LEVEL_RANK[actual] >= LEVEL_RANK[threshold];
}

function readModelBySlug(map: ModelSelectionMapV1, slug: string | null | undefined) {
  if (!slug) {
    return undefined;
  }
  return map.models.find((entry) => entry.modelSlug === slug && entry.enabled !== false);
}

function resolveTierDefault(
  map: ModelSelectionMapV1,
  tier: Exclude<AgentModelTier, "human_review">
): { slug: string | null; fallbacks: string[] } {
  const tierDefault = map.tierDefaults?.[tier];
  if (!tierDefault) {
    return { slug: null, fallbacks: [] };
  }
  return {
    slug: tierDefault.modelSlug,
    fallbacks: tierDefault.fallbackSlugs ?? readModelBySlug(map, tierDefault.modelSlug)?.fallbackSlugs ?? []
  };
}

function countHighWeightSignalsAtOrAbove(
  map: ModelSelectionMapV1,
  input: ModelSelectionScopeInput,
  threshold: ModelSelectionScopeLevel
): number {
  let count = 0;
  for (const dimension of map.scopeDimensions) {
    if (!HIGH_WEIGHTS.has(dimension.weight)) {
      continue;
    }
    const level = input.levels[dimension.id];
    if (levelAtOrAbove(level, threshold)) {
      count += 1;
    }
  }
  return count;
}

function ruleMatches(
  map: ModelSelectionMapV1,
  input: ModelSelectionScopeInput,
  triggers: string[],
  match: ModelSelectionScopeMatch
): boolean {
  if (match.anyAtOrAbove) {
    const hit = Object.entries(match.anyAtOrAbove).some(([dimensionId, threshold]) => {
      if (!threshold) {
        return false;
      }
      const actual = input.levels[dimensionId];
      if (levelAtOrAbove(actual, threshold)) {
        triggers.push(`${dimensionId}=${actual} (>= ${threshold})`);
        return true;
      }
      return false;
    });
    if (!hit) {
      return false;
    }
  }

  if (match.allAtOrAbove) {
    const allHit = Object.entries(match.allAtOrAbove).every(([dimensionId, threshold]) => {
      if (!threshold) {
        return false;
      }
      const actual = input.levels[dimensionId];
      const ok = levelAtOrAbove(actual, threshold);
      if (!ok) {
        return false;
      }
      triggers.push(`${dimensionId}=${actual} (>= ${threshold})`);
      return true;
    });
    if (!allHit) {
      return false;
    }
  }

  if (match.highWeightCountAtOrAbove) {
    const count = countHighWeightSignalsAtOrAbove(map, input, match.highWeightCountAtOrAbove.level);
    if (count < match.highWeightCountAtOrAbove.count) {
      return false;
    }
    triggers.push(
      `highWeightCountAtOrAbove: ${count} >= ${match.highWeightCountAtOrAbove.count} at ${match.highWeightCountAtOrAbove.level}`
    );
  }

  if (match.subagentTypes?.length) {
    if (!input.subagentType || !match.subagentTypes.includes(input.subagentType)) {
      return false;
    }
    triggers.push(`subagentType=${input.subagentType}`);
  }

  if (match.taskTypeHints?.length) {
    const hints = new Set((input.taskTypeHints ?? []).map((hint) => hint.toLowerCase()));
    const hit = match.taskTypeHints.some((hint) => hints.has(hint.toLowerCase()));
    if (!hit) {
      return false;
    }
    triggers.push(`taskTypeHints matched: ${match.taskTypeHints.join(", ")}`);
  }

  if (match.ownedPathCountAtLeast != null) {
    const count = input.ownedPathCount ?? 0;
    if (count < match.ownedPathCountAtLeast) {
      return false;
    }
    triggers.push(`ownedPathCount=${count}`);
  }

  if (match.ownedAreaCountAtLeast != null) {
    const count = input.ownedAreaCount ?? 0;
    if (count < match.ownedAreaCountAtLeast) {
      return false;
    }
    triggers.push(`ownedAreaCount=${count}`);
  }

  if (match.requiresApprovalPaths === true && input.requiresApprovalPaths !== true) {
    return false;
  }
  if (match.requiresApprovalPaths === true) {
    triggers.push("requiresApprovalPaths=true");
  }

  return true;
}

function sortedRules(map: ModelSelectionMapV1) {
  return [...map.selectionRules].sort((a, b) => b.priority - a.priority);
}

/**
 * Choose a host model slug for a subagent dispatch using a declarative selection map.
 * Does not launch subagents — returns a recommendation for orchestrators / Task tool args.
 */
export function selectSubagentModel(map: ModelSelectionMapV1, input: ModelSelectionScopeInput): ModelSelectionResult {
  if (input.explicitModelTier === "human_review") {
    return {
      mapId: map.mapId,
      ruleId: "explicit_human_review",
      modelSlug: null,
      modelTier: "human_review",
      modelHint: null,
      rationale: "Caller requested human_review tier explicitly.",
      fallbackSlugs: [],
      escalationTriggers: ["explicitModelTier=human_review"]
    };
  }

  const subagentDefault = input.subagentType ? map.subagentTypeDefaults?.[input.subagentType] : undefined;

  for (const rule of sortedRules(map)) {
    const ruleTriggers: string[] = [];
    const isDefaultRule = Object.keys(rule.match ?? {}).length === 0;
    if (!isDefaultRule && !ruleMatches(map, input, ruleTriggers, rule.match)) {
      continue;
    }
    if (isDefaultRule) {
      ruleTriggers.push("default rule");
    }

    const outcome = rule.outcome;
    let modelTier = outcome.modelTier;
    let modelSlug = outcome.modelSlug ?? null;
    let fallbackSlugs = outcome.fallbackSlugs ?? [];

    if (outcome.useTierDefault) {
      const tierResolved = resolveTierDefault(
        map,
        modelTier === "human_review" ? "balanced" : modelTier
      );
      modelSlug = tierResolved.slug;
      fallbackSlugs = tierResolved.fallbacks;
    }

    if (modelSlug) {
      const entry = readModelBySlug(map, modelSlug);
      if (entry) {
        modelTier = entry.modelTier;
        if (!fallbackSlugs.length && entry.fallbackSlugs?.length) {
          fallbackSlugs = entry.fallbackSlugs;
        }
      }
    }

    if (subagentDefault && isDefaultRule && !input.explicitModelTier) {
      modelSlug = subagentDefault.modelSlug;
      modelTier = subagentDefault.modelTier;
      fallbackSlugs = readModelBySlug(map, modelSlug)?.fallbackSlugs ?? fallbackSlugs;
      ruleTriggers.push(`subagentTypeDefault=${input.subagentType}`);
    }

    if (input.explicitModelTier) {
      const tierResolved = resolveTierDefault(map, input.explicitModelTier);
      if (tierResolved.slug) {
        modelSlug = tierResolved.slug;
        modelTier = input.explicitModelTier;
        fallbackSlugs = tierResolved.fallbacks;
        ruleTriggers.push(`explicitModelTier=${input.explicitModelTier}`);
      }
    }

    return {
      mapId: map.mapId,
      ruleId: rule.ruleId,
      modelSlug,
      modelTier,
      modelHint: modelSlug,
      rationale: outcome.rationale,
      fallbackSlugs,
      escalationTriggers: ruleTriggers
    };
  }

  const balanced = resolveTierDefault(map, "balanced");
  return {
    mapId: map.mapId,
    ruleId: "fallback_balanced",
    modelSlug: balanced.slug,
    modelTier: "balanced",
    modelHint: balanced.slug,
    rationale: "No selection rule matched; fell back to balanced tier default.",
    fallbackSlugs: balanced.fallbacks,
    escalationTriggers: []
  };
}

/** Map packet tier labels (tier_1/2/3) to scope-heavy model tiers for cross-layer use. */
export function packetTierLabelToDefaultScopeLevels(
  label: "tier_1" | "tier_2" | "tier_3"
): Partial<Record<string, ModelSelectionScopeLevel>> {
  if (label === "tier_1") {
    return { complexity: "low", risk: "low", ambiguity: "low" };
  }
  if (label === "tier_2") {
    return { complexity: "medium", risk: "medium", ambiguity: "low" };
  }
  return { complexity: "high", risk: "medium", ambiguity: "medium" };
}
