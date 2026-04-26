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

function appr() {
  return { caeMutationApproval: { confirmed: true, rationale: "unit test" } };
}

const MUTATOR_COMMANDS = [
  "cae-create-artifact",
  "cae-update-artifact",
  "cae-retire-artifact",
  "cae-create-activation",
  "cae-update-activation",
  "cae-disable-activation",
  "cae-retire-activation",
  "cae-create-registry-version",
  "cae-clone-registry-version",
  "cae-activate-registry-version",
  "cae-delete-registry-version",
  "cae-rollback-registry-version"
];

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

test("governance: CAE disabled denies mutators (cae-mutation-disabled)", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: { schemaVersion: 1, actor: "t", versionId: "cae.reg.x", ...appr() }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: baseEffective({ cae: { enabled: false, adminMutations: true } })
    }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-mutation-disabled");
});

test("governance: json registry store denies mutators (cae-mutation-json-store)", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: { schemaVersion: 1, actor: "t", versionId: "cae.reg.x2", ...appr() }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: baseEffective({ cae: { registryStore: "json" } })
    }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-mutation-json-store");
});

test("governance: each mutator rejects missing caeMutationApproval", async () => {
  const ws = await workspaceWithSeededRegistry();
  for (const name of MUTATOR_COMMANDS) {
    const r = await contextActivationModule.onCommand(
      { name, args: { schemaVersion: 1, actor: "gate-check" } },
      { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
    );
    assert.equal(r.ok, false, name);
    assert.equal(r.code, "cae-mutation-approval-missing", name);
  }
});

test("governance: mutator with approval but empty actor → invalid-args", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-activate-registry-version",
      args: { schemaVersion: 1, actor: "   ", versionId: "cae.reg.seed", ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid-args");
});

test("cae-get-registry-version includeRows returns artifact + activation rows", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-get-registry-version",
      args: { schemaVersion: 1, versionId: "cae.reg.seed", includeRows: true }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.data.artifactRows));
  assert.ok(Array.isArray(r.data.activationRows));
  assert.ok(r.data.artifactRows.length > 0);
  assert.ok(r.data.activationRows.length > 0);
});

test("rollback impossible with only one registry version", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-roll-one-"));
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  const loaded = loadCaeRegistry(ws, { verifyArtifactPaths: true });
  assert.equal(loaded.ok, true);
  replaceActiveCaeRegistryFromLoaded(db, {
    versionId: "cae.reg.only",
    createdBy: "test",
    note: "solo",
    registry: loaded.value
  });
  db.close();

  const r = await contextActivationModule.onCommand(
    { name: "cae-rollback-registry-version", args: { schemaVersion: 1, actor: "t", ...appr() } },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-rollback-impossible");
});

test("delete active registry version is rejected", async () => {
  const ws = await workspaceWithSeededRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-delete-registry-version",
      args: { schemaVersion: 1, actor: "t", versionId: "cae.reg.seed", ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-registry-version-delete-rejected");
});

test("activate + clone reject unknown versionId / fromVersionId", async () => {
  const ws = await workspaceWithSeededRegistry();
  const a = await contextActivationModule.onCommand(
    {
      name: "cae-activate-registry-version",
      args: { schemaVersion: 1, actor: "t", versionId: "cae.reg.does-not-exist", ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(a.ok, false);
  assert.equal(a.code, "cae-registry-version-not-found");

  const c = await contextActivationModule.onCommand(
    {
      name: "cae-clone-registry-version",
      args: {
        schemaVersion: 1,
        actor: "t",
        fromVersionId: "cae.reg.nope",
        toVersionId: "cae.reg.dest",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(c.ok, false);
  assert.equal(c.code, "cae-registry-version-not-found");
});

test("flow: second version → activate → rollback → delete inactive", async () => {
  const ws = await workspaceWithSeededRegistry();
  const mid = "cae.reg.flow.mid";
  const c1 = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: {
        schemaVersion: 1,
        actor: "flow",
        versionId: mid,
        setActive: false,
        note: "mid",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(c1.ok, true);

  const act = await contextActivationModule.onCommand(
    {
      name: "cae-activate-registry-version",
      args: { schemaVersion: 1, actor: "flow", versionId: mid, ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(act.ok, true);

  const roll = await contextActivationModule.onCommand(
    { name: "cae-rollback-registry-version", args: { schemaVersion: 1, actor: "flow", ...appr() } },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(roll.ok, true);
  assert.equal(roll.data.activatedVersionId, "cae.reg.seed");

  const del = await contextActivationModule.onCommand(
    {
      name: "cae-delete-registry-version",
      args: { schemaVersion: 1, actor: "flow", versionId: mid, ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(del.ok, true);
});

test("flow: clone → activate → artifact + activation CRUD on working copy", async () => {
  const ws = await workspaceWithSeededRegistry();
  const cloneId = "cae.reg.flow.clone";
  const cl = await contextActivationModule.onCommand(
    {
      name: "cae-clone-registry-version",
      args: {
        schemaVersion: 1,
        actor: "flow",
        fromVersionId: "cae.reg.seed",
        toVersionId: cloneId,
        setActive: true,
        note: "clone for CRUD",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(cl.ok, true);

  const aid = "cae.test.unit.artifact";
  const cr = await contextActivationModule.onCommand(
    {
      name: "cae-create-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        ...appr(),
        artifact: {
          schemaVersion: 1,
          artifactId: aid,
          artifactType: "policy-doc",
          ref: { path: ".ai/AGENT-CLI-MAP.md" },
          title: "T0"
        }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(cr.ok, true);

  const up = await contextActivationModule.onCommand(
    {
      name: "cae-update-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        ...appr(),
        artifactId: aid,
        artifact: { title: "T1" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(up.ok, true);

  const actId = "cae.test.unit.activation";
  const ca = await contextActivationModule.onCommand(
    {
      name: "cae-create-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        ...appr(),
        activation: {
          schemaVersion: 1,
          activationId: actId,
          family: "do",
          lifecycleState: "active",
          priority: 999,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: aid }]
        }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(ca.ok, true);

  const dis = await contextActivationModule.onCommand(
    {
      name: "cae-disable-activation",
      args: { schemaVersion: 1, actor: "flow", activationId: actId, ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(dis.ok, true);

  const rAct = await contextActivationModule.onCommand(
    {
      name: "cae-retire-activation",
      args: { schemaVersion: 1, actor: "flow", activationId: actId, ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(rAct.ok, true);

  const rArt = await contextActivationModule.onCommand(
    {
      name: "cae-retire-artifact",
      args: { schemaVersion: 1, actor: "flow", artifactId: aid, ...appr() }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(rArt.ok, true);
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
