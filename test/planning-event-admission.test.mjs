import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validatePlanningStateEvent } from "../dist/modules/task-engine/task-state-events/validate-planning-event.js";
import { replayPlanningStateEvents, applyPlanningStateEvent } from "../dist/modules/task-engine/task-state-events/planning-event-applier.js";
import { admitCanonicalStateEventStream } from "../dist/modules/task-engine/task-state-events/canonical-event-admission.js";
import { replayCanonicalStateEvents } from "../dist/modules/task-engine/task-state-events/canonical-replay.js";
import { persistPlanningProjectionToSqlite } from "../dist/modules/task-engine/task-state-events/planning-sqlite-persist.js";
import Database from "better-sqlite3";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

const PLANNING_GOLDEN = [
  "golden-planning-catalog-upserted.v1.json",
  "golden-planning-catalog-removed.v1.json",
  "golden-planning-workspace-status-updated.v1.json",
  "golden-planning-phase-note-created.v1.json",
  "golden-planning-phase-note-archived.v1.json",
  "golden-planning-phase-note-suggestion-created.v1.json",
  "golden-planning-idea-created.v1.json",
  "golden-planning-idea-updated.v1.json",
  "golden-planning-idea-removed.v1.json",
  "golden-planning-module-state-updated.v1.json",
  "golden-planning-module-state-removed.v1.json"
];

test("planning golden fixtures validate", () => {
  for (const file of PLANNING_GOLDEN) {
    const event = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
    const result = validatePlanningStateEvent(event);
    assert.equal(result.ok, true, file);
    assert.ok(result.data.kind.startsWith("planning."));
  }
});

test("planning catalog replay produces expected rows", () => {
  const upsert = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-catalog-upserted.v1.json"), "utf8")
  );
  const removed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-catalog-removed.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([upsert, removed]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.phaseCatalogByKey).length, 1);
  assert.equal(replayed.projection.phaseCatalogByKey["119"].shortDescription, "Planning git sync phase");
});

test("workspace status replay requires matching expectedWorkspaceRevision", () => {
  const wsEvent = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-workspace-status-updated.v1.json"), "utf8")
  );
  const seed = {
    schemaVersion: 1,
    phaseCatalogByKey: {},
    phaseNotesById: {},
    phaseNoteSuggestionsById: {},
    ideasById: {},
    moduleStateById: {},
    workspaceStatus: {
      workspaceRevision: 69,
      currentKitPhase: "119",
      nextKitPhase: "116",
      activeFocus: "Phase 119",
      lastUpdated: "2026-05-29T06:55:18.092Z",
      blockers: [],
      pendingDecisions: [],
      nextAgentActions: [],
      updatedAt: "2026-05-29T06:55:18.092Z"
    },
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set(),
    appliedNoteIdempotencyKeys: new Set(),
    appliedSuggestionMutationIds: new Set(),
    appliedIdeaMutationIds: new Set(),
    appliedModuleStateMutationIds: new Set(),
    lastEventSequence: 0,
    lastUpdated: "1970-01-01T00:00:00.000Z"
  };
  const admitted = admitCanonicalStateEventStream([wsEvent], { initialPlanningProjection: seed });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.events.length, 1);
  const applied = applyPlanningStateEvent(seed, admitted.events[0]);
  assert.equal(applied.ok, true);
  assert.equal(applied.projection.workspaceStatus?.workspaceRevision, 70);
  assert.equal(applied.projection.workspaceStatusAudits.length, 1);
});

test("workspace revision mismatch rejects admission", () => {
  const wsEvent = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-workspace-status-updated.v1.json"), "utf8")
  );
  wsEvent.expectedWorkspaceRevision = 99;
  const admitted = admitCanonicalStateEventStream([wsEvent]);
  assert.equal(admitted.ok, false);
  assert.equal(admitted.error.code, "workspace-revision-mismatch");
});

test("phase note + suggestion replay produces expected projection", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-created.v1.json"), "utf8")
  );
  const suggestion = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-suggestion-created.v1.json"), "utf8")
  );
  const archived = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-archived.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([created, suggestion, archived]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.phaseNotesById).length, 1);
  assert.equal(replayed.projection.phaseNotesById["note-fixture-001"].status, "dismissed");
  assert.equal(replayed.projection.phaseNotesById["note-fixture-001"].refs.length, 1);
  assert.equal(Object.keys(replayed.projection.phaseNoteSuggestionsById).length, 1);
  assert.equal(
    replayed.projection.phaseNoteSuggestionsById["suggestion-fixture-001"].noteId,
    "note-fixture-001"
  );
});

test("phase note create idempotency key skips duplicate rows on replay", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-created.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([created, created]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.phaseNotesById).length, 1);
});

test("persistPlanningProjectionToSqlite writes phase notes refs and suggestions", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-created.v1.json"), "utf8")
  );
  const suggestion = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-phase-note-suggestion-created.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([created, suggestion]);
  assert.equal(replayed.ok, true);

  const db = new Database(":memory:");
  db.exec(`
CREATE TABLE phase_notes (
  id TEXT PRIMARY KEY,
  phase_key TEXT NOT NULL,
  phase_label TEXT,
  task_id TEXT,
  author TEXT,
  author_kind TEXT,
  session_id TEXT,
  source_command TEXT,
  planning_generation INTEGER,
  policy_trace_id TEXT,
  note_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  superseded_by TEXT,
  converted_task_id TEXT,
  idempotency_key TEXT
);
CREATE TABLE phase_note_refs (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_value TEXT NOT NULL
);
CREATE TABLE phase_note_task_suggestions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_status TEXT NOT NULL DEFAULT 'proposed',
  suggested_phase_key TEXT NOT NULL,
  suggested_phase_label TEXT,
  suggested_task_type TEXT,
  acceptance_criteria_json TEXT,
  converted_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
  persistPlanningProjectionToSqlite(db, replayed.projection, { replaceCatalog: false });
  const noteCount = db.prepare("SELECT COUNT(*) AS c FROM phase_notes").get().c;
  const refCount = db.prepare("SELECT COUNT(*) AS c FROM phase_note_refs").get().c;
  const suggestionCount = db.prepare("SELECT COUNT(*) AS c FROM phase_note_task_suggestions").get().c;
  assert.equal(noteCount, 1);
  assert.equal(refCount, 1);
  assert.equal(suggestionCount, 1);
  db.close();
});

test("idea replay create/update/remove produces expected projection", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-created.v1.json"), "utf8")
  );
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-updated.v1.json"), "utf8")
  );
  const removed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-removed.v1.json"), "utf8")
  );
  const afterUpdate = replayPlanningStateEvents([created, updated]);
  assert.equal(afterUpdate.ok, true);
  assert.equal(Object.keys(afterUpdate.projection.ideasById).length, 1);
  assert.equal(afterUpdate.projection.ideasById["I001"].status, "planning");
  assert.equal(afterUpdate.projection.ideasById["I001"].linkedPlanArtifact, "plan-artifact-fixture-001");

  const afterRemove = replayPlanningStateEvents([created, updated, removed]);
  assert.equal(afterRemove.ok, true);
  assert.equal(Object.keys(afterRemove.projection.ideasById).length, 0);
});

test("idea create idempotency key skips duplicate rows on replay", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-created.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([created, created]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.ideasById).length, 1);
});

test("persistPlanningProjectionToSqlite writes workflow_ideas rows", () => {
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-created.v1.json"), "utf8")
  );
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-updated.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([created, updated]);
  assert.equal(replayed.ok, true);

  const db = new Database(":memory:");
  db.exec(`
CREATE TABLE workflow_ideas (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  sort_order INTEGER NOT NULL,
  linked_plan_artifact TEXT,
  previous_plan_artifacts_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
  persistPlanningProjectionToSqlite(db, replayed.projection, { replaceCatalog: false });
  const row = db.prepare("SELECT id, status, linked_plan_artifact FROM workflow_ideas WHERE id = ?").get("I001");
  assert.equal(row.id, "I001");
  assert.equal(row.status, "planning");
  assert.equal(row.linked_plan_artifact, "plan-artifact-fixture-001");
  db.close();
});

test("module state replay upsert/remove produces expected projection", () => {
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-updated.v1.json"), "utf8")
  );
  const sessionCreated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-session-created.v1.json"), "utf8")
  );
  const removed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-removed.v1.json"), "utf8")
  );
  const afterUpdate = replayPlanningStateEvents([updated]);
  assert.equal(afterUpdate.ok, true);
  assert.equal(Object.keys(afterUpdate.projection.moduleStateById).length, 1);
  assert.equal(afterUpdate.projection.moduleStateById["improvement"].stateSchemaVersion, 1);
  assert.equal(afterUpdate.projection.moduleStateById["improvement"].state.lastIngestedPolicyTraceId, 42);

  const afterRemove = replayPlanningStateEvents([sessionCreated, removed]);
  assert.equal(afterRemove.ok, true);
  assert.equal(Object.keys(afterRemove.projection.moduleStateById).length, 0);
});

test("module state schema version mismatch rejects admission", () => {
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-updated.v1.json"), "utf8")
  );
  updated.payload.expectedStateSchemaVersion = 99;
  const admitted = admitCanonicalStateEventStream([updated]);
  assert.equal(admitted.ok, false);
  assert.equal(admitted.error.code, "module-state-schema-version-mismatch");
});

test("module state create idempotency key skips duplicate rows on replay", () => {
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-updated.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([updated, updated]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.moduleStateById).length, 1);
});

test("persistPlanningProjectionToSqlite writes workspace_module_state rows", () => {
  const updated = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-module-state-updated.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([updated]);
  assert.equal(replayed.ok, true);

  const db = new Database(":memory:");
  db.exec(`
CREATE TABLE workspace_module_state (
  module_id TEXT PRIMARY KEY,
  state_schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
  persistPlanningProjectionToSqlite(db, replayed.projection, { replaceCatalog: false });
  const row = db
    .prepare("SELECT module_id, state_schema_version, state_json FROM workspace_module_state WHERE module_id = ?")
    .get("improvement");
  assert.equal(row.module_id, "improvement");
  assert.equal(row.state_schema_version, 1);
  const state = JSON.parse(row.state_json);
  assert.equal(state.lastIngestedPolicyTraceId, 42);
  db.close();
});

test("resolveEnabledPlanningSyncDomains defaults to all Phase 119+120 domains when omitted", async () => {
  const { resolveEnabledPlanningSyncDomains, ALL_PLANNING_SYNC_DOMAINS } = await import(
    "../dist/modules/task-engine/persistence/planning-canonical-sync-domains.js"
  );
  const enabled = resolveEnabledPlanningSyncDomains({ effectiveConfig: {} });
  assert.deepEqual(enabled, [...ALL_PLANNING_SYNC_DOMAINS]);
});

test("disabled planning sync domain skips replay apply and sqlite persist", async () => {
  const { enabledPlanningSyncDomainSet } = await import(
    "../dist/modules/task-engine/persistence/planning-canonical-sync-domains.js"
  );
  const created = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-created.v1.json"), "utf8")
  );
  const ctx = {
    effectiveConfig: {
      tasks: { canonicalAuthority: "git-event-log" },
      planning: { canonicalSync: { domains: ["phase_catalog"] } }
    }
  };
  const enabledDomains = enabledPlanningSyncDomainSet(ctx);
  assert.equal(enabledDomains.has("ideas"), false);

  const replayed = replayPlanningStateEvents([created], { enabledDomains });
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.ideasById).length, 0);

  const db = new Database(":memory:");
  db.exec(`
CREATE TABLE workflow_ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  linked_plan_artifact TEXT,
  previous_plan_artifacts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
  db.prepare(
    `INSERT INTO workflow_ideas (id, title, note, status, sort_order, linked_plan_artifact, previous_plan_artifacts_json, created_at, updated_at)
     VALUES ('I999', 'seed', NULL, 'open', 0, NULL, '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).run();

  const fullReplay = replayPlanningStateEvents([created]);
  assert.equal(Object.keys(fullReplay.projection.ideasById).length, 1);
  persistPlanningProjectionToSqlite(db, fullReplay.projection, { enabledDomains, replaceCatalog: false });
  const row = db.prepare(`SELECT id FROM workflow_ideas WHERE id = 'I999'`).get();
  assert.ok(row, "ideas domain disabled should not replace existing workflow_ideas rows");
  db.close();
});

test("filterPlanningEventsByEnabledDomains drops disabled domain events before publish", async () => {
  const { filterPlanningEventsByEnabledDomains } = await import(
    "../dist/modules/task-engine/persistence/planning-canonical-sync-domains.js"
  );
  const upsert = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-catalog-upserted.v1.json"), "utf8")
  );
  const idea = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-idea-created.v1.json"), "utf8")
  );
  const ctx = {
    effectiveConfig: {
      tasks: { canonicalAuthority: "git-event-log" },
      planning: { canonicalSync: { domains: ["ideas"] } }
    }
  };
  const filtered = filterPlanningEventsByEnabledDomains(ctx, [upsert, idea]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, "planning.idea.created");
});
