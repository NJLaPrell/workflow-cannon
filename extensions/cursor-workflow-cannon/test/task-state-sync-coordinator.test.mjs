import test from "node:test";
import assert from "node:assert/strict";

import { TaskStateSyncCoordinator } from "../dist/runtime/task-state-sync-coordinator.js";

function policyApproval() {
  return { confirmed: true, rationale: "test sync" };
}

test("TaskStateSyncCoordinator hydrates when git branch is behind", async () => {
  const calls = [];
  const coordinator = new TaskStateSyncCoordinator({
    policyApproval,
    run: async (command, args) => {
      calls.push({ command, fetch: args.fetch });
      if (command === "task-state-status") {
        return { ok: true, code: "task-state-status-read", data: { syncState: "behind", reason: "seq" } };
      }
      if (command === "task-state-hydrate") {
        return { ok: true, code: "task-state-hydrated", message: "ok" };
      }
      throw new Error(`unexpected ${command}`);
    }
  });

  const result = await coordinator.syncNow("test");
  assert.equal(result.ok, true);
  assert.equal(result.action, "hydrated");
  assert.deepEqual(
    calls.map((c) => c.command),
    ["task-state-status", "task-state-hydrate"]
  );
  assert.equal(calls[0]?.fetch, true);
  assert.equal(calls[1]?.fetch, true);
});

test("TaskStateSyncCoordinator applies local tail when git is current", async () => {
  const calls = [];
  const coordinator = new TaskStateSyncCoordinator({
    policyApproval,
    run: async (command) => {
      calls.push(command);
      if (command === "task-state-status") {
        return { ok: true, data: { syncState: "current" } };
      }
      if (command === "apply-task-state-events") {
        return { ok: true, code: "task-state-events-applied" };
      }
      throw new Error(`unexpected ${command}`);
    }
  });

  const result = await coordinator.syncNow("test");
  assert.equal(result.action, "applied");
  assert.deepEqual(calls, ["task-state-status", "apply-task-state-events"]);
});

test("TaskStateSyncCoordinator skips mutate on conflict", async () => {
  const calls = [];
  const coordinator = new TaskStateSyncCoordinator({
    policyApproval,
    run: async (command) => {
      calls.push(command);
      return { ok: true, data: { syncState: "conflict", reason: "ahead" } };
    }
  });

  const result = await coordinator.syncNow("test");
  assert.equal(result.action, "skipped");
  assert.deepEqual(calls, ["task-state-status"]);
});

test("TaskStateSyncCoordinator coalesces concurrent syncNow", async () => {
  let runs = 0;
  const coordinator = new TaskStateSyncCoordinator({
    policyApproval,
    run: async (command) => {
      if (command === "task-state-status") {
        runs += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { ok: true, data: { syncState: "current" } };
      }
      return { ok: true, code: "task-state-events-already-current" };
    }
  });

  const [a, b] = await Promise.all([coordinator.syncNow("a"), coordinator.syncNow("b")]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(runs, 1);
});

test("TaskStateSyncCoordinator debounces requestSync", async () => {
  let runs = 0;
  const coordinator = new TaskStateSyncCoordinator({
    policyApproval,
    debounceMs: 40,
    run: async (command) => {
      if (command === "task-state-status") {
        runs += 1;
        return { ok: true, data: { syncState: "current" } };
      }
      return { ok: true, code: "task-state-events-already-current" };
    }
  });

  coordinator.requestSync("one");
  coordinator.requestSync("two");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(runs, 1);
});
