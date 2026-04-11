/**
 * CAE registry admin CLI + governance gate (Phase 70 — T895–T897, T900–T902, T911, T913).
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { replaceActiveCaeRegistryFromLoaded } from "../dist/core/cae/cae-registry-sqlite.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function workspaceWithSeededRegistry() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-admin-"));
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  const loaded = loadCaeRegistry(ws, { verifyArtifactPaths: true });
  assert.equal(loaded.ok, true);
  replaceActiveCaeRegistryFromLoaded(db, {
    versionId: "cae.reg.seed",
    createdBy: "test",
    note: "seed",
    registry: loaded.value
  });
  db.close();
  return ws;
}

function baseEffective(overrides = {}) {
  return {
    kit: {
      cae: {
        enabled: true,
        registryStore: "sqlite",
        adminMutations: true,
        ...overrides.cae
      }
    },
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
    ...overrides.rest
  };
}

test("cae-list-registry-versions is read-only (no mutation gate)", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    { name: "cae-list-registry-versions", args: { schemaVersion: 1 } },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective({ cae: { adminMutations: false } }) }
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "cae-list-registry-versions-ok");
  assert.ok(Array.isArray(r.data.versions));
});

test("governance: adminMutations false denies mutator", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: {
        schemaVersion: 1,
        actor: "t",
        versionId: "cae.reg.denied",
        caeMutationApproval: { confirmed: true, rationale: "x" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective({ cae: { adminMutations: false } }) }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-mutation-admin-off");
});

test("governance: missing caeMutationApproval", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: { schemaVersion: 1, actor: "t", versionId: "cae.reg.denied2" }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-mutation-approval-missing");
});

test("happy path: create inactive version + audit row", async () => {
  const ws = await workspaceWithSeededRegistry();
  const vid = "cae.reg.admin.empty";
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: {
        schemaVersion: 1,
        actor: "tester",
        versionId: vid,
        note: "empty",
        setActive: false,
        caeMutationApproval: { confirmed: true, rationale: "unit test" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, true);
  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const n = db.prepare(`SELECT COUNT(*) AS c FROM cae_registry_mutations WHERE command_name = ?`).get(
      "cae-create-registry-version"
    );
    assert.ok(Number(n.c) >= 1);
  } finally {
    db.close();
  }
});

test("import-json-registry writes cae_registry_mutations audit", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-import-audit-"));
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  db.close();

  const r = await contextActivationModule.onCommand(
    {
      name: "cae-import-json-registry",
      args: {
        schemaVersion: 1,
        actor: "importer",
        note: "audit test",
        policyApproval: { confirmed: true, rationale: "import for audit test" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, true);
  const db2 = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db2);
    const n = db2.prepare(`SELECT COUNT(*) AS c FROM cae_registry_mutations WHERE command_name = ?`).get(
      "cae-import-json-registry"
    );
    assert.ok(Number(n.c) >= 1);
  } finally {
    db2.close();
  }
});
