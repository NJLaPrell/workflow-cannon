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
  UnifiedStateDb,
  ModuleRegistry,
  ModuleCommandRouter,
  appendPolicyTrace
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

/** Task-engine tests seed JSON via `TaskStore.forJsonFile`; pin JSON persistence (kit default is SQLite). */
function jsonTaskEngineCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: { tasks: { persistenceBackend: "json" } }
  };
}

async function storeWithTasks(tasks, dir) {
  const workspace = dir ?? await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
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
    ["ready", "proposed"],
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
    ["in_progress", "proposed"]
  ];
  for (const [from, to] of invalid) {
    assert.equal(isTransitionAllowed(from, to), false, `${from} -> ${to} should be disallowed`);
  }
});

test("getTransitionAction returns correct action verbs", () => {
  assert.equal(getTransitionAction("proposed", "ready"), "accept");
  assert.equal(getTransitionAction("proposed", "cancelled"), "reject");
  assert.equal(getTransitionAction("ready", "proposed"), "demote");
  assert.equal(getTransitionAction("ready", "in_progress"), "start");
  assert.equal(getTransitionAction("in_progress", "completed"), "complete");
  assert.equal(getTransitionAction("in_progress", "cancelled"), "decline");
  assert.equal(getTransitionAction("in_progress", "ready"), "pause");
  assert.equal(getTransitionAction("blocked", "ready"), "unblock");
});

test("resolveTargetState maps action to target state", () => {
  assert.equal(resolveTargetState("proposed", "accept"), "ready");
  assert.equal(resolveTargetState("ready", "demote"), "proposed");
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
  assert.deepEqual(actions, ["block", "cancel", "demote", "start"]);

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
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T100", status: "ready" }));
  store.addTask(makeTask({ id: "T101", status: "proposed" }));
  await store.save();

  const reloaded = TaskStore.forJsonFile(workspace);
  await reloaded.load();
  assert.equal(reloaded.getAllTasks().length, 2);
  assert.equal(reloaded.getTask("T100").status, "ready");
  assert.equal(reloaded.getTask("T101").status, "proposed");
});

test("TaskStore initializes empty when file does not exist", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  await store.load();
  assert.equal(store.getAllTasks().length, 0);
});

test("TaskStore rejects duplicate task IDs", () => {
  const store = TaskStore.forJsonFile("/tmp/test");
  store.addTask(makeTask({ id: "T001" }));
  assert.throws(
    () => store.addTask(makeTask({ id: "T001" })),
    (err) => err instanceof TaskEngineError && err.code === "duplicate-task-id"
  );
});

test("TaskStore updateTask throws for missing task", () => {
  const store = TaskStore.forJsonFile("/tmp/test");
  assert.throws(
    () => store.updateTask(makeTask({ id: "T999" })),
    (err) => err instanceof TaskEngineError && err.code === "task-not-found"
  );
});

test("TaskStore persists transition evidence", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
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

  const reloaded = TaskStore.forJsonFile(workspace);
  await reloaded.load();
  assert.equal(reloaded.getTransitionLog().length, 1);
  assert.equal(reloaded.getTransitionLog()[0].transitionId, "test-1");
});

test("TaskStore concurrent saves do not produce malformed JSON", async () => {
  const workspace = await tmpDir();
  const a = TaskStore.forJsonFile(workspace);
  const b = TaskStore.forJsonFile(workspace);
  a.addTask(makeTask({ id: "T201", status: "ready" }));
  b.addTask(makeTask({ id: "T202", status: "ready" }));

  await Promise.all([a.save(), b.save()]);

  const raw = await readFile(path.join(workspace, ".workspace-kit", "tasks", "state.json"), "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.schemaVersion, 1);
  assert.ok(Array.isArray(parsed.tasks));
  assert.ok(typeof parsed.lastUpdated === "string");
});

test("appendPolicyTrace concurrent writes preserve line-delimited JSON", async () => {
  const workspace = await tmpDir();
  const now = new Date().toISOString();
  await Promise.all([
    appendPolicyTrace(workspace, {
      timestamp: now,
      operationId: "improvement.ingest-transcripts",
      command: "run ingest-transcripts",
      actor: "a@example.com",
      allowed: true,
      rationale: "concurrency-a"
    }),
    appendPolicyTrace(workspace, {
      timestamp: now,
      operationId: "improvement.generate-recommendations",
      command: "run generate-recommendations",
      actor: "b@example.com",
      allowed: false,
      message: "denied"
    })
  ]);

  const raw = await readFile(path.join(workspace, ".workspace-kit", "policy", "traces.jsonl"), "utf8");
  const lines = raw.trim().split("\n");
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.schemaVersion, 1);
    assert.ok(typeof parsed.operationId === "string");
    assert.ok(typeof parsed.allowed === "boolean");
  }
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

test("Demote: ready → proposed (return to triage without cancelling)", async () => {
  const { store } = await storeWithTasks([makeTask({ id: "T001", status: "ready" })]);

  const service = new TransitionService(store);
  const result = await service.runTransition({ taskId: "T001", action: "demote" });
  assert.equal(result.evidence.fromState, "ready");
  assert.equal(result.evidence.toState, "proposed");
  assert.equal(result.evidence.action, "demote");
  assert.equal(store.getTask("T001").status, "proposed");
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
  assert.ok(names.includes("create-task"));
  assert.ok(names.includes("update-task"));
  assert.ok(names.includes("archive-task"));
  assert.ok(names.includes("add-dependency"));
  assert.ok(names.includes("remove-dependency"));
  assert.ok(names.includes("get-dependency-graph"));
  assert.ok(names.includes("get-task-history"));
  assert.ok(names.includes("get-recent-task-activity"));
  assert.ok(names.includes("get-task-summary"));
  assert.ok(names.includes("get-blocked-summary"));
  assert.ok(names.includes("create-task-from-plan"));
  assert.ok(names.includes("get-task"));
  assert.ok(names.includes("list-tasks"));
  assert.ok(names.includes("get-ready-queue"));
  assert.ok(names.includes("get-next-actions"));
  assert.ok(names.includes("queue-health"));
  assert.ok(names.includes("dashboard-summary"));
  assert.ok(names.includes("create-wishlist"));
  assert.ok(names.includes("list-wishlist"));
  assert.ok(names.includes("get-wishlist"));
  assert.ok(names.includes("update-wishlist"));
  assert.ok(names.includes("convert-wishlist"));
});

test("taskEngineModule passes ModuleRegistry validation", () => {
  assert.doesNotThrow(() => new ModuleRegistry([taskEngineModule]));
});

test("taskEngineModule onCommand list-tasks returns empty on fresh store", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
  assert.equal(result.data.count, 0);
  assert.equal(result.data.scope, "tasks-only");
});

test("taskEngineModule list-tasks supports type/category/tags/metadata filters", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(
    makeTask({
      id: "T410",
      type: "improvement",
      phase: "Phase 16 - Maintenance and stability",
      metadata: {
        category: "reliability",
        tags: ["ui", "sqlite"],
        owner: { team: "platform" }
      }
    })
  );
  store.addTask(
    makeTask({
      id: "T411",
      type: "workspace-kit",
      phase: "Phase 16 - Maintenance and stability",
      metadata: {
        category: "ops",
        tags: ["docs"],
        owner: { team: "maintainers" }
      }
    })
  );
  await store.save();

  const result = await taskEngineModule.onCommand(
    {
      name: "list-tasks",
      args: {
        type: "improvement",
        category: "reliability",
        tags: ["ui"],
        metadataFilters: { "owner.team": "platform" }
      }
    },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 1);
  assert.equal(result.data.tasks[0].id, "T410");
});

test("taskEngineModule list-tasks filter combinations return empty results when unmatched", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(
    makeTask({
      id: "T412",
      type: "improvement",
      metadata: { category: "reliability", tags: ["ui"], risk: { level: "low" } }
    })
  );
  await store.save();

  const result = await taskEngineModule.onCommand(
    {
      name: "list-tasks",
      args: { type: "improvement", category: "ops", tags: ["sqlite"], metadataFilters: { "risk.level": "high" } }
    },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 0);
  assert.deepEqual(result.data.tasks, []);
});

test("taskEngineModule onCommand get-task returns task-not-found for missing task", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "get-task", args: { taskId: "T999" } },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "task-not-found");
});

test("taskEngineModule onCommand get-task includes recentTransitions after transitions", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready" }));
  await store.save();

  const ctx = jsonTaskEngineCtx(workspace);
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
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P1" }));
  await store.save();

  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "dashboard-summary");
  const d = result.data;
  assert.equal(d.schemaVersion, 1);
  assert.ok(typeof d.taskStoreLastUpdated === "string");
  assert.equal(d.stateSummary.ready, 1);
  assert.equal(d.readyQueueCount, 1);
  assert.deepEqual(d.readyQueueBreakdown, { schemaVersion: 1, improvement: 0, other: 1 });
  assert.equal(d.suggestedNext.id, "T001");
  assert.ok(Array.isArray(d.blockingAnalysis));
  assert.ok("blockedSummary" in d);
  assert.equal(d.executionPlanningScope, "tasks-only");
  assert.equal(d.wishlist.schemaVersion, 1);
  assert.equal(d.wishlist.openCount, 0);
  assert.equal(d.wishlist.totalCount, 0);
  assert.ok(Array.isArray(d.wishlist.openTop));
  assert.equal(d.wishlist.openTop.length, 0);
  assert.equal(d.planningSession, null);
});

test("taskEngineModule onCommand run-transition validates required args", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "run-transition", args: {} },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-task-schema");
});

test("taskEngineModule onCommand get-next-actions works on populated store", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P2", title: "Second" }));
  store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1", title: "First" }));
  store.addTask(makeTask({ id: "T003", status: "completed", title: "Done" }));
  await store.save();

  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "get-next-actions", args: {} },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "next-actions-retrieved");
  assert.match(result.message, /T002/);
});

test("taskEngineModule onCommand queue-health detects unmet deps on ready tasks", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  const now = new Date().toISOString();
  store.addTask({
    id: "T1",
    status: "in_progress",
    type: "workspace-kit",
    title: "Blocking",
    createdAt: now,
    updatedAt: now
  });
  store.addTask({
    id: "T2",
    status: "ready",
    type: "workspace-kit",
    title: "Ready blocked",
    createdAt: now,
    updatedAt: now,
    priority: "P1",
    dependsOn: ["T1"],
    phase: "Phase 28 (test)"
  });
  await store.save();
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: { persistenceBackend: "json" },
      kit: { currentPhaseNumber: 28 }
    }
  };
  const result = await taskEngineModule.onCommand({ name: "queue-health", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "queue-health");
  assert.equal(result.data.summary.blockedByDependenciesCount, 1);
  assert.equal(result.data.summary.misalignedPhaseCount, 0);
  const row = result.data.readyTaskSummaries.find((r) => r.taskId === "T2");
  assert.ok(row);
  assert.equal(row.blockedByDependencies, true);
  assert.deepEqual(row.unmetDependencies, ["T1"]);
});

test("taskEngineModule onCommand queue-health detects phase mismatch", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  const now = new Date().toISOString();
  store.addTask({
    id: "T2",
    status: "ready",
    type: "workspace-kit",
    title: "Wrong phase",
    createdAt: now,
    updatedAt: now,
    priority: "P1",
    phase: "Phase 99 (stale)"
  });
  await store.save();
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: { persistenceBackend: "json" },
      kit: { currentPhaseNumber: 28 }
    }
  };
  const result = await taskEngineModule.onCommand({ name: "queue-health", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.misalignedPhaseCount, 1);
  const row = result.data.readyTaskSummaries[0];
  assert.equal(row.phaseAligned, false);
});

test("taskEngineModule list-tasks includeQueueHints aligns with queue-health signals", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  const now = new Date().toISOString();
  store.addTask({
    id: "T1",
    status: "in_progress",
    type: "workspace-kit",
    title: "Blocking",
    createdAt: now,
    updatedAt: now
  });
  store.addTask({
    id: "T2",
    status: "ready",
    type: "workspace-kit",
    title: "Ready blocked",
    createdAt: now,
    updatedAt: now,
    dependsOn: ["T1"],
    phase: "Phase 28 (test)"
  });
  await store.save();
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: { persistenceBackend: "json" },
      kit: { currentPhaseNumber: 28 }
    }
  };
  const result = await taskEngineModule.onCommand(
    { name: "list-tasks", args: { status: "ready", includeQueueHints: true } },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.tasks.length, 1);
  assert.ok(Array.isArray(result.data.queueHintRows));
  assert.equal(result.data.queueHintRows.length, 1);
  assert.equal(result.data.queueHintRows[0].blockedByDependencies, true);
  assert.equal(result.data.queueHintRows[0].phaseAligned, true);
});

test("taskEngineModule list-tasks phaseKey filter matches inferred phase", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T10", status: "ready", phase: "Phase 28 (x)" }));
  store.addTask(makeTask({ id: "T11", status: "ready", phase: "Phase 9" }));
  await store.save();
  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "list-tasks", args: { phaseKey: "28", status: "ready" } },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 1);
  assert.equal(result.data.tasks[0].id, "T10");
});

test("taskEngineModule explain-task-engine-model returns variants and lifecycle", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "explain-task-engine-model", args: {} },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "task-engine-model-explained");
  assert.equal(result.data.modelVersion, 1);
  assert.ok(Array.isArray(result.data.variants));
  assert.ok(result.data.variants.some((v) => v.variant === "execution-task"));
  assert.ok(result.data.variants.some((v) => v.variant === "wishlist-intake-task"));
  assert.ok(Array.isArray(result.data.executionTaskLifecycle));
  assert.ok(result.data.executionTaskLifecycle.some((x) => x.status === "ready"));
});

test("taskEngineModule onCommand get-ready-queue returns priority-sorted tasks", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T001", status: "ready", priority: "P3" }));
  store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1" }));
  store.addTask(makeTask({ id: "T003", status: "blocked" }));
  await store.save();

  const ctx = jsonTaskEngineCtx(workspace);
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
  const ctx = jsonTaskEngineCtx(workspace);

  const result = await router.execute("list-tasks", {}, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
});

test("taskEngineModule create-task and update-task commands persist mutations", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T400", title: "Created task", status: "ready" } },
    ctx
  );
  assert.equal(created.ok, true);
  assert.equal(created.code, "task-created");

  const updated = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T400", updates: { title: "Updated task title" } } },
    ctx
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.code, "task-updated");

  const fetched = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T400" } }, ctx);
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.task.title, "Updated task title");
});

test("taskEngineModule create-task validates known requirements for improvement type", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: { id: "T402", title: "Bad improvement", type: "improvement", status: "ready" }
    },
    ctx
  );
  assert.equal(created.ok, false);
  assert.equal(created.code, "invalid-task-type-requirements");
});

test("taskEngineModule update-task validates known requirements for improvement type", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: "T403",
        title: "Good improvement",
        type: "improvement",
        status: "ready",
        acceptanceCriteria: ["ship"],
        technicalScope: ["task-engine"]
      }
    },
    ctx
  );
  assert.equal(created.ok, true);

  const updated = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T403", updates: { technicalScope: [] } } },
    ctx
  );
  assert.equal(updated.ok, false);
  assert.equal(updated.code, "invalid-task-type-requirements");
});

test("taskEngineModule create-task supports idempotent replay with clientMutationId", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const args = {
    id: "T404",
    title: "Idempotent create",
    status: "ready",
    clientMutationId: "cmid-create-1"
  };

  const first = await taskEngineModule.onCommand({ name: "create-task", args }, ctx);
  assert.equal(first.ok, true);
  assert.equal(first.code, "task-created");

  const second = await taskEngineModule.onCommand({ name: "create-task", args }, ctx);
  assert.equal(second.ok, true);
  assert.equal(second.code, "task-create-idempotent-replay");
  assert.equal(second.data.replayed, true);
});

test("taskEngineModule create-task rejects idempotency key payload conflicts", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const first = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: { id: "T405", title: "Idempotent conflict A", status: "ready", clientMutationId: "cmid-create-2" }
    },
    ctx
  );
  assert.equal(first.ok, true);

  const second = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: { id: "T405", title: "Idempotent conflict B", status: "ready", clientMutationId: "cmid-create-2" }
    },
    ctx
  );
  assert.equal(second.ok, false);
  assert.equal(second.code, "idempotency-key-conflict");
});

test("taskEngineModule update-task supports idempotent replay with clientMutationId", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T406", title: "Before", status: "ready" } },
    ctx
  );
  assert.equal(created.ok, true);

  const updateArgs = {
    taskId: "T406",
    updates: { title: "After" },
    clientMutationId: "cmid-update-1"
  };
  const first = await taskEngineModule.onCommand({ name: "update-task", args: updateArgs }, ctx);
  assert.equal(first.ok, true);
  assert.equal(first.code, "task-updated");

  const second = await taskEngineModule.onCommand({ name: "update-task", args: updateArgs }, ctx);
  assert.equal(second.ok, true);
  assert.equal(second.code, "task-update-idempotent-replay");
  assert.equal(second.data.replayed, true);
});

test("taskEngineModule update-task rejects idempotency key payload conflicts", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T407", title: "Before", status: "ready" } },
    ctx
  );
  assert.equal(created.ok, true);

  const first = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T407", updates: { title: "After A" }, clientMutationId: "cmid-update-2" } },
    ctx
  );
  assert.equal(first.ok, true);

  const second = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T407", updates: { title: "After B" }, clientMutationId: "cmid-update-2" } },
    ctx
  );
  assert.equal(second.ok, false);
  assert.equal(second.code, "idempotency-key-conflict");
});

test("taskEngineModule strictValidation toggle enforces pre-save task validation", async () => {
  const workspace = await tmpDir();
  const store = TaskStore.forJsonFile(workspace);
  const now = new Date().toISOString();
  store.addTask({
    id: "BAD-ID",
    status: "ready",
    type: "workspace-kit",
    title: "Legacy invalid id",
    createdAt: now,
    updatedAt: now
  });
  store.addTask(makeTask({ id: "T408", title: "Target task", status: "ready" }));
  await store.save();

  const ctxOff = jsonTaskEngineCtx(workspace);
  const offResult = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T408", updates: { title: "Updated with strict off" } } },
    ctxOff
  );
  assert.equal(offResult.ok, true);
  assert.equal(offResult.code, "task-updated");

  const ctxOn = {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: { tasks: { persistenceBackend: "json", strictValidation: true } }
  };
  const onResult = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T408", updates: { title: "Updated with strict on" } } },
    ctxOn
  );
  assert.equal(onResult.ok, false);
  assert.equal(onResult.code, "strict-task-validation-failed");
});

test("taskEngineModule archive-task excludes task from default active queries", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T401", status: "ready" }));
  await store.save();

  const archived = await taskEngineModule.onCommand({ name: "archive-task", args: { taskId: "T401" } }, ctx);
  assert.equal(archived.ok, true);
  assert.equal(archived.code, "task-archived");

  const listed = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(listed.ok, true);
  assert.equal(listed.data.count, 0);

  const listedWithArchived = await taskEngineModule.onCommand(
    { name: "list-tasks", args: { includeArchived: true } },
    ctx
  );
  assert.equal(listedWithArchived.ok, true);
  assert.equal(listedWithArchived.data.count, 1);
});

test("taskEngineModule dependency and history commands return deterministic output", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  const store = TaskStore.forJsonFile(workspace);
  store.addTask(makeTask({ id: "T500", status: "ready" }));
  store.addTask(makeTask({ id: "T501", status: "ready" }));
  await store.save();

  const depResult = await taskEngineModule.onCommand(
    { name: "add-dependency", args: { taskId: "T501", dependencyTaskId: "T500" } },
    ctx
  );
  assert.equal(depResult.ok, true);
  assert.equal(depResult.code, "dependency-added");

  const graph = await taskEngineModule.onCommand({ name: "get-dependency-graph", args: { taskId: "T501" } }, ctx);
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.data.dependsOn, ["T500"]);

  const history = await taskEngineModule.onCommand({ name: "get-task-history", args: { taskId: "T501" } }, ctx);
  assert.equal(history.ok, true);
  assert.ok(history.data.count >= 1);
});

const wishlistIntake = {
  id: "W900",
  title: "Test wish",
  problemStatement: "Need tests",
  expectedOutcome: "Green CI",
  impact: "Quality",
  constraints: "None",
  successSignals: "Tests pass",
  requestor: "maintainer",
  evidenceRef: "docs/x"
};

test("taskEngineModule wishlist: create, list, convert closes wishlist and creates tasks", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);

  let r = await taskEngineModule.onCommand({ name: "create-wishlist", args: wishlistIntake }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.code, "wishlist-created");

  r = await taskEngineModule.onCommand({ name: "list-wishlist", args: { status: "open" } }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.data.count, 1);
  assert.equal(r.data.scope, "wishlist-only");

  r = await taskEngineModule.onCommand(
    {
      name: "convert-wishlist",
      args: {
        wishlistId: "W900",
        decomposition: {
          rationale: "One task for slice",
          boundaries: "Engine only",
          dependencyIntent: "none"
        },
        tasks: [
          {
            id: "T9001",
            title: "Do the thing",
            phase: "Phase test",
            approach: "Implement",
            technicalScope: ["Add code"],
            acceptanceCriteria: ["It works"]
          }
        ]
      }
    },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "wishlist-converted");
  assert.equal(r.data.wishlist.status, "converted");
  assert.deepEqual(r.data.wishlist.convertedToTaskIds, ["T9001"]);

  r = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T9001" } }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.data.task.phase, "Phase test");

  r = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(r.ok, true);
  assert.ok(r.data.tasks.some((t) => t.id === "T9001"));
});

test("taskEngineModule get-next-actions never includes wishlist ids", async () => {
  const workspace = await tmpDir();
  const ctx = jsonTaskEngineCtx(workspace);
  await taskEngineModule.onCommand({ name: "create-wishlist", args: wishlistIntake }, ctx);

  const r = await taskEngineModule.onCommand({ name: "get-next-actions", args: {} }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.data.scope, "tasks-only");
  const ready = r.data.readyQueue ?? [];
  assert.ok(!ready.some((t) => String(t.id).startsWith("W")));
  assert.ok(!ready.some((t) => t.type === "wishlist_intake"));
});

test("migrate-task-persistence json-to-sqlite then create-task uses SQLite store", async () => {
  const workspace = await tmpDir();
  const taskPath = path.join(workspace, ".workspace-kit", "tasks", "state.json");
  await mkdir(path.dirname(taskPath), { recursive: true });
  const emptyTaskDoc = {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  };
  await writeFile(taskPath, JSON.stringify(emptyTaskDoc, null, 2) + "\n", "utf8");
  const wishPath = path.join(workspace, ".workspace-kit", "wishlist", "state.json");
  await mkdir(path.dirname(wishPath), { recursive: true });
  await writeFile(
    wishPath,
    JSON.stringify(
      { schemaVersion: 1, items: [], lastUpdated: new Date().toISOString() },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const ctx = jsonTaskEngineCtx(workspace);
  let r = await taskEngineModule.onCommand(
    { name: "migrate-task-persistence", args: { direction: "json-to-sqlite" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "migrated-json-to-sqlite");

  const ctxSqlite = {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
  r = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: { id: "T7777", title: "sqlite persistence smoke", status: "proposed" }
    },
    ctxSqlite
  );
  assert.equal(r.ok, true);

  r = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T7777" } }, ctxSqlite);
  assert.equal(r.ok, true);
  assert.equal(r.data.task.title, "sqlite persistence smoke");
});

test("migrate-task-persistence json-to-unified-sqlite writes task-engine module row", async () => {
  const workspace = await tmpDir();
  const taskPath = path.join(workspace, ".workspace-kit", "tasks", "state.json");
  await mkdir(path.dirname(taskPath), { recursive: true });
  await writeFile(
    taskPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: [{ id: "T8888", title: "seed", type: "workspace-kit", status: "proposed" }],
        transitionLog: [],
        mutationLog: [],
        lastUpdated: new Date().toISOString()
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  const wishPath = path.join(workspace, ".workspace-kit", "wishlist", "state.json");
  await mkdir(path.dirname(wishPath), { recursive: true });
  await writeFile(
    wishPath,
    JSON.stringify(
      { schemaVersion: 1, items: [{ id: "W99", title: "idea", status: "new" }], lastUpdated: new Date().toISOString() },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const ctx = jsonTaskEngineCtx(workspace);
  const r = await taskEngineModule.onCommand(
    { name: "migrate-task-persistence", args: { direction: "json-to-unified-sqlite" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "migrated-json-to-unified-sqlite");

  const unified = new UnifiedStateDb(workspace, ".workspace-kit/tasks/workspace-kit.db");
  const row = unified.getModuleState("task-engine");
  assert.ok(row);
  assert.equal(row.stateSchemaVersion, 1);
  assert.equal(Array.isArray(row.state.taskStore.tasks), true);
  assert.equal(Array.isArray(row.state.wishlistStore.items), true);
});

test("taskEngineModule list-module-states and get-module-state query unified state rows", async () => {
  const workspace = await tmpDir();
  const unified = new UnifiedStateDb(workspace, ".workspace-kit/tasks/workspace-kit.db");
  unified.setModuleState("task-engine", 1, { sample: true });
  unified.setModuleState("planning", 1, { prompts: 3 });

  const ctx = jsonTaskEngineCtx(workspace);
  let r = await taskEngineModule.onCommand({ name: "list-module-states", args: {} }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.code, "module-states-listed");
  assert.equal(Array.isArray(r.data.rows), true);
  assert.equal(r.data.rows.length, 2);

  r = await taskEngineModule.onCommand(
    { name: "get-module-state", args: { moduleId: "task-engine" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "module-state-read");
  assert.equal(r.data.row.moduleId, "task-engine");
});

