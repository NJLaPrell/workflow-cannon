import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAgentDefinitionV1 } from "../dist/core/validation/agent-orchestration/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptPath = path.join(root, ".ai", "prompts", "planning-agent.md");
const fixturePath = path.join(
  root,
  "fixtures",
  "agent-orchestration",
  "agent-definition-planning-agent.v1.json"
);
const caeRegistryPath = path.join(root, ".ai", "cae", "registry", "artifacts.v1.json");

test("planning-agent prompt contract references planner-chat and session commands", () => {
  const prompt = fs.readFileSync(promptPath, "utf8");

  assert.match(prompt, /planner-chat/);
  assert.match(prompt, /\.ai\/playbooks\/planner-chat\.md/);
  assert.match(prompt, /start-idea-planning/);
  assert.match(prompt, /update-idea-planning-session/);
  assert.match(prompt, /accepted PlanArtifact with complete WBS/i);
  assert.match(prompt, /one useful question at a time/i);
  assert.match(prompt, /not.*command names.*JSON payloads/is);
  assert.match(prompt, /Warnings do not block acceptance/i);
  assert.match(prompt, /Default planning profile.*minimal/is);
});

test("planning-agent AgentDefinition fixture validates and links playbook metadata", () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const result = validateAgentDefinitionV1(fixture);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(fixture.agentDefinitionId, "planning-agent");
  assert.equal(fixture.metadata.playbookId, "planner-chat");
  assert.equal(fixture.metadata.promptPath, ".ai/prompts/planning-agent.md");
  assert.deepEqual(fixture.metadata.sessionCommands, [
    "start-idea-planning",
    "update-idea-planning-session"
  ]);
});

test("CAE registry includes planning-agent artifact", () => {
  const registry = JSON.parse(fs.readFileSync(caeRegistryPath, "utf8"));
  const artifact = registry.artifacts.find((entry) => entry.artifactId === "cae.agent.planning-agent");

  assert.ok(artifact, "missing cae.agent.planning-agent registry entry");
  assert.equal(artifact.ref.path, ".ai/prompts/planning-agent.md");
  assert.ok(artifact.tags.includes("planner-chat"));
});
