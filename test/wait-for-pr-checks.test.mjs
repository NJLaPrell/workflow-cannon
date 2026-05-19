import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluatePrChecks,
  parsePrChecksJson,
  waitForPrChecks
} from "../dist/modules/task-engine/wait-for-pr-checks-runtime.js";
import { taskEngineModule } from "../dist/index.js";
import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";

test("parsePrChecksJson and evaluatePrChecks handle pending and failed", () => {
  const pending = parsePrChecksJson(JSON.stringify([{ name: "test", state: "PENDING" }]));
  assert.equal(evaluatePrChecks(pending).state, "pending");

  const failed = parsePrChecksJson(
    JSON.stringify([
      { name: "test", state: "SUCCESS" },
      { name: "lint", state: "FAILURE", link: "https://example.com" }
    ])
  );
  const ev = evaluatePrChecks(failed);
  assert.equal(ev.state, "failed");
  assert.equal(ev.failedChecks[0]?.name, "lint");

  const passed = parsePrChecksJson(JSON.stringify([{ name: "test", state: "SUCCESS" }]));
  assert.equal(evaluatePrChecks(passed).state, "passed");
});

test("waitForPrChecks returns passed without sleeping when gh reports success", () => {
  let slept = 0;
  const result = waitForPrChecks({
    workspacePath: process.cwd(),
    pr: 400,
    timeoutSec: 60,
    intervalSec: 5,
    requiredOnly: true,
    sleepMs: () => {
      slept += 1;
    },
    runGh: () => ({
      ok: true,
      raw: JSON.stringify([{ name: "test", state: "SUCCESS" }])
    })
  });
  assert.equal(result.state, "passed");
  assert.equal(slept, 0);
});

test("waitForPrChecks times out when checks stay pending", () => {
  const result = waitForPrChecks({
    workspacePath: process.cwd(),
    pr: 1,
    timeoutSec: 1,
    intervalSec: 1,
    requiredOnly: true,
    nowMs: (() => {
      let t = 0;
      return () => {
        t += 500;
        return t;
      };
    })(),
    sleepMs: () => {},
    runGh: () => ({
      ok: true,
      raw: JSON.stringify([{ name: "test", state: "IN_PROGRESS" }])
    })
  });
  assert.equal(result.state, "timeout");
});

test("taskEngineModule wait-for-pr-checks rejects missing pr", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-wait-"));
  try {
    await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
    const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
    dual.loadFromDisk();
    const result = await taskEngineModule.onCommand(
      { name: "wait-for-pr-checks", args: {} },
      {
        runtimeVersion: "0.1",
        workspacePath: workspace,
        effectiveConfig: { tasks: { persistenceBackend: "sqlite" } }
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-run-args");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
