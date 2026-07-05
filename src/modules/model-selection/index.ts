import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import type { ModelSelectionMapV1, ModelSelectionScopeInput, ModelSelectionScopeLevel } from "../../contracts/model-selection-map.v1.js";
import { selectSubagentModel, packetTierLabelToDefaultScopeLevels } from "../../core/agent-orchestration/select-subagent-model.js";
import type { AgentModelTier } from "../../contracts/agent-orchestration.js";

const DEFAULT_MAP_PATH = ".ai/cursor-model-selection-map.v1.json";

function loadModelSelectionMap(workspacePath: string, overridePath?: string): ModelSelectionMapV1 | null {
  const filePath = join(workspacePath, overridePath ?? DEFAULT_MAP_PATH);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ModelSelectionMapV1;
  } catch {
    return null;
  }
}

const VALID_SCOPE_LEVELS = new Set<string>(["low", "medium", "high", "critical"]);
const VALID_MODEL_TIERS = new Set<string>(["cheap_fast", "balanced", "high_reasoning", "specialist"]);
const VALID_PACKET_TIER_LABELS = new Set<string>(["tier_1", "tier_2", "tier_3"]);

function cleanScopeLevel(raw: unknown): ModelSelectionScopeLevel | undefined {
  return typeof raw === "string" && VALID_SCOPE_LEVELS.has(raw)
    ? (raw as ModelSelectionScopeLevel)
    : undefined;
}

function cleanModelTier(raw: unknown): Exclude<AgentModelTier, "human_review"> | undefined {
  return typeof raw === "string" && VALID_MODEL_TIERS.has(raw)
    ? (raw as Exclude<AgentModelTier, "human_review">)
    : undefined;
}

function buildScopeInput(args: Record<string, unknown>): ModelSelectionScopeInput {
  const levels: Partial<Record<string, ModelSelectionScopeLevel>> = {};

  // Accept explicit dimension levels
  const complexity = cleanScopeLevel(args.complexity);
  if (complexity) levels.complexity = complexity;

  const risk = cleanScopeLevel(args.risk);
  if (risk) levels.risk = risk;

  const ambiguity = cleanScopeLevel(args.ambiguity);
  if (ambiguity) levels.ambiguity = ambiguity;

  const scopeBreadth = cleanScopeLevel(args.scopeBreadth ?? args.scope_breadth);
  if (scopeBreadth) levels.scope_breadth = scopeBreadth;

  // Accept a packet tier label as a shorthand (maps to preset scope levels)
  const packetTier = args.packetTier ?? args.packet_tier;
  if (typeof packetTier === "string" && VALID_PACKET_TIER_LABELS.has(packetTier)) {
    const presetLevels = packetTierLabelToDefaultScopeLevels(
      packetTier as "tier_1" | "tier_2" | "tier_3"
    );
    // Merge: explicit args win over preset
    for (const [dim, level] of Object.entries(presetLevels)) {
      if (level && !levels[dim]) {
        levels[dim] = level;
      }
    }
  }

  const subagentType =
    typeof args.subagentType === "string" && args.subagentType.trim()
      ? args.subagentType.trim()
      : undefined;

  const taskTypeHints = Array.isArray(args.taskTypeHints)
    ? (args.taskTypeHints as unknown[])
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .map((h) => h.trim())
    : undefined;

  const ownedPathCount =
    typeof args.ownedPathCount === "number" && Number.isInteger(args.ownedPathCount)
      ? args.ownedPathCount
      : undefined;

  const ownedAreaCount =
    typeof args.ownedAreaCount === "number" && Number.isInteger(args.ownedAreaCount)
      ? args.ownedAreaCount
      : undefined;

  const requiresApprovalPaths = args.requiresApprovalPaths === true;

  const explicitModelTier = cleanModelTier(args.explicitModelTier ?? args.modelTier);

  return {
    levels,
    subagentType,
    taskTypeHints,
    ownedPathCount,
    ownedAreaCount,
    ...(requiresApprovalPaths ? { requiresApprovalPaths } : {}),
    ...(explicitModelTier ? { explicitModelTier } : {})
  };
}

export const modelSelectionModule: WorkflowModule = {
  registration: {
    id: "model-selection",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["model-selection"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/model-selection/instructions/recommend-model.md",
      format: "md",
      description: "Model-selection map for Cursor Task-tool subagent dispatch."
    },
    instructions: {
      directory: "src/modules/model-selection/instructions",
      entries: builtinInstructionEntriesForModule("model-selection")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};

    if (command.name === "recommend-model") {
      const workspacePath = ctx.workspacePath ?? process.cwd();
      const overridePath =
        typeof args.mapPath === "string" && args.mapPath.trim() ? args.mapPath.trim() : undefined;

      const map = loadModelSelectionMap(workspacePath, overridePath);
      if (!map) {
        return {
          ok: false,
          code: "model-selection-map-not-found",
          message: `Could not load model selection map at ${join(workspacePath, overridePath ?? DEFAULT_MAP_PATH)}. Run from the repo root or pass mapPath.`
        };
      }

      const input = buildScopeInput(args);
      const result = selectSubagentModel(map, input);

      const primary = result.modelSlug
        ? { modelSlug: result.modelSlug, modelTier: result.modelTier }
        : null;

      const fallbackRecommendations = result.fallbackSlugs
        .map((slug) => {
          const entry = map.models.find((m) => m.modelSlug === slug && m.enabled !== false);
          return entry
            ? { modelSlug: slug, modelTier: entry.modelTier, costBand: entry.costBand }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 2);

      return {
        ok: true,
        code: "model-recommended",
        message: result.modelSlug
          ? `Recommended model: ${result.modelSlug} (${result.modelTier})`
          : `No specific model slug; use ${result.modelTier} tier default`,
        data: {
          responseSchemaVersion: 1,
          mapId: map.mapId,
          hostHint: map.hostHint,
          primary,
          modelSlug: result.modelSlug,
          modelTier: result.modelTier,
          modelHint: result.modelHint,
          rationale: result.rationale,
          ruleId: result.ruleId,
          escalationTriggers: result.escalationTriggers,
          fallbackSlugs: result.fallbackSlugs,
          fallbackRecommendations,
          scopeInput: input
        } as Record<string, unknown>
      };
    }

    if (command.name === "list-model-selection-map") {
      const workspacePath = ctx.workspacePath ?? process.cwd();
      const overridePath =
        typeof args.mapPath === "string" && args.mapPath.trim() ? args.mapPath.trim() : undefined;

      const map = loadModelSelectionMap(workspacePath, overridePath);
      if (!map) {
        return {
          ok: false,
          code: "model-selection-map-not-found",
          message: `Could not load model selection map at ${join(workspacePath, overridePath ?? DEFAULT_MAP_PATH)}.`
        };
      }

      return {
        ok: true,
        code: "model-selection-map-listed",
        message: `Model selection map: ${map.mapId} (${map.hostHint}), ${map.models.length} models, ${map.selectionRules.length} rules`,
        data: {
          responseSchemaVersion: 1,
          mapId: map.mapId,
          hostHint: map.hostHint,
          description: map.description,
          modelCount: map.models.length,
          models: map.models.map((m) => ({
            modelSlug: m.modelSlug,
            displayName: m.displayName,
            modelTier: m.modelTier,
            costBand: m.costBand,
            strengths: m.strengths,
            enabled: m.enabled !== false
          })),
          scopeDimensions: map.scopeDimensions.map((d) => ({
            id: d.id,
            label: d.label,
            weight: d.weight
          })),
          tierDefaults: map.tierDefaults,
          subagentTypeDefaults: map.subagentTypeDefaults
            ? Object.fromEntries(
                Object.entries(map.subagentTypeDefaults).map(([k, v]) => [
                  k,
                  { modelSlug: v.modelSlug, modelTier: v.modelTier }
                ])
              )
            : undefined
        } as Record<string, unknown>
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `model-selection does not implement ${command.name}`
    };
  }
};
