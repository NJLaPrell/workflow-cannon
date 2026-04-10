import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  activateCaeRegistryVersion,
  caeRegistryTablesReady,
  clearCaeRegistryVersionContents,
  deleteInactiveCaeRegistryVersion,
  getActiveCaeRegistryVersionId,
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  insertCaeRegistryVersion,
  listCaeRegistryActivationsForVersion,
  listCaeRegistryArtifactsForVersion,
  listCaeRegistryVersionIds
} from "../dist/core/cae/cae-kit-sqlite.js";

test("CAE registry DB helpers: version lifecycle and rows", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-cae-registry-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    assert.equal(caeRegistryTablesReady(db), true);

    insertCaeRegistryVersion(db, {
      versionId: "v-test-1",
      createdBy: "test",
      note: "seed",
      setActive: true
    });
    assert.equal(getActiveCaeRegistryVersionId(db), "v-test-1");

    insertCaeRegistryArtifactRow(db, {
      versionId: "v-test-1",
      artifactId: "cae.fixture.one",
      artifactType: "playbook",
      path: ".ai/README.md",
      title: "Fixture"
    });
    insertCaeRegistryActivationRow(db, {
      versionId: "v-test-1",
      activationId: "cae.fixture.act",
      family: "do",
      priority: 1,
      lifecycleState: "active",
      scopeJson: '{"conditions":[{"kind":"always"}]}',
      artifactRefsJson: '[{"artifactId":"cae.fixture.one"}]'
    });

    const arts = listCaeRegistryArtifactsForVersion(db, "v-test-1");
    assert.equal(arts.length, 1);
    assert.equal(arts[0].artifact_id, "cae.fixture.one");

    const acts = listCaeRegistryActivationsForVersion(db, "v-test-1");
    assert.equal(acts.length, 1);
    assert.equal(acts[0].activation_id, "cae.fixture.act");

    insertCaeRegistryVersion(db, {
      versionId: "v-test-2",
      createdBy: "test",
      setActive: false
    });
    assert.ok(listCaeRegistryVersionIds(db).includes("v-test-2"));

    assert.equal(activateCaeRegistryVersion(db, "v-test-2"), true);
    assert.equal(getActiveCaeRegistryVersionId(db), "v-test-2");

    assert.equal(activateCaeRegistryVersion(db, "v-missing"), false);

    clearCaeRegistryVersionContents(db, "v-test-1");
    assert.equal(listCaeRegistryArtifactsForVersion(db, "v-test-1").length, 0);
    assert.equal(listCaeRegistryActivationsForVersion(db, "v-test-1").length, 0);

    assert.equal(deleteInactiveCaeRegistryVersion(db, "v-test-1"), true);
    assert.equal(listCaeRegistryVersionIds(db).includes("v-test-1"), false);
    assert.equal(deleteInactiveCaeRegistryVersion(db, "v-test-2"), false);
  } finally {
    db.close();
  }
});
