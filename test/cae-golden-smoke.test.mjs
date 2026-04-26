/**
 * CAE golden operator path: fixture-backed happy path + representative recovery.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { replaceActiveCaeRegistryFromLoaded } from "../dist/core/cae/cae-registry-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { contextActivationModule } from "../dist/index.js";
import { clearCaeSessionsForTests } from "../dist/modules/context-activation/trace-store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function workspaceWithSeededRegistry() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-golden-"));
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  const loaded = loadCaeRegistry(ws, { verifyArtifactPaths: true });
  assert.equal(loaded.ok, true, loaded.message);
  replaceActiveCaeRegistryFromLoaded(db, {
    versionId: "cae.reg.golden",
    createdBy: "test",
    note: "golden smoke",
    registry: loaded.value
  });
  db.close();
  return ws;
}

function effective() {
  return {
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
    kit: { cae: { enabled: true, registryStore: "sqlite", persistence: true } }
  };
}

async function runCae(ws, name, args) {
  return contextActivationModule.onCommand(
    { name, args },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: effective() }
  );
}

test("golden CAE operator path evaluates, explains, fetches persisted trace, and inspects ack", async () => {
  const ws = await workspaceWithSeededRegistry();
  const evaluationContext = JSON.parse(
    await readFile(path.join(root, "fixtures/cae/golden/happy-evaluation-context.json"), "utf8")
  );

  const health = await runCae(ws, "cae-health", { schemaVersion: 1, includeDetails: true });
  assert.equal(health.ok, true);
  assert.equal(health.data.registryStatus, "ok");
  assert.equal(health.data.activeRegistryVersionId, "cae.reg.golden");

  const validate = await runCae(ws, "cae-registry-validate", { schemaVersion: 1 });
  assert.equal(validate.ok, true);
  assert.ok(validate.data.artifactCount >= 12);
  assert.ok(validate.data.activationCount >= 4);

  const evaluated = await runCae(ws, "cae-evaluate", {
    schemaVersion: 1,
    evalMode: "shadow",
    evaluationContext
  });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.code, "cae-evaluate-ok");
  assert.equal(evaluated.data.ephemeral, false);
  assert.ok(evaluated.data.bundle.families.policy.length >= 1);
  assert.ok(evaluated.data.bundle.shadowObservation.wouldActivate.length >= 1);

  const recent = await runCae(ws, "cae-recent-traces", {
    schemaVersion: 1,
    limit: 5
  });
  assert.equal(recent.ok, true);
  assert.equal(recent.code, "cae-recent-traces-ok");
  assert.equal(recent.data.rows[0].traceId, evaluated.data.traceId);
  assert.ok(recent.data.rows[0].totalGuidanceCount >= 1);
  assert.equal(recent.data.rows[0].taskId, "T921");
  assert.equal(recent.data.rows[0].taskTitle, "CAE operator golden path");
  assert.equal(recent.data.rows[0].commandName, "get-next-actions");

  const summary = await runCae(ws, "cae-dashboard-summary", { schemaVersion: 1 });
  assert.equal(summary.ok, true);
  assert.equal(summary.code, "cae-dashboard-summary-ok");
  assert.equal(summary.data.product.productName, "Guidance");
  assert.equal(summary.data.recentTraces.available, true);

  const preview = await runCae(ws, "cae-guidance-preview", {
    schemaVersion: 1,
    taskId: "T921",
    commandName: "get-next-actions",
    evalMode: "shadow"
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.code, "cae-guidance-preview-ok");
  assert.equal(preview.data.modeLabel, "Preview mode");
  assert.ok(preview.data.totalGuidanceCount >= 1);
  assert.ok(preview.data.guidanceCards.do.length >= 1);

  const explained = await runCae(ws, "cae-explain", {
    schemaVersion: 1,
    traceId: evaluated.data.traceId,
    level: "summary"
  });
  assert.equal(explained.ok, true);
  assert.match(explained.data.explanation.summaryText, /matched policy=/);

  clearCaeSessionsForTests();
  const fetched = await runCae(ws, "cae-get-trace", {
    schemaVersion: 1,
    traceId: evaluated.data.traceId
  });
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.storage, "sqlite");
  assert.equal(fetched.data.ephemeral, false);

  const conflicts = await runCae(ws, "cae-conflicts", {
    schemaVersion: 1,
    evalMode: "shadow",
    evaluationContext
  });
  assert.equal(conflicts.ok, true);
  assert.equal(conflicts.code, "cae-conflicts-ok");

  const ack = await runCae(ws, "cae-satisfy-ack", {
    schemaVersion: 1,
    traceId: evaluated.data.traceId,
    activationId: "cae.activation.policy.phase70-playbook",
    ackToken: "phase70-policy-surface",
    actor: "test@example"
  });
  assert.equal(ack.ok, true);

  const listed = await runCae(ws, "cae-list-acks", {
    schemaVersion: 1,
    traceId: evaluated.data.traceId
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.count, 1);
  assert.equal(listed.data.rows[0].activationId, "cae.activation.policy.phase70-playbook");
});

test("cae-recent-traces derives summaries for pre-summary persisted rows", async () => {
  const ws = await workspaceWithSeededRegistry();
  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    db.prepare(
      `INSERT INTO cae_trace_snapshots (trace_id, trace_json, bundle_json, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      "cae.trace.legacy",
      JSON.stringify({ schemaVersion: 1, traceId: "cae.trace.legacy", bundleId: "cae.bundle.legacy", events: [] }),
      JSON.stringify({
        schemaVersion: 1,
        traceId: "cae.trace.legacy",
        bundleId: "cae.bundle.legacy",
        evaluationPipelineMode: "shadow",
        families: { policy: [{}], think: [], do: [], review: [] },
        pendingAcknowledgements: [],
        conflictShadowSummary: { evalMode: "shadow", entries: [] }
      }),
      "2026-04-26T00:00:00.000Z"
    );
  } finally {
    db.close();
  }

  const recent = await runCae(ws, "cae-recent-traces", {
    schemaVersion: 1,
    limit: 1
  });
  assert.equal(recent.ok, true);
  assert.equal(recent.data.rows[0].traceId, "cae.trace.legacy");
  assert.equal(recent.data.rows[0].totalGuidanceCount, 1);
  assert.equal(recent.data.rows[0].commandName, undefined);
});

test("golden negative fixture returns structured trace-not-found recovery", async () => {
  const ws = await workspaceWithSeededRegistry();
  const args = JSON.parse(await readFile(path.join(root, "fixtures/cae/golden/trace-not-found-request.json"), "utf8"));
  const r = await runCae(ws, "cae-get-trace", args);
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-trace-not-found");
});

test("shadow feedback can be recorded and reported without a new SQLite migration", async () => {
  const ws = await workspaceWithSeededRegistry();
  const recorded = await runCae(ws, "cae-record-shadow-feedback", {
    schemaVersion: 1,
    traceId: "cae.trace.feedback",
    activationId: "cae.activation.policy.phase70-playbook",
    commandName: "get-next-actions",
    signal: "useful",
    actor: "test@example",
    note: "helpful"
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.data.summary.useful, 1);

  const report = await runCae(ws, "cae-shadow-feedback-report", {
    schemaVersion: 1,
    activationId: "cae.activation.policy.phase70-playbook"
  });
  assert.equal(report.ok, true);
  assert.equal(report.data.summary.total, 1);
  assert.equal(report.data.rows[0].signal, "useful");
});

test("package allowlist includes CAE operator artifacts needed outside the repo checkout", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.ok(pkg.files.includes(".ai"));
  assert.ok(pkg.files.includes("schemas"));
  assert.ok(pkg.files.includes("src/modules/context-activation/instructions"));
  assert.ok(pkg.files.includes("fixtures/cae/golden"));
});
