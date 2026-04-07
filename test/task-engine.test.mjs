import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TaskStore,
  SqliteDualPlanningStore,
  TransitionService,
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard,
  buildQueueGitAlignmentReport,
  getNextActions,
  getTaskQueueNamespace,
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

/** Integration tests use SQLite planning store (runtime is sqlite-only since v0.40). */
function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra =
    rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
  const { tasks: _drop, ...restTop } = partialEffective;
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      ...restTop,
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        ...taskExtra
      }
    }
  };
}

async function storeWithTasks(tasks, dir) {
  const workspace = dir ?? await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  for (const task of tasks) {
    store.addTask(task);
  }
  await store.save();
  return { store, workspace };
}

async function seedSqliteStore(workspace, fn) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  fn(store);
  await store.save();
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

test("TaskStore accepts schemaVersion 2 on read and persists as schemaVersion 1", async () => {
  const workspace = await tmpDir();
  const tasksDir = path.join(workspace, ".workspace-kit", "tasks");
  await mkdir(tasksDir, { recursive: true });
  const storePath = path.join(tasksDir, "state.json");
  const iso = new Date().toISOString();
  await writeFile(
    storePath,
    JSON.stringify({
      schemaVersion: 2,
      tasks: [makeTask({ id: "T501", status: "ready" })],
      transitionLog: [],
      lastUpdated: iso
    }),
    "utf8"
  );
  const store = TaskStore.forJsonFile(workspace);
  await store.load();
  assert.equal(store.getTask("T501")?.id, "T501");
  await store.save();
  const raw = await readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.schemaVersion, 1);
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

test("getNextActions dep-blocked ready tasks follow runnable; suggestedNext skips unmet dependsOn", () => {
  const tasks = [
    makeTask({ id: "T001", status: "completed" }),
    makeTask({ id: "T002", status: "ready", priority: "P1", dependsOn: ["T999"] }),
    makeTask({ id: "T003", status: "ready", priority: "P2" })
  ];
  const result = getNextActions(tasks);
  assert.equal(result.suggestedNext?.id, "T003");
  assert.deepEqual(
    result.readyQueue.map((t) => t.id),
    ["T003", "T002"]
  );
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

test("getNextActions state summary excludes wishlist intake from proposed and total", () => {
  const tasks = [
    makeTask({ id: "T001", status: "proposed" }),
    makeTask({ id: "T002", status: "proposed", type: "wishlist_intake", title: "Ideation" }),
    makeTask({ id: "T003", status: "ready" })
  ];
  const result = getNextActions(tasks);
  assert.equal(result.stateSummary.proposed, 1);
  assert.equal(result.stateSummary.ready, 1);
  assert.equal(result.stateSummary.total, 2);
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

test("SqliteDualPlanningStore bumps planning_generation on TaskStore.save", async () => {
  const workspace = await tmpDir();
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/plan-gen.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  assert.equal(dual.getPlanningGeneration(), 0);
  store.addTask(makeTask({ id: "T7001", title: "gen", status: "proposed" }));
  await store.save();
  assert.equal(dual.getPlanningGeneration(), 1);
  const dual2 = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/plan-gen.db");
  dual2.loadFromDisk();
  assert.equal(dual2.getPlanningGeneration(), 1);
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
  assert.ok(names.includes("assign-task-phase"));
  assert.ok(names.includes("clear-task-phase"));
  assert.ok(names.includes("remove-dependency"));
  assert.ok(names.includes("get-dependency-graph"));
  assert.ok(names.includes("get-kit-persistence-map"));
  assert.ok(names.includes("get-task-history"));
  assert.ok(names.includes("get-recent-task-activity"));
  assert.ok(names.includes("get-task-summary"));
  assert.ok(names.includes("get-blocked-summary"));
  assert.ok(names.includes("create-task-from-plan"));
  assert.ok(names.includes("get-task"));
  assert.ok(names.includes("list-tasks"));
  assert.ok(names.includes("get-ready-queue"));
  assert.ok(names.includes("get-next-actions"));
  assert.ok(names.includes("queue-git-alignment"));
  assert.ok(names.includes("queue-health"));
  assert.ok(names.includes("replay-queue-snapshot"));
  assert.ok(names.includes("dashboard-summary"));
  assert.ok(names.includes("create-wishlist"));
  assert.ok(names.includes("list-wishlist"));
  assert.ok(names.includes("get-wishlist"));
  assert.ok(names.includes("update-wishlist"));
  assert.ok(names.includes("update-workspace-phase-snapshot"));
  assert.ok(names.includes("convert-wishlist"));
  assert.ok(names.includes("migrate-task-persistence"));
});

test("taskEngineModule passes ModuleRegistry validation", () => {
  assert.doesNotThrow(() => new ModuleRegistry([taskEngineModule]));
});

test("taskEngineModule onCommand list-tasks returns empty on fresh store", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
  assert.equal(result.data.count, 0);
  assert.equal(result.data.scope, "tasks-only");
});

test("taskEngineModule list-tasks supports type/category/tags/metadata filters", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  await seedSqliteStore(workspace, (store) => {
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
  });

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
  const ctx = sqliteTaskEngineCtx(workspace);
  await seedSqliteStore(workspace, (store) => {
    store.addTask(
      makeTask({
        id: "T412",
        type: "improvement",
        metadata: { category: "reliability", tags: ["ui"], risk: { level: "low" } }
      })
    );
  });

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
  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "get-task", args: { taskId: "T999" } },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "task-not-found");
});

test("taskEngineModule onCommand get-task includes recentTransitions after transitions", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T001", status: "ready" }));
  });

  const ctx = sqliteTaskEngineCtx(workspace);
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
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T001", status: "ready", priority: "P1" }));
  });

  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "dashboard-summary");
  const d = result.data;
  assert.equal(d.schemaVersion, 4);
  assert.ok(typeof d.planningGeneration === "number");
  assert.ok(d.transcriptChurnResearchSummary);
  assert.equal(d.transcriptChurnResearchSummary.schemaVersion, 1);
  assert.equal(d.transcriptChurnResearchSummary.count, 0);
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
  assert.equal(d.readyImprovementsSummary.schemaVersion, 1);
  assert.equal(d.readyImprovementsSummary.count, 0);
  assert.ok(Array.isArray(d.readyImprovementsSummary.phaseBuckets));
  assert.equal(d.readyExecutionSummary.schemaVersion, 1);
  assert.equal(d.readyExecutionSummary.count, 1);
  assert.equal(d.readyExecutionSummary.top.length, 1);
  assert.equal(d.readyExecutionSummary.top[0].id, "T001");
  assert.ok(Array.isArray(d.readyExecutionSummary.phaseBuckets));
  assert.ok(d.readyExecutionSummary.phaseBuckets.length >= 1);
  assert.equal(d.proposedExecutionSummary.schemaVersion, 1);
  assert.equal(d.proposedExecutionSummary.count, 0);
  assert.ok(Array.isArray(d.proposedExecutionSummary.phaseBuckets));
  assert.equal(d.completedSummary.schemaVersion, 1);
  assert.equal(d.completedSummary.count, 0);
  assert.ok(Array.isArray(d.completedSummary.phaseBuckets));
  assert.equal(d.cancelledSummary.schemaVersion, 1);
  assert.equal(d.cancelledSummary.count, 0);
  assert.ok(Array.isArray(d.cancelledSummary.phaseBuckets));
  assert.ok(d.dependencyOverview);
  assert.equal(d.dependencyOverview.schemaVersion, 1);
  assert.equal(d.dependencyOverview.truncated, false);
  assert.equal(d.dependencyOverview.activeTaskCount, 1);
  assert.deepEqual(d.dependencyOverview.criticalPathReady, ["T001"]);
  assert.ok(d.agentGuidance);
  assert.equal(d.agentGuidance.schemaVersion, 1);
  assert.equal(d.agentGuidance.usingDefaultTier, true);
  assert.equal(d.agentGuidance.tier, 2);
  assert.equal(d.agentGuidance.profileSetId, "rpg_party_v1");
  assert.equal(d.agentGuidance.temperamentProfileId, "builtin:balanced");
  assert.equal(d.agentGuidance.temperamentLabel, "The Steady Adventurer");
  assert.ok(d.teamExecution);
  assert.equal(d.teamExecution.schemaVersion, 1);
  assert.equal(d.teamExecution.available, true);
  assert.equal(d.teamExecution.totalCount, 0);
  assert.equal(d.teamExecution.activeCount, 0);
  assert.ok(Array.isArray(d.teamExecution.topActive));
  assert.ok(d.subagentRegistry);
  assert.equal(d.subagentRegistry.schemaVersion, 1);
  assert.equal(d.subagentRegistry.available, true);
  assert.equal(d.subagentRegistry.definitionsCount, 0);
  assert.equal(d.subagentRegistry.retiredDefinitionsCount, 0);
  assert.equal(d.subagentRegistry.openSessionsCount, 0);
  assert.ok(Array.isArray(d.subagentRegistry.topOpenSessions));
  assert.equal(d.subagentRegistry.topOpenSessions.length, 0);
});

test("taskEngineModule dashboard-summary wishlist openTop includes backing taskId", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const wl = {
    id: "W901",
    title: "Dash taskId row",
    problemStatement: "Need row shape",
    expectedOutcome: "taskId present",
    impact: "UI",
    constraints: "None",
    successSignals: "Assert passes",
    requestor: "test",
    evidenceRef: "task-engine.test.mjs"
  };
  const created = await taskEngineModule.onCommand({ name: "create-wishlist", args: wl }, ctx);
  assert.equal(created.ok, true);
  const backingTaskId = created.data.taskId;
  const summary = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(summary.ok, true);
  const row = summary.data.wishlist.openTop[0];
  assert.equal(row.id, "W901");
  assert.equal(row.taskId, backingTaskId);
  assert.match(String(row.taskId), /^T\d+$/);
});

test("taskEngineModule dashboard-summary agentGuidance reflects effective config tier", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, () => {});
  const ctx = sqliteTaskEngineCtx(workspace, {
    kit: { agentGuidance: { profileSetId: "rpg_party_v1", tier: 5, displayLabel: "BBEG" } }
  });
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  const ag = result.data.agentGuidance;
  assert.equal(ag.tier, 5);
  assert.equal(ag.usingDefaultTier, false);
  assert.equal(ag.displayLabel, "BBEG");
  assert.equal(typeof ag.temperamentProfileId, "string");
  assert.equal(typeof ag.temperamentLabel, "string");
  assert.ok(ag.temperamentLabel.length > 0);
});

test("taskEngineModule dashboard-summary dependencyOverview critical path orders prerequisites", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T100", status: "ready", title: "Root" }));
    store.addTask(
      makeTask({ id: "T101", status: "ready", title: "Leaf", dependsOn: ["T100"] })
    );
  });

  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  const dep = result.data.dependencyOverview;
  assert.equal(dep.schemaVersion, 1);
  assert.equal(dep.truncated, false);
  assert.equal(dep.edgeCount, 1);
  assert.deepEqual(dep.criticalPathReady, ["T100", "T101"]);
});

test("taskEngineModule dashboard-summary splits ready improvements vs execution", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(
      makeTask({ id: "imp-deadbeef", status: "ready", priority: "P1", type: "improvement", title: "Imp ready" })
    );
    store.addTask(
      makeTask({ id: "T900", status: "ready", priority: "P2", type: "workspace-kit", title: "Exec ready" })
    );
    store.addTask(
      makeTask({ id: "T901", status: "proposed", type: "workspace-kit", title: "Exec proposed" })
    );
  });

  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(result.ok, true);
  const d = result.data;
  assert.equal(d.readyImprovementsSummary.count, 1);
  assert.equal(d.readyImprovementsSummary.top[0].id, "imp-deadbeef");
  assert.equal(d.readyExecutionSummary.count, 1);
  assert.equal(d.readyExecutionSummary.top[0].id, "T900");
  assert.equal(d.proposedExecutionSummary.count, 1);
  assert.equal(d.proposedExecutionSummary.top[0].id, "T901");
});

test("taskEngineModule onCommand run-transition validates required args", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "run-transition", args: {} },
    ctx
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-task-schema");
});

test("taskEngineModule onCommand get-next-actions works on populated store", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T001", status: "ready", priority: "P2", title: "Second" }));
    store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1", title: "First" }));
    store.addTask(makeTask({ id: "T003", status: "completed", title: "Done" }));
  });

  const ctx = sqliteTaskEngineCtx(workspace);
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
  const now = new Date().toISOString();
  await seedSqliteStore(workspace, (store) => {
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
  });
  const ctx = sqliteTaskEngineCtx(workspace, { kit: { currentPhaseNumber: 28 } });
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
  const now = new Date().toISOString();
  await seedSqliteStore(workspace, (store) => {
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
  });
  const ctx = sqliteTaskEngineCtx(workspace, { kit: { currentPhaseNumber: 28 } });
  const result = await taskEngineModule.onCommand({ name: "queue-health", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.misalignedPhaseCount, 1);
  const row = result.data.readyTaskSummaries[0];
  assert.equal(row.phaseAligned, false);
});

test("taskEngineModule list-tasks includeQueueHints aligns with queue-health signals", async () => {
  const workspace = await tmpDir();
  const now = new Date().toISOString();
  await seedSqliteStore(workspace, (store) => {
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
  });
  const ctx = sqliteTaskEngineCtx(workspace, { kit: { currentPhaseNumber: 28 } });
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
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T10", status: "ready", phase: "Phase 28 (x)" }));
    store.addTask(makeTask({ id: "T11", status: "ready", phase: "Phase 9" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);
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
  const ctx = sqliteTaskEngineCtx(workspace);
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
  const execVar = result.data.variants.find((v) => v.variant === "execution-task");
  assert.ok(execVar.optionalFields.includes("metadata.queueNamespace"));
});

test("getTaskQueueNamespace defaults and reads metadata", () => {
  const now = new Date().toISOString();
  assert.equal(getTaskQueueNamespace(makeTask({})), "default");
  assert.equal(
    getTaskQueueNamespace(
      makeTask({ metadata: { queueNamespace: "alpha" } })
    ),
    "alpha"
  );
});

test("buildQueueGitAlignmentReport merge-ahead signal when git newer than transitions", () => {
  const now = new Date().toISOString();
  const report = buildQueueGitAlignmentReport({
    workspacePath: "/tmp/wk",
    tasks: [
      makeTask({
        id: "T9",
        status: "in_progress",
        updatedAt: "2020-01-01T00:00:00.000Z"
      })
    ],
    transitionLog: [
      {
        transitionId: "x",
        taskId: "T1",
        fromState: "ready",
        toState: "in_progress",
        action: "start",
        guardResults: [],
        dependentsUnblocked: [],
        timestamp: "2020-06-01T12:00:00.000Z"
      }
    ],
    storeLastUpdated: now,
    git: { ok: true, headSha: "abc", headCommitDateIso: "2025-01-01T00:00:00.000Z" },
    staleInProgressDays: 7
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.signalMergeAheadOfTransitions, true);
  assert.ok(report.inProgressStale.length >= 1);
});

test("taskEngineModule queue-git-alignment returns schemaVersion 1", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T1", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand({ name: "queue-git-alignment", args: {} }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "queue-git-alignment");
  assert.equal(result.data.schemaVersion, 1);
  assert.ok("summary" in result.data);
});

test("taskEngineModule replay-queue-snapshot is deterministic for fixture tasks", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const tasks = [
    makeTask({ id: "Ta", status: "ready", priority: "P2" }),
    makeTask({ id: "Tb", status: "ready", priority: "P1" })
  ];
  const r1 = await taskEngineModule.onCommand(
    { name: "replay-queue-snapshot", args: { tasks } },
    ctx
  );
  assert.equal(r1.ok, true);
  assert.equal(r1.code, "queue-replay");
  assert.equal(r1.data.suggestedNext.id, "Tb");
  const r2 = await taskEngineModule.onCommand(
    { name: "replay-queue-snapshot", args: { tasks } },
    ctx
  );
  assert.deepEqual(r1.data.readyQueue.map((t) => t.id), r2.data.readyQueue.map((t) => t.id));
});

test("taskEngineModule replay-queue-snapshot respects queueNamespace", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const tasks = [
    makeTask({
      id: "Ta",
      status: "ready",
      priority: "P1",
      metadata: { queueNamespace: "a" }
    }),
    makeTask({ id: "Tb", status: "ready", priority: "P1", metadata: { queueNamespace: "b" } })
  ];
  const r = await taskEngineModule.onCommand(
    { name: "replay-queue-snapshot", args: { tasks, queueNamespace: "b" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.readyQueue.length, 1);
  assert.equal(r.data.readyQueue[0].id, "Tb");
});

test("taskEngineModule replay-queue-snapshot loads snapshotRelativePath under workspace", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/replay-queue-tiny.json");
  const raw = await readFile(fixture, "utf8");
  await mkdir(path.join(workspace, "snap"), { recursive: true });
  await writeFile(path.join(workspace, "snap/r.json"), raw, "utf8");
  const r = await taskEngineModule.onCommand(
    { name: "replay-queue-snapshot", args: { snapshotRelativePath: "snap/r.json" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.suggestedNext.id, "T2");
});

test("taskEngineModule get-next-actions queueNamespace filters ready queue", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(
      makeTask({
        id: "Ta",
        status: "ready",
        priority: "P1",
        metadata: { queueNamespace: "x" }
      })
    );
    store.addTask(
      makeTask({
        id: "Tb",
        status: "ready",
        priority: "P2",
        metadata: { queueNamespace: "y" }
      })
    );
  });
  const ctx = sqliteTaskEngineCtx(workspace);
  const r = await taskEngineModule.onCommand(
    { name: "get-next-actions", args: { queueNamespace: "y" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.suggestedNext.id, "Tb");
  assert.equal(r.data.queueNamespace, "y");
});

test("taskEngineModule onCommand get-ready-queue returns priority-sorted tasks", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T001", status: "ready", priority: "P3" }));
    store.addTask(makeTask({ id: "T002", status: "ready", priority: "P1" }));
    store.addTask(makeTask({ id: "T003", status: "blocked" }));
  });

  const ctx = sqliteTaskEngineCtx(workspace);
  const result = await taskEngineModule.onCommand(
    { name: "get-ready-queue", args: {} },
    ctx
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 2);
  assert.equal(result.data.tasks[0].id, "T002");
  assert.equal(result.data.queueNamespace, null);
});

test("taskEngineModule routes through ModuleCommandRouter", async () => {
  const registry = new ModuleRegistry([taskEngineModule]);
  const router = new ModuleCommandRouter(registry);
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);

  const result = await router.execute("list-tasks", {}, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.code, "tasks-listed");
});

test("taskEngineModule create-task and update-task commands persist mutations", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);

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

test("taskEngineModule assign-task-phase and clear-task-phase persist", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);
  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T401", title: "Phase test", status: "ready" } },
    ctx
  );
  assert.equal(created.ok, true);

  const assigned = await taskEngineModule.onCommand(
    {
      name: "assign-task-phase",
      args: { taskId: "T401", phaseKey: "43", phase: "Phase 43 (test bucket)" }
    },
    ctx
  );
  assert.equal(assigned.ok, true);
  assert.equal(assigned.code, "task-phase-assigned");

  let got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T401" } }, ctx);
  assert.equal(got.data.task.phaseKey, "43");
  assert.equal(got.data.task.phase, "Phase 43 (test bucket)");

  const cleared = await taskEngineModule.onCommand({ name: "clear-task-phase", args: { taskId: "T401" } }, ctx);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.code, "task-phase-cleared");

  got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T401" } }, ctx);
  assert.equal(got.data.task.phase, undefined);
  assert.equal(got.data.task.phaseKey, undefined);
});

test("taskEngineModule create-task validates known requirements for improvement type", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: "T402",
        title: "Bad improvement",
        type: "improvement",
        status: "ready",
        acceptanceCriteria: ["done"],
        technicalScope: ["x"],
        metadata: { supportingReasoning: "missing issue field" }
      }
    },
    ctx
  );
  assert.equal(created.ok, false);
  assert.equal(created.code, "invalid-task-type-requirements");
});

test("taskEngineModule update-task validates known requirements for improvement type", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace);

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: "T403",
        title: "Good improvement",
        type: "improvement",
        status: "ready",
        acceptanceCriteria: ["ship"],
        technicalScope: ["task-engine"],
        metadata: {
          issue: "Operators confuse two CLI paths.",
          supportingReasoning: "Observed in transcript T123; policy deny on wrong lane."
        }
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
  const ctx = sqliteTaskEngineCtx(workspace);
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
  const ctx = sqliteTaskEngineCtx(workspace);

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
  const ctx = sqliteTaskEngineCtx(workspace);

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
  const ctx = sqliteTaskEngineCtx(workspace);

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
  const now = new Date().toISOString();
  await seedSqliteStore(workspace, (store) => {
    store.addTask({
      id: "BAD-ID",
      status: "ready",
      type: "workspace-kit",
      title: "Legacy invalid id",
      createdAt: now,
      updatedAt: now
    });
    store.addTask(makeTask({ id: "T408", title: "Target task", status: "ready" }));
  });

  const ctxOff = sqliteTaskEngineCtx(workspace);
  const offResult = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T408", updates: { title: "Updated with strict off" } } },
    ctxOff
  );
  assert.equal(offResult.ok, true);
  assert.equal(offResult.code, "task-updated");

  const ctxOn = sqliteTaskEngineCtx(workspace, { tasks: { strictValidation: true } });
  const onResult = await taskEngineModule.onCommand(
    { name: "update-task", args: { taskId: "T408", updates: { title: "Updated with strict on" } } },
    ctxOn
  );
  assert.equal(onResult.ok, false);
  assert.equal(onResult.code, "strict-task-validation-failed");
});

test("taskEngineModule planningGenerationPolicy require blocks mutation without expectedPlanningGeneration", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T600", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace, { tasks: { planningGenerationPolicy: "require" } });

  const denied = await taskEngineModule.onCommand(
    { name: "run-transition", args: { taskId: "T600", action: "start" } },
    ctx
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "planning-generation-required");

  const listed = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  assert.equal(listed.ok, true);
  const gen = listed.data.planningGeneration;

  const ok = await taskEngineModule.onCommand(
    {
      name: "run-transition",
      args: { taskId: "T600", action: "start", expectedPlanningGeneration: gen }
    },
    ctx
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.code, "transition-applied");
});

test("taskEngineModule planningGenerationPolicy require rejects wrong expectedPlanningGeneration", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T601", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace, { tasks: { planningGenerationPolicy: "require" } });
  const listed = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  const gen = listed.data.planningGeneration;

  const bad = await taskEngineModule.onCommand(
    {
      name: "run-transition",
      args: { taskId: "T601", action: "start", expectedPlanningGeneration: gen + 99 }
    },
    ctx
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "planning-generation-mismatch");
});

test("taskEngineModule planningGenerationPolicy warn surfaces planningGenerationPolicyWarnings", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T602", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace, { tasks: { planningGenerationPolicy: "warn" } });
  const r = await taskEngineModule.onCommand(
    { name: "run-transition", args: { taskId: "T602", action: "start" } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.data.planningGenerationPolicyWarnings));
  assert.ok(r.data.planningGenerationPolicyWarnings.length >= 1);
});

test("taskEngineModule create-task idempotent replay skips require gate (no re-persist)", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteTaskEngineCtx(workspace, { tasks: { planningGenerationPolicy: "require" } });
  const lt = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, ctx);
  const g0 = lt.data.planningGeneration;
  const payload = {
    id: "T603",
    title: "Idem",
    status: "proposed",
    approach: "a",
    technicalScope: ["scope"],
    acceptanceCriteria: ["crit"],
    clientMutationId: "cmid-require-replay",
    expectedPlanningGeneration: g0
  };
  const first = await taskEngineModule.onCommand({ name: "create-task", args: payload }, ctx);
  assert.equal(first.ok, true);
  const gen1 = first.data.planningGeneration;

  const replay = await taskEngineModule.onCommand({
    name: "create-task",
    args: {
      id: "T603",
      title: "Idem",
      status: "proposed",
      approach: "a",
      technicalScope: ["scope"],
      acceptanceCriteria: ["crit"],
      clientMutationId: "cmid-require-replay"
    }
  }, ctx);
  assert.equal(replay.ok, true);
  assert.equal(replay.code, "task-create-idempotent-replay");
  assert.equal(replay.data.planningGeneration, gen1);
});

test("taskEngineModule archive-task excludes task from default active queries", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T401", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);

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
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T500", status: "ready" }));
    store.addTask(makeTask({ id: "T501", status: "ready" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);

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
  const ctx = sqliteTaskEngineCtx(workspace);

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
  const ctx = sqliteTaskEngineCtx(workspace);
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

  const ctx = sqliteTaskEngineCtx(workspace);
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

test("migrate-task-persistence sqlite-blob-to-relational round-trips tasks and logs", async () => {
  const workspace = await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  store.addTask(
    makeTask({
      id: "T900",
      title: "relational seed",
      summary: "short",
      description: "longer body",
      risk: "low",
      metadata: { evidenceKey: "k1", evidenceKind: "transcript", queueNamespace: "ns1" }
    })
  );
  store.addEvidence({
    transitionId: "tr1",
    taskId: "T900",
    fromState: "proposed",
    toState: "ready",
    action: "accept",
    guardResults: [],
    dependentsUnblocked: [],
    timestamp: new Date().toISOString()
  });
  await store.save();
  assert.equal(dual.relationalTasksEnabled, false);

  const ctx = sqliteTaskEngineCtx(workspace);
  const mig = await taskEngineModule.onCommand(
    { name: "migrate-task-persistence", args: { direction: "sqlite-blob-to-relational" } },
    ctx
  );
  assert.equal(mig.ok, true);
  assert.equal(mig.code, "migrated-sqlite-blob-to-relational");

  const dual2 = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual2.loadFromDisk();
  assert.equal(dual2.relationalTasksEnabled, true);
  const store2 = TaskStore.forSqliteDual(dual2);
  await store2.load();
  const t = store2.getTask("T900");
  assert.ok(t);
  assert.equal(t.title, "relational seed");
  assert.equal(t.summary, "short");
  assert.equal(t.description, "longer body");
  assert.equal(t.risk, "low");
  assert.equal(t.metadata?.evidenceKey, "k1");
  assert.equal(store2.getTransitionLog().length, 1);

  const upd = await taskEngineModule.onCommand(
    {
      name: "update-task",
      args: { taskId: "T900", updates: { title: "after relational" } }
    },
    ctx
  );
  assert.equal(upd.ok, true);

  const dual3 = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual3.loadFromDisk();
  const store3 = TaskStore.forSqliteDual(dual3);
  await store3.load();
  assert.equal(store3.getTask("T900").title, "after relational");
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

  const ctx = sqliteTaskEngineCtx(workspace);
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
  assert.deepEqual(row.state.wishlistStore.items, []);
});

test("taskEngineModule list-module-states and get-module-state query unified state rows", async () => {
  const workspace = await tmpDir();
  const unified = new UnifiedStateDb(workspace, ".workspace-kit/tasks/workspace-kit.db");
  unified.setModuleState("task-engine", 1, { sample: true });
  unified.setModuleState("planning", 1, { prompts: 3 });

  const ctx = sqliteTaskEngineCtx(workspace);
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

