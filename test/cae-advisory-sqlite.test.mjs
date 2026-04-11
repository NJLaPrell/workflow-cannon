/**
 * Advisory instruction surface with SQLite-backed registry (**T905**).
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { buildCaeAdvisoryInstructionSurfaceBlock } from "../dist/core/cae/cae-instruction-surface-advisory.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { replaceActiveCaeRegistryFromLoaded } from "../dist/core/cae/cae-registry-sqlite.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("buildCaeAdvisoryInstructionSurfaceBlock works with sqlite registryStore and seeded kit DB", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-advisory-"));
  await mkdir(path.join(ws, ".workspace-kit", "tasks"), { recursive: true });
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbPath = path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const seed = loadCaeRegistry(ws, { verifyArtifactPaths: false });
    assert.equal(seed.ok, true);
    if (!seed.ok) return;
    replaceActiveCaeRegistryFromLoaded(db, {
      versionId: "cae.reg.advisory.test",
      createdBy: "test",
      note: "advisory surface",
      registry: seed.value
    });
  } finally {
    db.close();
  }

  const effective = {
    kit: {
      currentPhaseNumber: 70,
      cae: {
        enabled: true,
        advisoryInstructionSurface: true,
        registryStore: "sqlite"
      }
    },
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
  };
  const block = buildCaeAdvisoryInstructionSurfaceBlock(ws, effective);
  assert.ok(block);
  assert.equal(block.advisory, true);
  assert.equal(Array.isArray(block.issues), true);
  assert.equal(block.issues.length, 0);
  assert.ok((block.summary?.policyCount ?? 0) >= 0);
});
