/**
 * CAE registry admin CLI + governance gate (Phase 70 — T895–T897, T900–T902, T911, T913).
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
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

async function authoringSummary(ws, effectiveConfig = baseEffective()) {
  const result = await contextActivationModule.onCommand(
    { name: "cae-authoring-summary", args: { schemaVersion: 1 } },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig }
  );
  assert.equal(result.ok, true);
  return result.data;
}

const MUTATOR_COMMANDS = [
  "cae-create-artifact",
  "cae-create-workspace-artifact",
  "cae-duplicate-default-artifact",
  "cae-update-artifact",
  "cae-update-workspace-artifact",
  "cae-retire-artifact",
  "cae-retire-workspace-artifact",
  "cae-create-activation",
  "cae-create-draft-activation",
  "cae-update-activation",
  "cae-update-draft-activation",
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

test("stale-state guard rejects artifact mutation when expected registry digest is outdated", async () => {
  const ws = await workspaceWithSeededRegistry();
  const initial = await authoringSummary(ws);

  const drift = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: {
        schemaVersion: 1,
        actor: "drift",
        versionId: "cae.reg.stale.next",
        setActive: true,
        note: "simulate concurrent dashboard change",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(drift.ok, true);

  const stale = await contextActivationModule.onCommand(
    {
      name: "cae-create-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        expectedActiveVersionId: initial.activeVersion.versionId,
        expectedRegistryDigest: initial.activeVersion.registryDigest,
        ...appr(),
        artifact: {
          schemaVersion: 1,
          artifactId: "cae.test.stale.artifact",
          artifactType: "policy-doc",
          ref: { path: ".ai/AGENT-CLI-MAP.md" },
          title: "stale"
        }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "cae-stale-state");
  assert.equal(stale.data.staleState.expectedActiveVersionId, initial.activeVersion.versionId);
  assert.equal(stale.data.staleState.expectedRegistryDigest, initial.activeVersion.registryDigest);
  assert.equal(stale.data.staleState.actualActiveVersionId, "cae.reg.stale.next");
  assert.match(stale.data.staleState.repair.message, /Refresh/i);
});

test("stale-state guard rejects activation mutation when expected active version is outdated", async () => {
  const ws = await workspaceWithSeededRegistry();
  const initial = await authoringSummary(ws);

  const drift = await contextActivationModule.onCommand(
    {
      name: "cae-create-registry-version",
      args: {
        schemaVersion: 1,
        actor: "drift",
        versionId: "cae.reg.stale.activation",
        setActive: true,
        note: "simulate concurrent draft switch",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(drift.ok, true);

  const stale = await contextActivationModule.onCommand(
    {
      name: "cae-create-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        expectedActiveVersionId: initial.activeVersion.versionId,
        ...appr(),
        activation: {
          schemaVersion: 1,
          activationId: "cae.test.stale.activation",
          family: "do",
          lifecycleState: "active",
          priority: 10,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: "cae.playbook.machine-playbooks" }]
        }
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "cae-stale-state");
  assert.equal(stale.data.staleState.expectedActiveVersionId, initial.activeVersion.versionId);
  assert.equal(stale.data.staleState.actualActiveVersionId, "cae.reg.stale.activation");
  assert.equal(stale.data.staleState.expectedRegistryDigest, null);
});

test("cae-create-workspace-artifact writes one markdown file, one registry row, and one audit row", async () => {
  const ws = await workspaceWithSeededRegistry();
  const result = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.sample.playbook",
        artifactType: "playbook",
        title: "Workspace Sample Playbook",
        slug: "sample-playbook",
        tags: ["ops", "launch"],
        contentMarkdown: "# Workspace Sample Playbook\n\nHello from a workspace artifact.\n",
        fragment: "section-1",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "cae-create-workspace-artifact-ok");
  assert.equal(result.data.path, ".ai/cae/artifacts/playbooks/sample-playbook.md");

  const markdownPath = path.join(ws, result.data.path);
  const markdown = await readFile(markdownPath, "utf8");
  assert.match(markdown, /Hello from a workspace artifact/);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const artifactRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`)
    .get("cae.reg.seed", "workspace.sample.playbook");
  const artifactRow = db
    .prepare(
      `SELECT path, metadata_json FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
    )
    .get("cae.reg.seed", "workspace.sample.playbook");
  const auditRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_mutations WHERE command_name = ? AND payload_json LIKE ?`)
    .get("cae-create-workspace-artifact", '%workspace.sample.playbook%');
  db.close();

  assert.equal(artifactRowCount.count, 1);
  assert.equal(artifactRow.path, ".ai/cae/artifacts/playbooks/sample-playbook.md");
  assert.match(artifactRow.metadata_json, /ops/);
  assert.match(artifactRow.metadata_json, /launch/);
  assert.equal(auditRowCount.count, 1);
});

test("cae-create-workspace-artifact cleans up file when registry insert fails", async () => {
  const ws = await workspaceWithSeededRegistry();
  const first = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.duplicate.id",
        artifactType: "playbook",
        title: "First Copy",
        slug: "original-duplicate-id",
        contentMarkdown: "# First\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(first.ok, true);

  const result = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.duplicate.id",
        artifactType: "playbook",
        title: "Duplicate Id",
        slug: "duplicate-id-should-clean-up",
        contentMarkdown: "# Duplicate\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "cae-artifact-exists");

  const markdownPath = path.join(ws, ".ai/cae/artifacts/playbooks/duplicate-id-should-clean-up.md");
  await assert.rejects(readFile(markdownPath, "utf8"));

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const artifactRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`)
    .get("cae.reg.seed", "workspace.duplicate.id");
  db.close();
  assert.equal(artifactRowCount.count, 1);
});

test("cae-retire-workspace-artifact retires the row and keeps the markdown file", async () => {
  const ws = await workspaceWithSeededRegistry();
  const created = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.retire.me",
        artifactType: "playbook",
        title: "Retire Me",
        slug: "retire-me",
        contentMarkdown: "# Retire Me\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(created.ok, true);

  const retired = await contextActivationModule.onCommand(
    {
      name: "cae-retire-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.retire.me",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(retired.ok, true);
  assert.equal(retired.code, "cae-retire-workspace-artifact-ok");

  const markdownPath = path.join(ws, ".ai/cae/artifacts/playbooks/retire-me.md");
  const markdown = await readFile(markdownPath, "utf8");
  assert.match(markdown, /Retire Me/);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const retiredRow = db
    .prepare(`SELECT retired_at FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`)
    .get("cae.reg.seed", "workspace.retire.me");
  const auditRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_mutations WHERE command_name = ? AND payload_json LIKE ?`)
    .get("cae-retire-workspace-artifact", '%workspace.retire.me%');
  db.close();

  assert.ok(retiredRow.retired_at);
  assert.equal(auditRowCount.count, 1);
});

test("cae-retire-workspace-artifact rejects default artifact ids", async () => {
  const ws = await workspaceWithSeededRegistry();
  const retired = await contextActivationModule.onCommand(
    {
      name: "cae-retire-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "cae.playbook.machine-playbooks",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(retired.ok, false);
  assert.equal(retired.code, "cae-workspace-artifact-id-invalid");
});

test("cae-retire-workspace-artifact blocks retirement when an activation still references it", async () => {
  const ws = await workspaceWithSeededRegistry();
  const created = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.in.use",
        artifactType: "playbook",
        title: "In Use",
        slug: "in-use",
        contentMarkdown: "# In Use\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(created.ok, true);

  const activation = await contextActivationModule.onCommand(
    {
      name: "cae-create-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activation: {
          schemaVersion: 1,
          activationId: "cae.activation.workspace-artifact-in-use",
          family: "do",
          lifecycleState: "active",
          priority: 20,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: "workspace.in.use" }]
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(activation.ok, true);

  const retired = await contextActivationModule.onCommand(
    {
      name: "cae-retire-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.in.use",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(retired.ok, false);
  assert.equal(retired.code, "cae-artifact-in-use");
});

test("cae-update-workspace-artifact updates markdown, metadata, and reports impacted activations", async () => {
  const ws = await workspaceWithSeededRegistry();
  const created = await contextActivationModule.onCommand(
    {
      name: "cae-create-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.update.me",
        artifactType: "playbook",
        title: "Update Me",
        slug: "update-me",
        tags: ["ops"],
        contentMarkdown: "# Update Me\n\nOriginal body.\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(created.ok, true);

  const activation = await contextActivationModule.onCommand(
    {
      name: "cae-create-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activation: {
          schemaVersion: 1,
          activationId: "cae.activation.workspace-update-impact",
          family: "do",
          lifecycleState: "active",
          priority: 10,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: "workspace.update.me" }]
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(activation.ok, true);

  const updated = await contextActivationModule.onCommand(
    {
      name: "cae-update-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "workspace.update.me",
        artifact: {
          title: "Updated Workspace Playbook",
          artifactType: "playbook",
          tags: ["ops", "release"]
        },
        slug: "updated-workspace-playbook",
        contentMarkdown: "# Updated Workspace Playbook\n\nRefreshed body.\n",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.code, "cae-update-workspace-artifact-ok");
  assert.equal(updated.data.path, ".ai/cae/artifacts/playbooks/updated-workspace-playbook.md");
  assert.deepEqual(updated.data.impactedActivationIds, ["cae.activation.workspace-update-impact"]);
  assert.match(JSON.stringify(updated.data.warnings), /cae-workspace-artifact-activation-impact/);

  const oldMarkdownPath = path.join(ws, ".ai/cae/artifacts/playbooks/update-me.md");
  await assert.rejects(readFile(oldMarkdownPath, "utf8"));

  const newMarkdownPath = path.join(ws, updated.data.path);
  const markdown = await readFile(newMarkdownPath, "utf8");
  assert.match(markdown, /Refreshed body/);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const row = db
    .prepare(
      `SELECT path, title, description, metadata_json FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
    )
    .get("cae.reg.seed", "workspace.update.me");
  const auditRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_mutations WHERE command_name = ? AND payload_json LIKE ?`)
    .get("cae-update-workspace-artifact", '%workspace.update.me%');
  db.close();

  assert.equal(row.path, ".ai/cae/artifacts/playbooks/updated-workspace-playbook.md");
  assert.equal(row.title, "Updated Workspace Playbook");
  assert.equal(row.description, null);
  assert.match(row.metadata_json, /release/);
  assert.match(row.metadata_json, /updated-workspace-playbook/);
  assert.equal(auditRowCount.count, 1);
});

test("cae-update-workspace-artifact rejects default artifact ids", async () => {
  const ws = await workspaceWithSeededRegistry();
  const updated = await contextActivationModule.onCommand(
    {
      name: "cae-update-workspace-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        artifactId: "cae.playbook.machine-playbooks",
        artifact: { title: "Nope" },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(updated.ok, false);
  assert.equal(updated.code, "cae-workspace-artifact-id-invalid");
});

test("cae-duplicate-default-artifact copies default content into a new workspace artifact row", async () => {
  const ws = await workspaceWithSeededRegistry();
  const sourcePath = path.join(ws, ".ai/MACHINE-PLAYBOOKS.md");
  const sourceMarkdown = await readFile(sourcePath, "utf8");

  const duplicated = await contextActivationModule.onCommand(
    {
      name: "cae-duplicate-default-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        sourceArtifactId: "cae.playbook.machine-playbooks",
        artifactId: "workspace.machine-playbooks.copy",
        slug: "machine-playbooks-copy",
        title: "Machine Playbooks Copy",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(duplicated.ok, true);
  assert.equal(duplicated.code, "cae-duplicate-default-artifact-ok");
  assert.equal(duplicated.data.path, ".ai/cae/artifacts/playbooks/machine-playbooks-copy.md");
  assert.equal(duplicated.data.sourceArtifactId, "cae.playbook.machine-playbooks");

  const duplicatedMarkdown = await readFile(path.join(ws, duplicated.data.path), "utf8");
  assert.equal(duplicatedMarkdown, sourceMarkdown);
  const originalMarkdown = await readFile(sourcePath, "utf8");
  assert.equal(originalMarkdown, sourceMarkdown);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const row = db
    .prepare(
      `SELECT path, title, description, metadata_json FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
    )
    .get("cae.reg.seed", "workspace.machine-playbooks.copy");
  const auditRowCount = db
    .prepare(`SELECT COUNT(*) AS count FROM cae_registry_mutations WHERE command_name = ? AND payload_json LIKE ?`)
    .get("cae-duplicate-default-artifact", '%workspace.machine-playbooks.copy%');
  db.close();

  assert.equal(row.path, ".ai/cae/artifacts/playbooks/machine-playbooks-copy.md");
  assert.equal(row.title, "Machine Playbooks Copy");
  assert.match(row.metadata_json, /cae.playbook.machine-playbooks/);
  assert.match(row.metadata_json, /sourceContentHash/);
  assert.equal(auditRowCount.count, 1);
});

test("cae-duplicate-default-artifact rejects non-default source artifact ids", async () => {
  const ws = await workspaceWithSeededRegistry();
  const duplicated = await contextActivationModule.onCommand(
    {
      name: "cae-duplicate-default-artifact",
      args: {
        schemaVersion: 1,
        actor: "flow",
        sourceArtifactId: "workspace.not-a-default",
        artifactId: "workspace.copy.target",
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.code, "cae-default-artifact-id-invalid");
});

test("cae-create-draft-activation stores draft lifecycle and returns broad-scope warnings", async () => {
  const ws = await workspaceWithSeededRegistry();
  const result = await contextActivationModule.onCommand(
    {
      name: "cae-create-draft-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activation: {
          schemaVersion: 1,
          activationId: "cae.activation.draft.policy.always",
          family: "policy",
          lifecycleState: "draft",
          priority: 25,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: "cae.playbook.machine-playbooks" }]
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "cae-create-draft-activation-ok");
  assert.match(JSON.stringify(result.data.warnings), /cae-draft-policy-family/);
  assert.match(JSON.stringify(result.data.warnings), /cae-draft-broad-scope-always/);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const row = db
    .prepare(`SELECT lifecycle_state FROM cae_registry_activations WHERE version_id = ? AND activation_id = ?`)
    .get("cae.reg.seed", "cae.activation.draft.policy.always");
  db.close();
  assert.equal(row.lifecycle_state, "draft");
});

test("cae-update-draft-activation keeps draft lifecycle and returns command-prefix warnings", async () => {
  const ws = await workspaceWithSeededRegistry();
  const created = await contextActivationModule.onCommand(
    {
      name: "cae-create-draft-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activation: {
          schemaVersion: 1,
          activationId: "cae.activation.draft.command-prefix",
          family: "do",
          lifecycleState: "draft",
          priority: 30,
          scope: { conditions: [{ kind: "commandName", match: "exact", value: "run-transition" }] },
          artifactRefs: [{ artifactId: "cae.playbook.machine-playbooks" }]
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(created.ok, true);

  const updated = await contextActivationModule.onCommand(
    {
      name: "cae-update-draft-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activationId: "cae.activation.draft.command-prefix",
        activation: {
          lifecycleState: "draft",
          scope: { conditions: [{ kind: "commandName", match: "prefix", value: "run-" }] },
          priority: 35
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.code, "cae-update-draft-activation-ok");
  assert.match(JSON.stringify(updated.data.warnings), /cae-draft-broad-scope-command-prefix/);

  const db = new Database(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"));
  const row = db
    .prepare(`SELECT lifecycle_state, priority FROM cae_registry_activations WHERE version_id = ? AND activation_id = ?`)
    .get("cae.reg.seed", "cae.activation.draft.command-prefix");
  db.close();
  assert.equal(row.lifecycle_state, "draft");
  assert.equal(row.priority, 35);
});

test("cae-update-draft-activation rejects non-draft activations", async () => {
  const ws = await workspaceWithSeededRegistry();
  const created = await contextActivationModule.onCommand(
    {
      name: "cae-create-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activation: {
          schemaVersion: 1,
          activationId: "cae.activation.active.only",
          family: "do",
          lifecycleState: "active",
          priority: 40,
          scope: { conditions: [{ kind: "always" }] },
          artifactRefs: [{ artifactId: "cae.playbook.machine-playbooks" }]
        },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(created.ok, true);

  const updated = await contextActivationModule.onCommand(
    {
      name: "cae-update-draft-activation",
      args: {
        schemaVersion: 1,
        actor: "flow",
        activationId: "cae.activation.active.only",
        activation: { priority: 41 },
        ...appr()
      }
    },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig: baseEffective() }
  );
  assert.equal(updated.ok, false);
  assert.equal(updated.code, "cae-activation-not-draft");
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
