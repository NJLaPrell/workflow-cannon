import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  insertCaeRegistryMutationAudit,
  insertCaeRegistryVersion
} from "../dist/core/cae/cae-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";

async function workspaceWithPlanningDb() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-authoring-summary-"));
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  return { ws, dbPath: path.join(dbDir, "workspace-kit.db") };
}

async function runCae(ws, name, args, effectiveConfig) {
  return contextActivationModule.onCommand(
    { name, args },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig }
  );
}

test("cae-authoring-summary returns a single read-only authoring contract for the dashboard", async () => {
  const { ws, dbPath } = await workspaceWithPlanningDb();
  await mkdir(path.join(ws, ".ai", "cae", "artifacts", "playbooks"), { recursive: true });
  await writeFile(path.join(ws, ".ai", "cae", "artifacts", "playbooks", "release-sanity.md"), "# Release\n", "utf8");

  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    insertCaeRegistryVersion(db, {
      versionId: "cae.reg.authoring.v1",
      createdBy: "test",
      note: "authoring",
      setActive: true
    });
    insertCaeRegistryArtifactRow(db, {
      versionId: "cae.reg.authoring.v1",
      artifactId: "workspace.playbook.release-sanity",
      artifactType: "playbook",
      path: ".ai/cae/artifacts/playbooks/release-sanity.md",
      title: "Release sanity",
      metadataJson: "{}"
    });
    insertCaeRegistryActivationRow(db, {
      versionId: "cae.reg.authoring.v1",
      activationId: "workspace.activation.release-sanity",
      family: "do",
      priority: 10,
      lifecycleState: "draft",
      scopeJson: JSON.stringify({ conditions: [{ kind: "always" }] }),
      artifactRefsJson: JSON.stringify([{ artifactId: "workspace.playbook.release-sanity" }]),
      metadataJson: "{}"
    });
    insertCaeRegistryMutationAudit(db, {
      actor: "test",
      commandName: "cae-create-artifact",
      versionId: "cae.reg.authoring.v1",
      note: "seed artifact"
    });
  } finally {
    db.close();
  }

  const result = await runCae(
    ws,
    "cae-authoring-summary",
    { schemaVersion: 1 },
    {
      kit: { cae: { enabled: true, persistence: true, registryStore: "sqlite", adminMutations: true } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "cae-authoring-summary-ok");
  assert.equal(result.data.activeVersion.versionId, "cae.reg.authoring.v1");
  assert.equal(result.data.activeVersion.registryDigest.length > 0, true);
  assert.equal(result.data.artifacts.count, 1);
  assert.equal(result.data.artifacts.rows[0].source, "workspace");
  assert.equal(result.data.artifacts.rows[0].fileOwnershipStatus, "workspace-owned");
  assert.equal(result.data.activations.count, 1);
  assert.equal(result.data.activations.rows[0].status, "draft");
  assert.equal(result.data.activations.rows[0].artifactRefs[0].status, "active");
  assert.equal(result.data.counts.artifactSources.workspace, 1);
  assert.equal(result.data.counts.activationStatuses.draft, 1);
  assert.equal(result.data.validation.ok, true);
  assert.equal(result.data.recentMutations.available, true);
  assert.equal(result.data.recentMutations.rows[0].commandName, "cae-create-artifact");
  assert.equal(result.data.readiness.status, "ready");
});

test("cae-authoring-summary degrades safely when no active registry exists", async () => {
  const { ws, dbPath } = await workspaceWithPlanningDb();
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
  } finally {
    db.close();
  }

  const result = await runCae(
    ws,
    "cae-authoring-summary",
    { schemaVersion: 1 },
    {
      kit: { cae: { enabled: true, persistence: true, registryStore: "sqlite", adminMutations: false } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "cae-authoring-summary-ok");
  assert.equal(result.data.artifacts.count, 0);
  assert.equal(result.data.activations.count, 0);
  assert.equal(result.data.validation.ok, false);
  assert.equal(result.data.validation.code, "cae-registry-sqlite-no-active-version");
  assert.equal(result.data.readiness.status, "degraded");
  assert.equal(result.data.recentMutations.available, false);
});
