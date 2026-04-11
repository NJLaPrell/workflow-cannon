/**
 * CAE `doctor` summary includes SQLite registry health when kit DB exists (Phase 70 / H6).
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { collectCaeDoctorSummaryLines } from "../dist/cli/doctor-cae.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { replaceActiveCaeRegistryFromLoaded } from "../dist/core/cae/cae-registry-sqlite.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("doctor lists CAE registry SQLite summary when planning DB has registry rows", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-doctor-reg-"));
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

  const lines = await collectCaeDoctorSummaryLines(ws);
  const joined = lines.join("\n");
  assert.match(joined, /CAE registry SQLite: version_headers=\d+ active_version_id=cae\.reg\.seed audit_rows=\d+/);
  assert.match(joined, /CAE registry digest: sha256=[0-9a-f]{12}…/);
});
