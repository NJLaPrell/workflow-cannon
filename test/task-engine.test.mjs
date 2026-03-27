import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TaskStore,
  TransitionService,
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard,
  getNextActions,
  taskEngineModule,
  ModuleRegistry,
  ModuleCommandRouter
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "T001",
    status: "ready",
    type: "workspace-kit",
    title: "Test task",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

async function tmpDir(prefix = "te-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function storeWithTasks(tasks, dir) {
  const workspace = dir ?? await tmpDir();
  const store = new TaskStore(workspace);
  for (const task of tasks) {
    store.addTask(task);
  }
  await store.save();
  return { store, workspace };
}

// ---------------------------------------------------------------------------
// T184: Transition map
// ---------------------------------------------------------------------------

test("isTransitionAllowed accepts all valid transitions", () => {
  const valid = [
    ["proposed", "ready"],
    ["proposed", "cancelled"],
    ["ready", "in_progress"],
    ["ready", "blocked"],
    ["ready", "cancelled"],
    ["in_progress", "completed"],
    ["in_progress", "cancelled"],
    ["in_progress", "blocked"],
    ["in_progress", "ready"],
    ["blocked", "ready"],
    ["blocked", "cancelled"]
  ];
  for (const [from, to] of valid) {
    assert.ok(isTransitionAllowed(from, to), `${from} -> ${to} should be allowed`);
  }
});

test("isTransitionAllowed rejects disallowed transitions", () => {
  const invalid = [
    ["completed", "ready"],
    ["completed", "in_progress"],
    ["cancelled", "ready"],
    ["cancelled", "proposed"],
    ["proposed", "in_progress"],
    ["proposed", "blocked"],
    ["blocked", "in_progress"],
    ["blocked", "completed"],
    ["ready", "proposed"],
    ["in_progress", "proposed"]
  ];
  for (const [from, to] of invalid) {
    assert.equal(isTransitionAllowed(from, to), false, `${from} -> ${to} should be disallowed`);
  }
});

test("getTransitionAction returns correct action verbs", () => {
  assert.equal(getTransitionAction("proposed", "ready"), "accept");
  assert.equal(getTransitionAction("proposed", "cancelled"), "reject");
  assert.equal(getTransitionAction("ready", "in_progress"), "start");
  assert.equal(getTransitionAction("in_progress", "completed"), "complete");
  assert.equal(getTransitionAction("in_progress", "cancelled"), "decline");
  assert.equal(getTransitionAction("in_progress", "ready"), "pause");
  assert.equal(getTransitionAction("blocked", "ready"), "unblock");
});

test("resolveTargetState maps action to target state", () => {
  assert.equal(resolveTargetState("proposed", "accept"), "ready");
  assert.equal(resolveTargetState("ready", "start"), "in_progress");
  assert.equal(resolveTargetState("in_progress", "complete"), "completed");
  assert.equal(resolveTargetState("in_progress", "decline"), "cancelled");
  assert.equal(resolveTargetState("in_progress", "pause"), "ready");
  assert.equal(resolveTargetState("blocked", "unblock"), "ready");
  assert.equal(resolveTargetState("completed", "start"), undefined);
});

test("getAllowedTransitionsFrom returns all transitions from a state", () => {
  const fromReady = getAllowedTransitionsFrom("ready");
  const actions = fromReady.map((t) => t.action).sort();
  assert.deepEqual(actions, ["block", "cancel", "start"]);

  const fromCompleted = getAllowedTransitionsFrom("completed");
  assert.equal(fromCompleted.length, 0);
});

// ---------------------------------------------------------------------------
// T184: State validity guard
// ---------------------------------------------------------------------------

test("state-validity guard allows valid transitions", () => {
  const task = makeTask({ status: "ready" });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = stateValidityGuard.canTransition(task, "in_progress", ctx);
  assert.equal(result.allowed, true);
});

test("state-validity guard rejects invalid transitions", () => {
  const task = makeTask({ status: "completed" });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = stateValidityGuard.canTransition(task, "ready", ctx);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "invalid-transition");
});

// ---------------------------------------------------------------------------
// T184: Dependency check guard
// ---------------------------------------------------------------------------

test("dependency-check guard allows start when all deps completed", () => {
  const dep = makeTask({ id: "T000", status: "completed" });
  const task = makeTask({ id: "T001", status: "ready", dependsOn: ["T000"] });
  const ctx = { allTasks: [dep, task], timestamp: new Date().toISOString() };
  const result = dependencyCheckGuard.canTransition(task, "in_progress", ctx);
  assert.equal(result.allowed, true);
});

test("dependency-check guard blocks start when deps not completed", () => {
  const dep = makeTask({ id: "T000", status: "in_progress" });
  const task = makeTask({ id: "T001", status: "ready", dependsOn: ["T000"] });
  const ctx = { allTasks: [dep, task], timestamp: new Date().toISOString() };
  const result = dependencyCheckGuard.canTransition(task, "in_progress", ctx);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "dependency-unsatisfied");
});

test("dependency-check guard skips check for non-dep transitions", () => {
  const task = makeTask({ id: "T001", status: "in_progress", dependsOn: ["T999"] });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = dependencyCheckGuard.canTransition(task, "completed", ctx);
  assert.equal(result.allowed, true);
});

test("dependency-check guard allows task with no deps", () => {
  const task = makeTask({ id: "T001", status: "ready" });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = dependencyCheckGuard.canTransition(task, "in_progress", ctx);
  assert.equal(result.allowed, true);
});

// ---------------------------------------------------------------------------
// T184: TransitionValidator
// ---------------------------------------------------------------------------

test("TransitionValidator runs guards in order and stops on first rejection", () => {
  let called = 0;
  const failGuard = {
    name: "always-fail",
    canTransition: () => {
      called++;
      return { allowed: false, guardName: "always-fail", code: "guard-rejected", message: "nope" };
    }
  };
  const neverReached = {
    name: "never-reached",
    canTransition: () => {
      called++;
      return { allowed: true, guardName: "never-reached" };
    }
  };

  const validator = new TransitionValidator([failGuard, neverReached]);
  const task = makeTask({ status: "ready" });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = validator.validate(task, "in_progress", ctx);

  assert.equal(result.allowed, false);
  assert.equal(called, 1, "Only failGuard should run; built-in guards pass, neverReached is short-circuited");
});

test("TransitionValidator passes when all guards allow", () => {
  const validator = new TransitionValidator();
  const task = makeTask({ status: "ready" });
  const ctx = { allTasks: [task], timestamp: new Date().toISOString() };
  const result = validator.validate(task, "in_progress", ctx);

  assert.equal(result.allowed, true);
  assert.ok(result.guardResults.length >= 2);
});

// ---------------------------------------------------------------------------
// T185: TaskStore persistence
// ---------------------------------------------------------------------------

test("TaskStore persists and reloads tasks", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addTask(makeTask({ id: "T100", status: "ready" }));
  store.addTask(makeTask({ id: "T101", status: "proposed" }));
  await store.save();

  const reloaded = new TaskStore(workspace);
  await reloaded.load();
  assert.equal(reloaded.getAllTasks().length, 2);
  assert.equal(reloaded.getTask("T100").status, "ready");
  assert.equal(reloaded.getTask("T101").status, "proposed");
});

test("TaskStore initializes empty when file does not exist", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  await store.load();
  assert.equal(store.getAllTasks().length, 0);
});

test("TaskStore rejects duplicate task IDs", () => {
  const store = new TaskStore("/tmp/test");
  store.addTask(makeTask({ id: "T001" }));
  assert.throws(
    () => store.addTask(makeTask({ id: "T001" })),
    (err) => err instanceof TaskEngineError && err.code === "duplicate-task-id"
  );
});

test("TaskStore updateTask throws for missing task", () => {
  const store = new TaskStore("/tmp/test");
  assert.throws(
    () => store.updateTask(makeTask({ id: "T999" })),
    (err) => err instanceof TaskEngineError && err.code === "task-not-found"
  );
});

test("TaskStore persists transition evidence", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addEvidence({
    transitionId: "test-1",
    taskId: "T001",
    fromState: "ready",
    toState: "in_progress",
    action: "start",
    guardResults: [{ allowed: true, guardName: "state-validity" }],
    dependentsUnblocked: [],
    timestamp: new Date().toISOString()
  });
  await store.save();

  const reloaded = new TaskStore(workspace);
  await reloaded.load();
  assert.equal(reloaded.getTransitionLog().length, 1);
  assert.equal(reloaded.getTransitionLog()[0].transitionId, "test-1");
});

// ---------------------------------------------------------------------------
// T185: TransitionService
// ---------------------------------------------------------------------------

test("TransitionService applies valid transition", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "ready" })]);

  const service = new TransitionService(store);
  const result = await service.runTransition({ taskId: "T001", action: "start", actor: "test" });

  assert.equal(result.evidence.fromState, "ready");
  assert.equal(result.evidence.toState, "in_progress");
  assert.equal(result.evidence.action, "start");
  assert.equal(store.getTask("T001").status, "in_progress");
});

test("TransitionService rejects invalid action", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "completed" })]);

  const service = new TransitionService(store);
  await assert.rejects(
    () => service.runTransition({ taskId: "T001", action: "start" }),
    (err) => err instanceof TaskEngineError && err.code === "invalid-transition"
  );
});

test("TransitionService rejects missing task", async () => {
  const { store } = await storeWithTasks([]);

  const service = new TransitionService(store);
  await assert.rejects(
    () => service.runTransition({ taskId: "T999", action: "start" }),
    (err) => err instanceof TaskEngineError && err.code === "task-not-found"
  );
});

test("TransitionService enforces dependency check", async () => {
  const dep = makeTask({ id: "T000", status: "in_progress" });
  const task = makeTask({ id: "T001", status: "ready", dependsOn: ["T000"] });
  const { store } = await storeWithTasks([dep, task]);

  const service = new TransitionService(store);
  await assert.rejects(
    () => service.runTransition({ taskId: "T001", action: "start" }),
    (err) => err instanceof TaskEngineError && err.code === "dependency-unsatisfied"
  );
});

test("TransitionService auto-unblocks dependents on completion", async () => {
  const dep = makeTask({ id: "T000", status: "in_progress" });
  const blocked = makeTask({ id: "T001", status: "blocked", dependsOn: ["T000"] });
  const { store } = await storeWithTasks([dep, blocked]);

  const service = new TransitionService(store);
  const result = await service.runTransition({ taskId: "T000", action: "complete" });

  assert.equal(result.evidence.dependentsUnblocked.length, 1);
  assert.equal(result.evidence.dependentsUnblocked[0], "T001");
  assert.equal(result.autoUnblocked.length, 1);
  assert.equal(store.getTask("T001").status, "ready");
});

test("TransitionService auto-unblock cascades through chains", async () => {
  const t1 = makeTask({ id: "T001", status: "in_progress" });
  const t2 = makeTask({ id: "T002", status: "blocked", dependsOn: ["T001"] });
  const { store } = await storeWithTasks([t1, t2]);

  const service = new TransitionService(store);
  const result = await service.runTransition({ taskId: "T001", action: "complete" });

  assert.equal(store.getTask("T002").status, "ready");
  assert.ok(result.autoUnblocked.length >= 1);
});

test("TransitionService does not unblock when other deps still pending", async () => {
  const t1 = makeTask({ id: "T001", status: "in_progress" });
  const t2 = makeTask({ id: "T002", status: "ready" });
  const blocked = makeTask({ id: "T003", status: "blocked", dependsOn: ["T001", "T002"] });
  const { store } = await storeWithTasks([t1, t2, blocked]);

  const service = new TransitionService(store);
  await service.runTransition({ taskId: "T001", action: "complete" });

  assert.equal(store.getTask("T003").status, "blocked");
});

test("TransitionService emits evidence for every transition", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "ready" })]);

  const service = new TransitionService(store);
  await service.runTransition({ taskId: "T001", action: "start" });
  await service.runTransition({ taskId: "T001", action: "complete" });

  const log = store.getTransitionLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].action, "start");
  assert.equal(log[1].action, "complete");
});

test("TransitionService evidence includes guard results", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "ready" })]);

  const service = new TransitionService(store);
  const result = await service.runTransition({ taskId: "T001", action: "start" });

  assert.ok(result.evidence.guardResults.length >= 2);
  assert.ok(result.evidence.guardResults.every((r) => r.allowed));
});

// ---------------------------------------------------------------------------
// T185: Full lifecycle walkthrough
// ---------------------------------------------------------------------------

test("Full lifecycle: proposed → ready → in_progress → completed", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "proposed" })]);

  const service = new TransitionService(store);
  await service.runTransition({ taskId: "T001", action: "accept" });
  assert.equal(store.getTask("T001").status, "ready");

  await service.runTransition({ taskId: "T001", action: "start" });
  assert.equal(store.getTask("T001").status, "in_progress");

  await service.runTransition({ taskId: "T001", action: "complete" });
  assert.equal(store.getTask("T001").status, "completed");
});

test("Pause and resume: in_progress → ready → in_progress", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "in_progress" })]);

  const service = new TransitionService(store);
  await service.runTransition({ taskId: "T001", action: "pause" });
  assert.equal(store.getTask("T001").status, "ready");

  await service.runTransition({ taskId: "T001", action: "start" });
  assert.equal(store.getTask("T001").status, "in_progress");
});

// ---------------------------------------------------------------------------
// T217: Next-action suggestion engine
// ---------------------------------------------------------------------------

test("getNextActions returns ready queue sorted by priority", () => {
  const tasks = [
    makeTask({ id: "T001", status: "ready", priority: "P2" }),
    makeTask({ id: "T002", status: "ready", priority: "P1" }),
    makeTask({ id: "T003", status: "ready", priority: "P3" }),
    makeTask({ id: "T004", status: "completed" })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.readyQueue.length, 3);
  assert.equal(result.readyQueue[0].id, "T002");
  assert.equal(result.readyQueue[1].id, "T001");
  assert.equal(result.readyQueue[2].id, "T003");
});

test("getNextActions suggests highest priority task", () => {
  const tasks = [
    makeTask({ id: "T001", status: "ready", priority: "P2" }),
    makeTask({ id: "T002", status: "ready", priority: "P1" })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.suggestedNext.id, "T002");
});

test("getNextActions returns null suggestedNext when no ready tasks", () => {
  const tasks = [
    makeTask({ id: "T001", status: "completed" }),
    makeTask({ id: "T002", status: "blocked" })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.suggestedNext, null);
  assert.equal(result.readyQueue.length, 0);
});

test("getNextActions state summary counts all states", () => {
  const tasks = [
    makeTask({ id: "T001", status: "proposed" }),
    makeTask({ id: "T002", status: "ready" }),
    makeTask({ id: "T003", status: "in_progress" }),
    makeTask({ id: "T004", status: "blocked" }),
    makeTask({ id: "T005", status: "completed" }),
    makeTask({ id: "T006", status: "cancelled" })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.stateSummary.proposed, 1);
  assert.equal(result.stateSummary.ready, 1);
  assert.equal(result.stateSummary.in_progress, 1);
  assert.equal(result.stateSummary.blocked, 1);
  assert.equal(result.stateSummary.completed, 1);
  assert.equal(result.stateSummary.cancelled, 1);
  assert.equal(result.stateSummary.total, 6);
});

test("getNextActions blocking analysis identifies blocked dependencies", () => {
  const tasks = [
    makeTask({ id: "T001", status: "in_progress" }),
    makeTask({ id: "T002", status: "ready" }),
    makeTask({ id: "T003", status: "blocked", dependsOn: ["T001", "T002"] })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.blockingAnalysis.length, 1);
  assert.equal(result.blockingAnalysis[0].taskId, "T003");
  assert.deepEqual(result.blockingAnalysis[0].blockedBy, ["T001", "T002"]);
  assert.equal(result.blockingAnalysis[0].blockingCount, 2);
});

test("getNextActions handles empty task list", () => {
  const result = getNextActions([]);
  assert.equal(result.readyQueue.length, 0);
  assert.equal(result.suggestedNext, null);
  assert.equal(result.stateSummary.total, 0);
  assert.equal(result.blockingAnalysis.length, 0);
});

test("getNextActions handles all-complete state", () => {
  const tasks = [
    makeTask({ id: "T001", status: "completed" }),
    makeTask({ id: "T002", status: "completed" })
  ];

  const result = getNextActions(tasks);
  assert.equal(result.readyQueue.length, 0);
  assert.equal(result.suggestedNext, null);
  assert.equal(result.stateSummary.completed, 2);
});

// ---------------------------------------------------------------------------
// T184/T185: Module registration and onCommand integration
// ---------------------------------------------------------------------------

test("taskEngineModule registration includes all instruction entries", () => {
  const entries = taskEngineModule.registration.instructions.entries;
  const names = entries.map((e) => e.name);
  assert.ok(names.includes("run-transition"));
  assert.ok(names.includes("get-task"));
  assert.ok(names.includes("list-tasks"));
  assert.ok(names.includes("get-ready-queue"));
  assert.ok(names.includes("get-next-actions"));
  assert.ok(names.includes("dashboard-summary"));
});

test("taskEngineModule passes ModuleRegistry validation", () => {
  assert.doesNotThrow(() => new ModuleRegistry([taskEngineModule]));
});

test("taskEngineModule onCommand list-tasks returns empty on fresh store", async () => {
  const workspace = await tmpDir();
  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
  assert.equal(result.data.count, 0);
});

test("taskEngineModule onCommand get-task returns task-not-found for missing task", async () => {
  const workspace = await tmpDir();
  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand(
    { name: "get-task", args: { taskId: "T999" } },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "task-not-found");
});

test("taskEngineModule onCommand get-task includes recentTransitions after transitions", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready" }));
  await store.save();

  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  let r = await taskEngineModule.onCommand(
    { name: "run-transition", args: { taskId: "T001", action: "start" } },
    ctx
  );
  assert.equal(r.ok, true);

  r = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T001", historyLimit: 10 } }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.data.task.status, "in_progress");
  assert.ok(Array.isArray(r.data.recentTransitions));
  assert.ok(r.data.recentTransitions.length >= 1);
  assert.equal(r.data.recentTransitions[0].taskId, "T001");
  assert.equal(r.data.recentTransitions[0].action, "start");
  assert.ok(Array.isArray(r.data.allowedActions));
  const actions = r.data.allowedActions.map((x) => x.action).sort();
  assert.ok(actions.includes("complete"));
  assert.ok(actions.includes("block"));
});

test("taskEngineModule onCommand dashboard-summary returns stable shape", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P1" }));
  await store.save();

  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "dashboard-summary");
  const d = result.data;
  assert.equal(d.schemaVersion, 1);
  assert.ok(typeof d.taskStoreLastUpdated === "string");
  assert.equal(d.stateSummary.ready, 1);
  assert.equal(d.readyQueueCount, 1);
  assert.equal(d.suggestedNext.id, "T001");
  assert.ok(Array.isArray(d.blockingAnalysis));
  assert.ok("blockedSummary" in d);
});

test("taskEngineModule onCommand run-transition validates required args", async () => {
  const workspace = await tmpDir();
  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand(
    { name: "run-transition", args: {} },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-task-schema");
});

test("taskEngineModule onCommand get-next-actions works on populated store", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P2", title: "Second" }));
  store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1", title: "First" }));
  store.addTask(makeTask({ id: "T003", status: "completed", title: "Done" }));
  await store.save();

  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand(
    { name: "get-next-actions", args: {} },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "next-actions-retrieved");
  assert.match(result.message, /T002/);
});

test("taskEngineModule onCommand get-ready-queue returns priority-sorted tasks", async () => {
  const workspace = await tmpDir();
  const store = new TaskStore(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P3" }));
  store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1" }));
  store.addTask(makeTask({ id: "T003", status: "blocked" }));
  await store.save();

  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };
  const result = await taskEngineModule.onCommand(
    { name: "get-ready-queue", args: {} },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 2);
  assert.equal(result.data.tasks[0].id, "T002");
});

test("taskEngineModule routes through ModuleCommandRouter", async () => {
  const registry = new ModuleRegistry([taskEngineModule]);
  const router = new ModuleCommandRouter(registry);
  const workspace = await tmpDir();
  const ctx = { runtimeVersion: "0.1", workspacePath: workspace };

  const result = await router.execute("list-tasks", {}, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
});
