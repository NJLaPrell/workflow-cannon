import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule } from "../dist/modules/planning/index.js";

async function tmpDir(prefix = "planning-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("planningModule list-planning-types returns typed workflow descriptors", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "list-planning-types", args: {} },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-types-listed");
  assert.ok(Array.isArray(result.data.planningTypes));
  assert.ok(result.data.planningTypes.some((x) => x.type === "new-feature"));
});

test("planningModule build-plan validates planningType and returns scaffold", async () => {
  const workspace = await tmpDir();
  const invalid = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "unknown" } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-planning-type");

  const valid = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "task-breakdown" } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.code, "planning-questions");
  assert.equal(valid.data.planningType, "task-breakdown");
  assert.ok(Array.isArray(valid.data.unresolvedCritical));
  assert.ok(valid.data.unresolvedCritical.length > 0);
});

test("planningModule build-plan hard-blocks finalize when critical unknowns remain", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "new-feature", finalize: true, answers: {} } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "planning-critical-unknowns");
});

test("planningModule build-plan returns ready when critical answers are present", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        answers: {
          featureGoal: "Deliver a planning dashboard",
          placement: "CLI command",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        },
        finalize: true
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-ready");
});
