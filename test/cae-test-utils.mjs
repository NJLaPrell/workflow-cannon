import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { replaceActiveCaeRegistryFromLoaded } from "../dist/core/cae/cae-registry-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function seededCaeEffective(overrides = {}) {
  return {
    kit: {
      ...overrides.kit,
      cae: {
        enabled: true,
        registryStore: "sqlite",
        ...overrides.cae
      }
    },
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
    ...overrides.rest
  };
}

export async function workspaceWithSeededCaeRegistry(prefix = "wk-cae-") {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), prefix));
  await cp(path.join(root, ".ai"), path.join(workspacePath, ".ai"), { recursive: true });

  const dbDir = path.join(workspacePath, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const loaded = loadCaeRegistry(workspacePath, { verifyArtifactPaths: true });
    assert.equal(loaded.ok, true);
    replaceActiveCaeRegistryFromLoaded(db, {
      versionId: "cae.reg.seed",
      createdBy: "test",
      note: "seed",
      registry: loaded.value
    });
  } finally {
    db.close();
  }
  return workspacePath;
}