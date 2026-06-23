/**
 * Model selection map fixture + selectSubagentModel resolver.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { selectSubagentModel } from "../../dist/core/agent-orchestration/select-subagent-model.js";
import { validateModelSelectionMapV1 } from "../../dist/core/validation/agent-orchestration/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mapFixturePath = path.join(root, "fixtures", "agent-orchestration", "model-selection-map.cursor.v1.json");

function loadMap() {
  return JSON.parse(fs.readFileSync(mapFixturePath, "utf8"));
}

describe("model selection map", () => {
  it("validates the Cursor host golden fixture", () => {
    const map = loadMap();
    const result = validateModelSelectionMapV1(map);
    assert.equal(result.ok, true, JSON.stringify(result));
  });

  it("selects human_review for critical policy scope", () => {
    const map = loadMap();
    const result = selectSubagentModel(map, {
      levels: { policy_sensitivity: "critical" }
    });
    assert.equal(result.ruleId, "human_review_gate");
    assert.equal(result.modelTier, "human_review");
    assert.equal(result.modelSlug, null);
  });

  it("selects codex for architecture/runtime refactor hints", () => {
    const map = loadMap();
    const result = selectSubagentModel(map, {
      levels: { architecture_impact: "high", complexity: "high" },
      taskTypeHints: ["shared-runtime", "cli-refactor"]
    });
    assert.equal(result.ruleId, "architecture_runtime_refactor");
    assert.equal(result.modelSlug, "gpt-5.3-codex");
  });

  it("selects composer fast for narrow mechanical work", () => {
    const map = loadMap();
    const result = selectSubagentModel(map, {
      levels: { complexity: "low", risk: "low", ambiguity: "low" },
      ownedPathCount: 2,
      taskTypeHints: ["fixtures"]
    });
    assert.equal(result.ruleId, "narrow_mechanical");
    assert.equal(result.modelSlug, "composer-2.5-fast");
  });

  it("uses subagent type default for explore when no escalation rules match", () => {
    const map = loadMap();
    const result = selectSubagentModel(map, {
      levels: { complexity: "medium", risk: "low", ambiguity: "low" },
      subagentType: "explore"
    });
    assert.equal(result.ruleId, "default_balanced_worker");
    assert.equal(result.modelSlug, "composer-2.5-fast");
  });

  it("escalates when two high-weight scope dimensions fire", () => {
    const map = loadMap();
    const result = selectSubagentModel(map, {
      levels: { complexity: "high", risk: "high", ambiguity: "low" }
    });
    assert.equal(result.ruleId, "high_weight_escalation");
    assert.equal(result.modelSlug, "gpt-5.5-high");
  });
});
