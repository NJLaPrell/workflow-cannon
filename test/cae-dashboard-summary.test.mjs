/**
 * Focused degraded-state coverage for the CAE Guidance dashboard aggregate.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function tmpWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "wk-cae-dashboard-"));
}

async function workspaceWithPlanningDb() {
  const ws = await tmpWorkspace();
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  db.close();
  return ws;
}

async function workspaceWithJsonRegistry() {
  const ws = await workspaceWithPlanningDb();
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  return ws;
}

async function runCae(ws, name, args, effectiveConfig) {
  return contextActivationModule.onCommand(
    { name, args },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig }
  );
}

test("cae-dashboard-summary reports missing active SQLite registry as recoverable", async () => {
  const ws = await workspaceWithPlanningDb();
  const r = await runCae(
    ws,
    "cae-dashboard-summary",
    { schemaVersion: 1 },
    {
      kit: { cae: { enabled: true, persistence: true, registryStore: "sqlite" } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.health.registryStatus, "invalid");
  assert.equal(r.data.validation.ok, false);
  assert.equal(r.data.validation.code, "cae-registry-sqlite-no-active-version");
  assert.equal(r.data.health.issues[0].code, "cae-registry-sqlite-no-active-version");
  assert.equal(r.data.guidanceProduct.rulesCatalog.degraded, true);
  assert.equal(r.data.guidanceProduct.rulesCatalog.itemCount, 0);
});

test("cae-dashboard-summary reports invalid JSON registry without failing the aggregate", async () => {
  const ws = await workspaceWithPlanningDb();
  const reg = path.join(ws, ".ai", "cae", "registry");
  await mkdir(reg, { recursive: true });
  await writeFile(path.join(reg, "artifacts.v1.json"), '{"schemaVersion":1,"artifacts":[]}', "utf8");
  await writeFile(path.join(reg, "activations.v1.json"), "NOT JSON {{{", "utf8");

  const r = await runCae(
    ws,
    "cae-dashboard-summary",
    { schemaVersion: 1 },
    {
      kit: { cae: { enabled: true, persistence: false, registryStore: "json" } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.health.registryStatus, "invalid");
  assert.equal(r.data.validation.ok, false);
  assert.equal(r.data.validation.code, "cae-registry-invalid-json");
  assert.equal(r.data.guidanceProduct.rulesCatalog.degraded, true);
  assert.equal(r.data.guidanceProduct.rulesCatalog.itemCount, 0);
});

test("cae-dashboard-summary and cae-recent-traces report persistence-disabled trace listing", async () => {
  const ws = await workspaceWithJsonRegistry();
  const effectiveConfig = {
    kit: { cae: { enabled: true, persistence: false, registryStore: "json" } },
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
  };

  const summary = await runCae(ws, "cae-dashboard-summary", { schemaVersion: 1 }, effectiveConfig);
  assert.equal(summary.ok, true);
  assert.equal(summary.data.recentTraces.available, false);
  assert.equal(summary.data.recentTraces.code, "cae-persistence-disabled");

  const recent = await runCae(ws, "cae-recent-traces", { schemaVersion: 1 }, effectiveConfig);
  assert.equal(recent.ok, false);
  assert.equal(recent.code, "cae-persistence-disabled");
});

test("cae-dashboard-summary exposes additive Guidance product model", async () => {
  const ws = await workspaceWithJsonRegistry();
  const r = await runCae(
    ws,
    "cae-dashboard-summary",
    { schemaVersion: 1 },
    {
      kit: { cae: { enabled: true, persistence: true, registryStore: "json", adminMutations: false } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.guidanceProduct.schemaVersion, 1);
  assert.equal(r.data.guidanceProduct.labels.productName, "Guidance");
  assert.ok(r.data.guidanceProduct.intents.workflows.some((row) => row.name === "get-next-actions"));
  assert.deepEqual(r.data.guidanceProduct.mutationCapability, {
    adminMutations: false,
    canMutate: false,
    denialReason: "Guidance admin mutations are disabled by config.",
    approvalModel: {
      caeMutationApprovalRequired: true,
      policyApprovalSeparate: true
    }
  });
  assert.ok(Array.isArray(r.data.guidanceProduct.library.artifacts.artifactIds));
  assert.ok(Array.isArray(r.data.guidanceProduct.library.activations.activationIds));
  const cat = r.data.guidanceProduct.rulesCatalog;
  assert.equal(cat.schemaVersion, 1);
  assert.equal(cat.degraded ?? false, false);
  assert.ok(cat.itemCount > 0, "expected JSON registry fixture to include activations");
  assert.ok(Array.isArray(cat.items) && cat.items.length > 0);
  const row = cat.items[0];
  assert.equal(row.schemaVersion, 1);
  assert.ok(typeof row.displayTitle === "string" && row.displayTitle.length > 0);
  assert.ok(typeof row.appliesWhen === "string");
  assert.ok(["policy", "think", "do", "review"].includes(row.family));
  assert.ok(row.mutation);
  assert.ok(typeof row.debug.activationId === "string");
  assert.ok(Array.isArray(row.debug.artifactIds));
});
