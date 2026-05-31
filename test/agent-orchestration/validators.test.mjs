/**
 * Runtime validators for agent orchestration contracts (T100638 / T-AO-120).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateAgentActivityV1,
  validateAgentDefinitionV1,
  validateAgentSessionV1,
  validateAssignmentMetadataV1,
  validateHandoffV2
} from "../../dist/core/validation/agent-orchestration/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesRoot = path.join(root, "fixtures", "agent-orchestration");

function loadFixture(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, relativePath), "utf8"));
}

describe("agent orchestration validators — golden fixtures", () => {
  it("accepts AgentDefinition fixtures", () => {
    for (const file of [
      "agent-definition-task-worker.v1.json",
      "agent-definition-orchestration-agent.v1.json"
    ]) {
      const payload = loadFixture(file);
      const result = validateAgentDefinitionV1(payload);
      assert.equal(result.ok, true, `${file}: ${JSON.stringify(result)}`);
    }
  });

  it("accepts AgentSession fixture", () => {
    const result = validateAgentSessionV1(loadFixture("agent-session-task-worker.v1.json"));
    assert.equal(result.ok, true);
  });

  it("accepts assignment metadata fixture", () => {
    const result = validateAssignmentMetadataV1(loadFixture("assignment-metadata-task-worker.v1.json"));
    assert.equal(result.ok, true);
  });

  it("accepts AgentActivity fixture", () => {
    const result = validateAgentActivityV1(loadFixture("agent-activity-working-task.v1.json"));
    assert.equal(result.ok, true);
  });

  it("accepts Handoff v2 fixtures", () => {
    const dir = path.join(fixturesRoot, "handoff-v2");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const result = validateHandoffV2(loadFixture(path.join("handoff-v2", file)));
      assert.equal(result.ok, true, `${file}: ${JSON.stringify(result)}`);
    }
  });
});

describe("agent orchestration validators — malformed payloads", () => {
  it("rejects non-object roots with invalid-orchestration-schema", () => {
    const result = validateAgentDefinitionV1("nope");
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-orchestration-schema");
    assert.match(result.message, /JSON object/i);
  });

  it("rejects missing required AgentDefinition fields clearly", () => {
    const base = loadFixture("agent-definition-task-worker.v1.json");
    delete base.displayName;
    const result = validateAgentDefinitionV1(base);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing-required-orchestration-field");
    assert.ok(result.issues.some((i) => i.path.includes("displayName") || i.message.includes("displayName")));
  });

  it("rejects unknown top-level fields on AgentDefinition", () => {
    const base = loadFixture("agent-definition-task-worker.v1.json");
    const result = validateAgentDefinitionV1({ ...base, surpriseField: true });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown-orchestration-field");
  });

  it("allows extension keys under metadata per A-SCHEMA", () => {
    const base = loadFixture("agent-definition-task-worker.v1.json");
    const result = validateAgentDefinitionV1({
      ...base,
      metadata: { customBridge: "ok" }
    });
    assert.equal(result.ok, true);
  });

  it("warns on unknown capabilities without failing", () => {
    const base = loadFixture("agent-definition-task-worker.v1.json");
    const result = validateAgentDefinitionV1({
      ...base,
      requiredCapabilities: [...base.requiredCapabilities, "teleport_files"]
    });
    assert.equal(result.ok, true);
    assert.ok(result.warnings?.some((w) => w.code === "unknown-capability"));
  });

  it("rejects invalid enum on AgentSession status", () => {
    const base = loadFixture("agent-session-task-worker.v1.json");
    const result = validateAgentSessionV1({ ...base, status: "exploded" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-orchestration-enum");
  });

  it("rejects unknown assignment metadata keys in strict schema", () => {
    const base = loadFixture("assignment-metadata-task-worker.v1.json");
    const result = validateAssignmentMetadataV1({ ...base, extraScope: ["src/**"] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown-orchestration-field");
  });

  it("requires ownedPaths only when strict option is set", () => {
    const minimal = {
      schemaVersion: 1,
      agentDefinitionId: "task-worker",
      contextProfileId: "task_worker_context_v1",
      accessProfileId: "task_worker_strict_v1",
      handoffContractId: "implementation_handoff_v2"
    };
    assert.equal(validateAssignmentMetadataV1(minimal).ok, true);
    const strict = validateAssignmentMetadataV1(minimal, { strict: true });
    assert.equal(strict.ok, false);
    assert.equal(strict.code, "missing-required-orchestration-field");
  });

  it("rejects Handoff v2 with wrong schemaVersion", () => {
    const base = loadFixture("handoff-v2/handoff-completed.v2.json");
    const result = validateHandoffV2({ ...base, schemaVersion: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-handoff-schema-version");
  });

  it("rejects empty Handoff v2 summary with handoff-v2-missing-field", () => {
    const base = loadFixture("handoff-v2/handoff-completed.v2.json");
    const result = validateHandoffV2({ ...base, summary: "" });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((i) => i.code === "handoff-v2-missing-field"),
      JSON.stringify(result.issues)
    );
  });

  it("rejects missing Handoff v2 evidenceRefs", () => {
    const base = loadFixture("handoff-v2/handoff-completed.v2.json");
    delete base.evidenceRefs;
    const result = validateHandoffV2(base);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "handoff-v2-missing-field"));
  });

  it("allows arbitrary keys under AgentActivity details", () => {
    const base = loadFixture("agent-activity-working-task.v1.json");
    const result = validateAgentActivityV1({
      ...base,
      details: { nested: { ok: true } }
    });
    assert.equal(result.ok, true);
  });
});
