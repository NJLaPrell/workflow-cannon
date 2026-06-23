process.env.WORKSPACE_KIT_CLI_PERF_TRACE = "true";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs/promises";

import { runCli } from "../dist/cli.js";
import { cliPerfTracer } from "../dist/core/cli-perf-trace.js";

function createCapture() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

async function createDoctorFixture(rootDir) {
  const workspaceKitDir = path.join(rootDir, ".workspace-kit");
  const schemasDir = path.join(rootDir, "schemas");
  await fs.mkdir(workspaceKitDir, { recursive: true });
  await fs.mkdir(schemasDir, { recursive: true });

  await fs.writeFile(
    path.join(rootDir, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "fixture-project" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    )
  );

  await fs.writeFile(
    path.join(schemasDir, "workspace-kit-profile.schema.json"),
    JSON.stringify({ type: "object" }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, "manifest.json"),
    JSON.stringify({ schemaVersion: 1 }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, "owned-paths.json"),
    JSON.stringify({ schemaVersion: 1, ownedPaths: [] }, null, 2)
  );

  const stamp = {
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: "v22.11.0",
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules,
    packageRoot: process.cwd(),
    checkedAt: "2026-05-12T00:00:00.000Z"
  };
  await fs.writeFile(path.join(workspaceKitDir, "runtime.json"), JSON.stringify(stamp, null, 2));
  await fs.mkdir(path.join(workspaceKitDir, "bin"), { recursive: true });
  await fs.writeFile(path.join(workspaceKitDir, "bin", "wk"), "# dummy launcher", "utf8");

  const tasksDir = path.join(workspaceKitDir, "tasks");
  await fs.mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, "workspace-kit.db");
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    task_store_json TEXT NOT NULL
  );`);
  const emptyTaskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare("INSERT OR REPLACE INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)").run(
    emptyTaskDoc
  );
  db.close();
}

test("T3 CLI Wrapper read_hot performance bypasses", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-perf-t3-"));
  await createDoctorFixture(fixtureRoot);

  // Set up mock process.stderr.write capture since performance tracing prints to stderr
  const originalStderrWrite = process.stderr.write;
  let stderrOutput = "";
  process.stderr.write = function (chunk, encoding, callback) {
    stderrOutput += chunk.toString();
    if (typeof callback === "function") callback();
    return true;
  };

  process.env.WORKSPACE_KIT_CLI_PERF_TRACE = "true";

  await t.test("read_hot command (dashboard-service-status) skips policy, auto-checkpoint, hooks, and cae", async () => {
    cliPerfTracer.reset();
    stderrOutput = "";
    const capture = createCapture();
    
    // We execute dashboard-service-status which is classified as read_hot
    const code = await runCli(["run", "dashboard-service-status", "{}"], { cwd: fixtureRoot, ...capture });
    
    assert.equal(code, 0, "read_hot command should run successfully");
    
    // Check that we skipped the heavy spans
    assert.ok(!stderrOutput.includes("span=policy/session grant checks"), "Should skip policy check span");
    assert.ok(!stderrOutput.includes("span=tryAutoCheckpointBeforeRun"), "Should skip checkpoint span");
    assert.ok(!stderrOutput.includes("span=lifecycle hook bus setup"), "Should skip lifecycle hooks span");
    assert.ok(!stderrOutput.includes("span=CAE preflight"), "Should skip CAE preflight span");
  });

  await t.test("normal read command (list-tasks) runs policy, hook, and cae but skips auto-checkpoint", async () => {
    cliPerfTracer.reset();
    stderrOutput = "";
    const capture = createCapture();
    
    // We execute list-tasks which is classified as read
    const code = await runCli(["run", "list-tasks", '{"limit":1}'], { cwd: fixtureRoot, ...capture });
    
    assert.equal(code, 0, "normal read command should run successfully");
    
    // Check that normal read command runs policy, hooks, and cae, but skips auto-checkpoint
    assert.ok(stderrOutput.includes("span=policy/session grant checks"), "Should run policy check span");
    assert.ok(stderrOutput.includes("span=lifecycle hook bus setup"), "Should run lifecycle hooks span");
    assert.ok(stderrOutput.includes("span=CAE preflight"), "Should run CAE preflight span");
    assert.ok(!stderrOutput.includes("span=tryAutoCheckpointBeforeRun"), "Should skip checkpoint span");
  });

  // Restore stderr before cleanup
  process.stderr.write = originalStderrWrite;
  delete process.env.WORKSPACE_KIT_CLI_PERF_TRACE;

  // Cleanup
  await rm(fixtureRoot, { recursive: true, force: true });
});
