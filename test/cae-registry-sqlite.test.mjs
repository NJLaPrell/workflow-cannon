import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { mkdirSync } from "node:fs";

import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  insertCaeRegistryVersion
} from "../dist/core/cae/cae-kit-sqlite.js";
import {
  loadCaeRegistryFromSqliteDb,
  replaceActiveCaeRegistryFromLoaded
} from "../dist/core/cae/cae-registry-sqlite.js";

const workspaceRoot = process.cwd();

test("loadCaeRegistryFromSqliteDb: no active version", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-cae-sqlite-empty-"));
  const dbPath = path.join(dir, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const res = loadCaeRegistryFromSqliteDb(db, workspaceRoot, { verifyArtifactPaths: false });
    assert.equal(res.ok, false);
    assert.equal(res.code, "cae-registry-sqlite-no-active-version");
  } finally {
    db.close();
  }
});

test("loadCaeRegistryFromSqliteDb: happy path with schema-valid rows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-cae-sqlite-load-"));
  const dbPath = path.join(dir, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    insertCaeRegistryVersion(db, {
      versionId: "cae.reg.test.v1",
      createdBy: "test",
      note: "fixture",
      setActive: true
    });
    insertCaeRegistryArtifactRow(db, {
      versionId: "cae.reg.test.v1",
      artifactId: "cae.test.sqlite.artifact",
      artifactType: "policy-doc",
      path: ".ai/README.md",
      title: "Keyed AI README",
      metadataJson: JSON.stringify({ tags: ["cae", "test"] })
    });
    insertCaeRegistryActivationRow(db, {
      versionId: "cae.reg.test.v1",
      activationId: "cae.test.sqlite.activation",
      family: "do",
      priority: 1,
      lifecycleState: "active",
      scopeJson: JSON.stringify({ conditions: [{ kind: "always" }] }),
      artifactRefsJson: JSON.stringify([{ artifactId: "cae.test.sqlite.artifact" }]),
      metadataJson: JSON.stringify({ flags: { advisoryOnly: true } })
    });

    const res = loadCaeRegistryFromSqliteDb(db, workspaceRoot, { verifyArtifactPaths: true });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.artifactById.size, 1);
    assert.equal(res.value.activationById.size, 1);
    assert.ok(res.value.registryDigest.length > 0);
  } finally {
    db.close();
  }
});

test("loadCaeRegistryFromSqliteDb fails on invalid artifact metadata_json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-cae-sqlite-badmeta-"));
  const dbPath = path.join(dir, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    insertCaeRegistryVersion(db, {
      versionId: "cae.reg.badmeta",
      createdBy: "test",
      note: "fixture",
      setActive: true
    });
    insertCaeRegistryArtifactRow(db, {
      versionId: "cae.reg.badmeta",
      artifactId: "cae.badmeta.artifact",
      artifactType: "policy-doc",
      path: ".ai/README.md",
      title: "x",
      metadataJson: "NOT JSON {{{"
    });
    insertCaeRegistryActivationRow(db, {
      versionId: "cae.reg.badmeta",
      activationId: "cae.badmeta.activation",
      family: "do",
      priority: 1,
      lifecycleState: "active",
      scopeJson: JSON.stringify({ conditions: [{ kind: "always" }] }),
      artifactRefsJson: JSON.stringify([{ artifactId: "cae.badmeta.artifact" }]),
      metadataJson: "{}"
    });
    const res = loadCaeRegistryFromSqliteDb(db, workspaceRoot, { verifyArtifactPaths: false });
    assert.equal(res.ok, false);
    assert.equal(res.code, "cae-registry-sqlite-invalid-json");
  } finally {
    db.close();
  }
});

test("replaceActiveCaeRegistryFromLoaded round-trips default JSON seed", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-cae-sqlite-import-"));
  mkdirSync(path.join(dir, ".workspace-kit", "tasks"), { recursive: true });
  const dbPath = path.join(dir, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const seed = loadCaeRegistry(workspaceRoot);
    assert.equal(seed.ok, true);
    if (!seed.ok) return;
    replaceActiveCaeRegistryFromLoaded(db, {
      versionId: "cae.reg.roundtrip.test",
      createdBy: "test",
      note: "from default JSON",
      registry: seed.value
    });
    const loaded = loadCaeRegistryFromSqliteDb(db, workspaceRoot, { verifyArtifactPaths: false });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.value.artifactById.size, seed.value.artifactById.size);
    assert.equal(loaded.value.activationById.size, seed.value.activationById.size);
  } finally {
    db.close();
  }
});
