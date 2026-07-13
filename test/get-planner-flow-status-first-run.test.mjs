import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule } from "../dist/index.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "get-planner-flow-status-first-run-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return { workspace };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

async function runFlowStatus(workspace, args = {}) {
  return planningModule.onCommand({ name: "get-planner-flow-status", args }, ctx(workspace));
}

test("get-planner-flow-status returns first-run guidance for empty Ideas inventory", async () => {
  const { workspace } = await tmpWorkspace();
  const out = await runFlowStatus(workspace);

  assert.equal(out.ok, true);
  assert.equal(out.code, "planner-flow-status");
  assert.equal(out.data.responseSchemaVersion, 1);
  assert.equal(out.data.goldenPathStage, "first_run");
  assert.equal(out.data.ideaCount, 0);
  assert.ok(out.data.blockers.some((b) => b.code === "ideas-inventory-empty"));
  assert.equal(out.data.mismatches.length, 0);
  assert.equal(out.data.recommendedNextCommand.command, "create-idea");
  assert.equal(typeof out.data.recommendedNextCommand.readyRun.argv, "string");
  assert.match(out.data.recommendedNextCommand.readyRun.argv, /create-idea/);
  assert.equal(typeof out.data.planningGeneration, "number");
  assert.ok(["require", "off", "advisory"].includes(out.data.planningGenerationPolicy));
  assert.equal(out.data.recommendedNextCommand.readyRun.args.policyApproval?.confirmed, true);
});

test("get-planner-flow-status does not require policyApproval on the read path", async () => {
  const { workspace } = await tmpWorkspace();
  const out = await runFlowStatus(workspace);
  assert.equal(out.ok, true);
  assert.equal("policyApproval" in (out.data ?? {}), false);
});
