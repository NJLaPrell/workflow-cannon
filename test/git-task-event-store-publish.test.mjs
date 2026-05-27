import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  assignEventSequences,
  detectTaskVersionConflict,
  publishTaskStateEvents,
  taskVersionMapFromProjection
} from "../dist/modules/task-engine/task-state-git/publish-task-state-events.js";
import { replayTaskStateEvents } from "../dist/modules/task-engine/task-state-events/event-applier.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";
import { resolveTaskStateGitRef } from "../dist/modules/task-engine/task-state-git/git-io.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSrc = path.join(
  repoRoot,
  "src/modules/task-engine/task-state-git/fixtures/branch-layout"
);

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

function draftUpdatedEvent(taskId, eventId) {
  return {
    schemaVersion: 1,
    eventId,
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-27T00:20:00.000Z",
    actor: { id: "test@example.com", source: "explicit" },
    command: { name: "update-task", moduleId: "task-engine" },
    kind: "task.updated",
    payload: {
      taskId,
      changedFields: ["summary"],
      payloadDigest: "d".repeat(64)
    }
  };
}

function draftCreatedEvent(taskId, eventId) {
  return {
    schemaVersion: 1,
    eventId,
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-27T00:20:00.000Z",
    actor: { id: "test@example.com", source: "explicit" },
    command: { name: "create-task", moduleId: "task-engine" },
    kind: "task.created",
    payload: {
      taskId,
      initialStatus: "proposed",
      title: "Publish test",
      type: "workspace-kit"
    }
  };
}

async function seedRemoteTaskStateBranch() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-publish-remote-"));
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "wk-publish-bare-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  fs.cpSync(layoutSrc, workspace, { recursive: true });
  runGit(workspace, ["add", "task-state"]);
  runGit(workspace, ["commit", "-m", "task-state layout"]);
  runGit(workspace, ["branch", TASK_STATE_GIT_BRANCH]);
  runGit(bare, ["init", "--bare"]);
  runGit(workspace, ["remote", "add", "origin", bare]);
  runGit(workspace, ["push", "-u", "origin", TASK_STATE_GIT_BRANCH]);
  const resolved = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in resolved, false);
  return { workspace, bare, headSha: resolved.tipSha };
}

test("assignEventSequences chains parent and sequence from head", () => {
  const assigned = assignEventSequences(
    [draftCreatedEvent("T1", "e1"), draftUpdatedEvent("T1", "e2")],
    { latestSequence: 2, latestEventId: "prior" }
  );
  assert.deepEqual(
    assigned.map((e) => e.sequence),
    [3, 4]
  );
  assert.equal(assigned[0].parentEventId, "prior");
  assert.equal(assigned[1].parentEventId, "e1");
});

test("detectTaskVersionConflict flags stale writer", () => {
  const conflict = detectTaskVersionConflict({
    expectedTaskVersions: { T1: 1 },
    remoteVersions: new Map([["T1", 2]]),
    events: [draftUpdatedEvent("T1", "e3")]
  });
  assert.equal(conflict?.taskId, "T1");
  assert.equal(conflict?.expected, 1);
  assert.equal(conflict?.actual, 2);
});

test("publishTaskStateEvents appends to branch without push", async () => {
  const { workspace, headSha } = await seedRemoteTaskStateBranch();
  const result = await publishTaskStateEvents({
    workspacePath: workspace,
    events: [draftCreatedEvent("T900", "tse.publish.create")],
    expectedHeadSha: headSha,
    expectedTaskVersions: { T900: 0 },
    push: false
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.publishedEvents[0].sequence, 1);
  const resolved = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in resolved, false);
});

test("publishTaskStateEvents returns task conflict without retry", async () => {
  const { workspace, headSha } = await seedRemoteTaskStateBranch();
  const first = await publishTaskStateEvents({
    workspacePath: workspace,
    events: [draftCreatedEvent("T901", "tse.publish.a")],
    expectedHeadSha: headSha,
    expectedTaskVersions: { T901: 0 },
    push: true
  });
  assert.equal(first.ok, true);
  const headAfterFirst = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in headAfterFirst, false);
  const replay = replayTaskStateEvents(first.publishedEvents);
  assert.equal(replay.ok, true);
  const versions = taskVersionMapFromProjection(replay.result.projection);
  assert.equal(versions.get("T901"), 1);

  const conflict = await publishTaskStateEvents({
    workspacePath: workspace,
    events: [draftUpdatedEvent("T901", "tse.publish.b")],
    expectedHeadSha: headAfterFirst.tipSha,
    expectedTaskVersions: { T901: 0 },
    push: false
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "task-state-publish-task-conflict");
});

test("publishTaskStateEvents retries unrelated concurrent push", async () => {
  const { workspace, headSha } = await seedRemoteTaskStateBranch();
  const first = await publishTaskStateEvents({
    workspacePath: workspace,
    events: [draftCreatedEvent("T902", "tse.publish.c1")],
    expectedHeadSha: headSha,
    expectedTaskVersions: { T902: 0 },
    push: true
  });
  assert.equal(first.ok, true, JSON.stringify(first));

  const headAfterFirst = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in headAfterFirst, false);

  const second = await publishTaskStateEvents({
    workspacePath: workspace,
    events: [draftCreatedEvent("T903", "tse.publish.c2")],
    expectedHeadSha: headSha,
    expectedTaskVersions: { T903: 0 },
    push: true,
    maxAttempts: 3
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.ok(second.attempts >= 1);
  const headAfterSecond = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.notEqual(headAfterSecond.tipSha, headSha);
});
