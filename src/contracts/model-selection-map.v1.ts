/**
 * Subagent model selection map v1.
 * Mirror: schemas/agent-orchestration/model-selection-map.v1.json
 * Host-specific catalog + rules for orchestrators choosing Task-tool model slugs.
 */

import type { AgentHostHint, AgentModelTier } from "./agent-orchestration.js";

export const MODEL_SELECTION_MAP_SCHEMA_VERSION = 1 as const;

export const MODEL_SELECTION_SCOPE_LEVELS = ["low", "medium", "high", "critical"] as const;
export type ModelSelectionScopeLevel = (typeof MODEL_SELECTION_SCOPE_LEVELS)[number];

export const MODEL_SELECTION_COST_BANDS = ["minimal", "low", "medium", "high", "premium"] as const;
export type ModelSelectionCostBand = (typeof MODEL_SELECTION_COST_BANDS)[number];

export const MODEL_SELECTION_SCOPE_WEIGHTS = ["low", "medium", "high", "critical"] as const;
export type ModelSelectionScopeWeight = (typeof MODEL_SELECTION_SCOPE_WEIGHTS)[number];

export type ModelSelectionCapabilityScores = {
  reasoning: number;
  code: number;
  speed: number;
  costEfficiency: number;
  contextHandling?: number;
  toolUse?: number;
};

export type ModelSelectionMapEntry = {
  modelSlug: string;
  displayName?: string;
  modelTier: AgentModelTier;
  capabilities: ModelSelectionCapabilityScores;
  costBand: ModelSelectionCostBand;
  strengths?: string[];
  avoidWhen?: string[];
  fallbackSlugs?: string[];
  enabled?: boolean;
};

export type ModelSelectionScopeDimension = {
  id: string;
  label: string;
  weight: ModelSelectionScopeWeight;
  description: string;
  escalatesAt?: ModelSelectionScopeLevel;
};

export type ModelSelectionScopeMatch = {
  anyAtOrAbove?: Partial<Record<string, ModelSelectionScopeLevel>>;
  allAtOrAbove?: Partial<Record<string, ModelSelectionScopeLevel>>;
  highWeightCountAtOrAbove?: {
    level: ModelSelectionScopeLevel;
    count: number;
  };
  subagentTypes?: string[];
  taskTypeHints?: string[];
  ownedPathCountAtLeast?: number;
  ownedAreaCountAtLeast?: number;
  requiresApprovalPaths?: boolean;
};

export type ModelSelectionRuleOutcome = {
  modelSlug?: string | null;
  modelTier: AgentModelTier;
  rationale: string;
  useTierDefault?: boolean;
  fallbackSlugs?: string[];
};

export type ModelSelectionRule = {
  ruleId: string;
  priority: number;
  label?: string;
  match: ModelSelectionScopeMatch;
  outcome: ModelSelectionRuleOutcome;
};

export type ModelSelectionTierDefault = {
  modelSlug: string;
  fallbackSlugs?: string[];
};

export type ModelSelectionSubagentTypeDefault = {
  modelSlug: string;
  modelTier: AgentModelTier;
  rationale: string;
};

export type ModelSelectionMapV1 = {
  schemaVersion: typeof MODEL_SELECTION_MAP_SCHEMA_VERSION;
  mapId: string;
  hostHint: AgentHostHint;
  description?: string;
  models: ModelSelectionMapEntry[];
  scopeDimensions: ModelSelectionScopeDimension[];
  selectionRules: ModelSelectionRule[];
  subagentTypeDefaults?: Record<string, ModelSelectionSubagentTypeDefault>;
  tierDefaults?: Partial<Record<Exclude<AgentModelTier, "human_review">, ModelSelectionTierDefault>>;
};

/** Evaluated scope signals supplied by an orchestrator or derived from a task packet. */
export type ModelSelectionScopeInput = {
  levels: Partial<Record<string, ModelSelectionScopeLevel>>;
  subagentType?: string;
  taskTypeHints?: string[];
  ownedPathCount?: number;
  ownedAreaCount?: number;
  requiresApprovalPaths?: boolean;
  explicitModelTier?: AgentModelTier;
};

export type ModelSelectionResult = {
  mapId: string;
  ruleId: string;
  modelSlug: string | null;
  modelTier: AgentModelTier;
  modelHint: string | null;
  rationale: string;
  fallbackSlugs: string[];
  escalationTriggers: string[];
};
