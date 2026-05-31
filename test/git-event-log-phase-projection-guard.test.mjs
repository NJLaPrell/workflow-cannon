/**
 * Phase projection count guard (T100634).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPhaseProjectionCountGuard,
  buildPhaseProjectionCountGuardAsync,
  isPhaseProjectionCountGuardActive
} from "../dist/modules/task-engine/sync-backends/git-event-log-phase-projection-guard.js";
import {
  countPhaseDeliveryTasksForKey,
  listPhaseDeliveryTaskIdsForKey
} from "../dist/modules/task-engine/delivery-evidence.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSrc = path.join(repoRoot, "src/modules/task-engine/task-state-git/fixtures/branch-layout");

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function seedWorkspaceWithTaskStateBranch() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase-proj-guard-"));
  runGit(workspace, ["init"]);
  runGit(workspace, ["config", "user.email", "test@example.com"]);
  runGit(workspace, ["config", "user.name", "Test"]);
  fs.cpSync(layoutSrc, workspace, { recursive: true });
  runGit(workspace, ["add", "task-state"]);
  runGit(workspace, ["commit", "-m", "task-state layout"]);
  runGit(workspace, ["branch", "workflow-cannon/task-state"]);
  return workspace;
}

function makeTask(overrides = {}) {
  return {
    id: "T9001",
    status: "ready",
    type: "improvement",
    title: "Fixture task",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    phaseKey: "126",
    phase: "Phase 126",
    ...overrides
  };
}

test("isPhaseProjectionCountGuardActive requires git-event-log authority", () => {
  assert.equal(isPhaseProjectionCountGuardActive({ tasks: { canonicalAuthority: "sqlite" } }), false);
  assert.equal(isPhaseProjectionCountGuardActive({ tasks: { canonicalAuthority: "git-event-log" } }), true);
});

test("countPhaseDeliveryTasksForKey ignores archived and unphased tasks", () => {
  const tasks = [
    makeTask({ id: "T1", phaseKey: "126" }),
    makeTask({ id: "T2", phaseKey: "127" }),
    makeTask({ id: "T3", phaseKey: "126", archived: true }),
    makeTask({ id: "T4", type: "wishlist_intake", phaseKey: "126" })
  ];
  assert.equal(countPhaseDeliveryTasksForKey(tasks, "126"), 1);
  assert.deepEqual(listPhaseDeliveryTaskIdsForKey(tasks, "126"), ["T1"]);
});

test("buildPhaseProjectionCountGuard inactive for sqlite authority", () => {
  const report = buildPhaseProjectionCountGuard({
    workspacePath: "/tmp/unused",
    effectiveConfig: { tasks: { canonicalAuthority: "sqlite" } },
    localTasks: [makeTask()],
    phaseKey: "126"
  });
  assert.equal(report.active, false);
  assert.equal(report.passed, true);
});

test("buildPhaseProjectionCountGuard blocks sqlite-only phase tasks", () => {
  const workspace = seedWorkspaceWithTaskStateBranch();
  const report = buildPhaseProjectionCountGuard({
    workspacePath: workspace,
    effectiveConfig: { tasks: { canonicalAuthority: "git-event-log" } },
    localTasks: [makeTask({ id: "T9901" }), makeTask({ id: "T9902" })],
    phaseKey: "126"
  });
  assert.equal(report.active, true);
  assert.equal(report.passed, false);
  assert.ok(
    report.findings.some(
      (row) => row.code === "phase-projection-local-exceeds-remote" && row.severity === "blocking"
    )
  );
  assert.deepEqual(report.findings[0]?.details.localOnlyTaskIds, ["T9901", "T9902"]);
});

test("buildPhaseProjectionCountGuardAsync passes when local matches empty git replay", async () => {
  const workspace = seedWorkspaceWithTaskStateBranch();
  const report = await buildPhaseProjectionCountGuardAsync({
    workspacePath: workspace,
    effectiveConfig: { tasks: { canonicalAuthority: "git-event-log" } },
    localTasks: [],
    phaseKey: "126"
  });
  assert.equal(report.active, true);
  assert.equal(report.passed, true);
  assert.equal(report.localCount, 0);
  assert.equal(report.remoteCount, 0);
});
