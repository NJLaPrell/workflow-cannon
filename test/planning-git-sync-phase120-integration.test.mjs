import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { taskEngineModule, ideasModule } from "../dist/index.js";
import { saveImprovementState, emptyImprovementState } from "../dist/modules/improvement/improvement-state.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";
import { admitCanonicalStateEventStream } from "../dist/modules/task-engine/task-state-events/canonical-event-admission.js";
import { replayCanonicalStateEvents } from "../dist/modules/task-engine/task-state-events/canonical-replay.js";
import { materializeTaskStoreDocument } from "../dist/modules/task-engine/task-state-events/event-applier.js";
import { persistPlanningProjectionToSqlite } from "../dist/modules/task-engine/task-state-events/planning-sqlite-persist.js";
import { ALL_PLANNING_SYNC_DOMAINS } from "../dist/modules/task-engine/persistence/planning-canonical-sync-domains.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "src/modules/task-engine/task-state-events/fixtures");

const POLICY = {
  confirmed: true,
  rationale: "phase 120 planning git sync integration test"
};

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra = rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
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

async function seedCanonicalWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase120-primary-"));
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase120-bare-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  runGit(workspace, ["commit", "--allow-empty", "-m", "root"]);
  runGit(bare, ["init", "--bare"]);
  runGit(workspace, ["remote", "add", "origin", bare]);

  const sqliteCtx = sqliteTaskEngineCtx(workspace);
  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T777", title: "Phase 120 canonical anchor task", status: "ready" } },
    sqliteCtx
  );
  assert.equal(created.ok, true, created.message);

  const init = await taskEngineModule.onCommand(
    {
      name: "task-state-init",
      args: {
        push: true,
        policyApproval: POLICY
      }
    },
    sqliteCtx
  );
  assert.equal(init.ok, true, init.message);
  assert.equal(init.code, "task-state-init-complete");
  assert.equal(runGit(workspace, ["rev-parse", `origin/${TASK_STATE_GIT_BRANCH}`]).length, 40);

  const canonicalCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" }
  });
  return { workspace, bare, canonicalCtx };
}

function cloneConsumerWorkspace(bareRemote) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase120-clone-parent-"));
  const consumer = path.join(parent, "consumer");
  runGit(parent, ["clone", bareRemote, "consumer"]);
  ensureGitIdentity(consumer);
  return consumer;
}

function readRemoteEventSegment(bareRemote) {
  try {
    return runGit(bareRemote, ["show", `${TASK_STATE_GIT_BRANCH}:task-state/events/0000000000.jsonl`]);
  } catch {
    return "";
  }
}

function readPlanningConvergenceSnapshot(workspace) {
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath, { readonly: true });
  try {
    const notes = db
      .prepare(
        `SELECT id, phase_key AS phaseKey, summary, idempotency_key AS idempotencyKey
         FROM phase_notes ORDER BY summary`
      )
      .all();
    const ideas = db
      .prepare(`SELECT id, title, note FROM workflow_ideas ORDER BY title`)
      .all();
    const moduleStates = db
      .prepare(
        `SELECT module_id AS moduleId, state_schema_version AS stateSchemaVersion, state_json AS stateJson
         FROM workspace_module_state ORDER BY module_id`
      )
      .all()
      .map((row) => ({
        moduleId: row.moduleId,
        stateSchemaVersion: row.stateSchemaVersion,
        state: JSON.parse(row.stateJson)
      }));
    const tasks = db
      .prepare(`SELECT id, title FROM task_engine_tasks ORDER BY id`)
      .all();
    return { notes, ideas, moduleStates, tasks };
  } finally {
    db.close();
  }
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function normalizeGoldenCrossDomainStream() {
  const taskCreated = loadFixture("golden-task-created.v1.json");
  const phaseNote = loadFixture("golden-planning-phase-note-created.v1.json");
  const idea = loadFixture("golden-planning-idea-created.v1.json");
  const moduleState = loadFixture("golden-planning-module-state-updated.v1.json");

  taskCreated.sequence = 1;
  taskCreated.parentEventId = null;

  phaseNote.sequence = 2;
  phaseNote.parentEventId = taskCreated.eventId;

  idea.sequence = 3;
  idea.parentEventId = phaseNote.eventId;

  moduleState.sequence = 4;
  moduleState.parentEventId = idea.eventId;

  return [taskCreated, phaseNote, idea, moduleState];
}

test("cross-domain Phase 120 golden fixtures admit and replay task + planning projection", () => {
  const events = normalizeGoldenCrossDomainStream();
  const admitted = admitCanonicalStateEventStream(events);
  assert.equal(admitted.ok, true, admitted.error?.message);

  const replayed = replayCanonicalStateEvents(admitted.events, {
    enabledDomains: new Set(ALL_PLANNING_SYNC_DOMAINS)
  });
  assert.equal(replayed.ok, true, replayed.message);

  assert.equal(
    replayed.result.taskProjection.tasksById["T100509"].title,
    "Fixture task for event log golden sample"
  );
  assert.equal(
    replayed.result.planningProjection.phaseNotesById["note-fixture-001"].summary,
    "Phase journal git sync note"
  );
  assert.equal(replayed.result.planningProjection.ideasById["I001"].title, "Git-synced workflow idea");
  assert.equal(
    replayed.result.planningProjection.moduleStateById["improvement"].state.lastIngestedPolicyTraceId,
    42
  );

  const db = new Database(":memory:");
  prepareKitSqliteDatabase(db);
  persistPlanningProjectionToSqlite(db, replayed.result.planningProjection, { replaceCatalog: false });

  const noteRow = db
    .prepare(`SELECT summary FROM phase_notes WHERE id = 'note-fixture-001'`)
    .get();
  assert.equal(noteRow.summary, "Phase journal git sync note");

  const ideaRow = db.prepare(`SELECT title FROM workflow_ideas WHERE id = 'I001'`).get();
  assert.equal(ideaRow.title, "Git-synced workflow idea");

  const moduleRow = db
    .prepare(`SELECT state_json FROM workspace_module_state WHERE module_id = 'improvement'`)
    .get();
  assert.equal(JSON.parse(moduleRow.state_json).lastIngestedPolicyTraceId, 42);

  const document = materializeTaskStoreDocument(replayed.result.taskProjection);
  assert.equal(document.tasks.length, 1);
  assert.equal(document.tasks[0].id, "T100509");
  db.close();
});

test("dual-worktree fetch + hydrate converges phase note, idea, and module state", async () => {
  const { workspace, bare, canonicalCtx } = await seedCanonicalWorkspace();

  const noteRes = await taskEngineModule.onCommand(
    {
      name: "add-phase-note",
      args: {
        phaseKey: "120",
        noteType: "finding",
        summary: "Phase 120 dual-worktree convergence note",
        idempotencyKey: "phase120-dual-note",
        policyApproval: POLICY
      }
    },
    canonicalCtx
  );
  assert.equal(noteRes.ok, true, noteRes.message);

  const ideaRes = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Phase 120 dual-worktree idea",
        note: "Should survive fetch + hydrate on consumer",
        clientMutationId: "phase120-dual-idea",
        policyApproval: POLICY
      }
    },
    canonicalCtx
  );
  assert.equal(ideaRes.ok, true, ideaRes.message);

  const improvementState = {
    ...emptyImprovementState(),
    lastIngestedPolicyTraceId: 7,
    lastSyncRunAt: "2026-05-29T18:00:00.000Z"
  };
  const modulePublish = await saveImprovementState(workspace, improvementState, canonicalCtx.effectiveConfig, {
    commandName: "save-improvement-state",
    clientMutationId: "phase120-dual-module",
    policyApproval: POLICY
  });
  assert.equal(modulePublish, null, modulePublish?.message);

  const primarySnapshot = readPlanningConvergenceSnapshot(workspace);
  assert.equal(primarySnapshot.notes.length, 1);
  assert.equal(primarySnapshot.ideas.length, 1);
  assert.equal(primarySnapshot.moduleStates.length, 1);
  assert.equal(primarySnapshot.moduleStates[0].state.lastIngestedPolicyTraceId, 7);

  const consumer = cloneConsumerWorkspace(bare);
  const consumerCtx = sqliteTaskEngineCtx(consumer, {
    tasks: { canonicalAuthority: "git-event-log" }
  });

  const hydrate = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: true,
        policyApproval: POLICY
      }
    },
    consumerCtx
  );
  assert.equal(hydrate.ok, true, hydrate.message);

  const status = await taskEngineModule.onCommand(
    { name: "task-state-status", args: { fetch: false } },
    consumerCtx
  );
  assert.equal(status.ok, true, status.message);
  assert.equal(status.data.syncState, "current");

  const consumerSnapshot = readPlanningConvergenceSnapshot(consumer);
  assert.deepEqual(
    consumerSnapshot.notes.map(({ summary, idempotencyKey }) => ({ summary, idempotencyKey })),
    primarySnapshot.notes.map(({ summary, idempotencyKey }) => ({ summary, idempotencyKey }))
  );
  assert.deepEqual(
    consumerSnapshot.ideas.map(({ title, note }) => ({ title, note })),
    primarySnapshot.ideas.map(({ title, note }) => ({ title, note }))
  );
  assert.deepEqual(
    consumerSnapshot.moduleStates.map(({ moduleId, stateSchemaVersion, state }) => ({
      moduleId,
      stateSchemaVersion,
      lastIngestedPolicyTraceId: state.lastIngestedPolicyTraceId,
      lastSyncRunAt: state.lastSyncRunAt
    })),
    primarySnapshot.moduleStates.map(({ moduleId, stateSchemaVersion, state }) => ({
      moduleId,
      stateSchemaVersion,
      lastIngestedPolicyTraceId: state.lastIngestedPolicyTraceId,
      lastSyncRunAt: state.lastSyncRunAt
    }))
  );
  assert.deepEqual(
    consumerSnapshot.tasks.map(({ id, title }) => ({ id, title })),
    primarySnapshot.tasks.map(({ id, title }) => ({ id, title }))
  );
});

test("disabled planning sync domains skip publish and hydrate for that domain", async () => {
  const { workspace, bare, canonicalCtx } = await seedCanonicalWorkspace();
  const ideasOnlyCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" },
    planning: { canonicalSync: { domains: ["ideas"] } }
  });
  const notesOnlyCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" },
    planning: { canonicalSync: { domains: ["phase_notes"] } }
  });

  const localIdea = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Ideas domain disabled — local only",
        clientMutationId: "phase120-disabled-idea",
        policyApproval: POLICY
      }
    },
    notesOnlyCtx
  );
  assert.equal(localIdea.ok, true, localIdea.message);

  const publishedNote = await taskEngineModule.onCommand(
    {
      name: "add-phase-note",
      args: {
        phaseKey: "120",
        noteType: "finding",
        summary: "Phase notes domain enabled on restricted publisher",
        idempotencyKey: "phase120-disabled-note",
        policyApproval: POLICY
      }
    },
    notesOnlyCtx
  );
  assert.equal(publishedNote.ok, true, publishedNote.message);

  const remoteSegment = readRemoteEventSegment(bare);
  assert.match(remoteSegment, /planning\.phase_note\.created/);
  assert.doesNotMatch(remoteSegment, /planning\.idea\.created/);

  const publishedIdea = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Ideas domain enabled on canonical publisher",
        clientMutationId: "phase120-enabled-idea",
        policyApproval: POLICY
      }
    },
    ideasOnlyCtx
  );
  assert.equal(publishedIdea.ok, true, publishedIdea.message);

  const remoteWithIdea = readRemoteEventSegment(bare);
  assert.match(remoteWithIdea, /planning\.idea\.created/);

  const consumer = cloneConsumerWorkspace(bare);
  const hydrateCtx = sqliteTaskEngineCtx(consumer, {
    tasks: { canonicalAuthority: "git-event-log" },
    planning: { canonicalSync: { domains: ["phase_notes"] } }
  });

  const hydrate = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: true,
        policyApproval: POLICY
      }
    },
    hydrateCtx
  );
  assert.equal(hydrate.ok, true, hydrate.message);

  const consumerSnapshot = readPlanningConvergenceSnapshot(consumer);
  assert.equal(consumerSnapshot.notes.length, 1);
  assert.equal(consumerSnapshot.notes[0].summary, "Phase notes domain enabled on restricted publisher");
  assert.equal(consumerSnapshot.ideas.length, 0);
});
