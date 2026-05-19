import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { IMPROVEMENT_STATE_SIDECAR_REL, loadImprovementState, saveImprovementState } from "../dist/modules/improvement/improvement-state.js";
import {
  AGENT_BEHAVIOR_STATE_SIDECAR_REL,
  loadBehaviorWorkspaceState,
  saveBehaviorWorkspaceState
} from "../dist/modules/agent-behavior/persistence.js";
import { runGetKitPersistenceMap } from "../dist/modules/task-engine/persistence/kit-persistence-map-runtime.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";
import Database from "better-sqlite3";

async function withTempWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-sidecar-migrate-"));
  const dbRel = ".workspace-kit/tasks/workspace-kit.db";
  const dbPath = path.join(dir, dbRel);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  db.close();
  try {
    await fn(dir, dbRel);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("loadImprovementState migrates sidecar to SQLite and archives JSON file", async () => {
  await withTempWorkspace(async (dir) => {
    const sidecarPath = path.join(dir, IMPROVEMENT_STATE_SIDECAR_REL);
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({
        schemaVersion: 3,
        policyTraceLineCursor: 2,
        mutationLineCursor: 0,
        transitionLogLengthCursor: 0,
        transcriptLineCursors: {},
        lastSyncRunAt: null,
        lastIngestRunAt: null,
        transcriptRetryQueue: [],
        scoutRotationHistory: []
      }),
      "utf8"
    );
    const loaded = await loadImprovementState(dir, { tasks: { persistenceBackend: "sqlite" } });
    assert.equal(loaded.policyTraceLineCursor, 2);
    await assert.rejects(() => fs.access(sidecarPath));
    await fs.access(`${sidecarPath}.migrated`);
    const again = await loadImprovementState(dir, { tasks: { persistenceBackend: "sqlite" } });
    assert.equal(again.policyTraceLineCursor, 2);
  });
});

test("saveImprovementState does not recreate improvement state.json sidecar", async () => {
  await withTempWorkspace(async (dir) => {
    await saveImprovementState(dir, {
      schemaVersion: 3,
      policyTraceLineCursor: 0,
      mutationLineCursor: 0,
      transitionLogLengthCursor: 0,
      transcriptLineCursors: {},
      lastSyncRunAt: "2026-01-01T00:00:00.000Z",
      lastIngestRunAt: null,
      transcriptRetryQueue: [],
      scoutRotationHistory: []
    });
    const sidecarPath = path.join(dir, IMPROVEMENT_STATE_SIDECAR_REL);
    await assert.rejects(() => fs.access(sidecarPath));
  });
});

test("loadImprovementState handles corrupt sidecar with empty state", async () => {
  await withTempWorkspace(async (dir) => {
    const sidecarPath = path.join(dir, IMPROVEMENT_STATE_SIDECAR_REL);
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(sidecarPath, "{not-json", "utf8");
    const loaded = await loadImprovementState(dir, { tasks: { persistenceBackend: "sqlite" } });
    assert.equal(loaded.policyTraceLineCursor, 0);
    await fs.access(`${sidecarPath}.migrated`);
  });
});

test("loadBehaviorWorkspaceState migrates agent-behavior sidecar", async () => {
  await withTempWorkspace(async (dir) => {
    const sidecarPath = path.join(dir, AGENT_BEHAVIOR_STATE_SIDECAR_REL);
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ schemaVersion: 1, activeProfileId: "custom:test", customProfiles: {} }),
      "utf8"
    );
    const ctx = { workspacePath: dir, effectiveConfig: { tasks: { persistenceBackend: "sqlite" } } };
    const loaded = await loadBehaviorWorkspaceState(ctx);
    assert.equal(loaded.activeProfileId, "custom:test");
    await assert.rejects(() => fs.access(sidecarPath));
  });
});

test("get-kit-persistence-map omits legacySidecarJsonFiles entries", () => {
  const result = runGetKitPersistenceMap({
    workspacePath: process.cwd(),
    effectiveConfig: {}
  });
  assert.equal(result.ok, true);
  const data = result.data;
  assert.equal(data.legacySidecarJsonFiles, undefined);
  assert.match(data.workspaceModuleState.note, /workspace_module_state/);
});
