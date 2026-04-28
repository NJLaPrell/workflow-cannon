/**
 * Guidance draft-rule impact preview (cae-guidance-preview + draftRule overlay).
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function tmpWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "wk-cae-draft-impact-"));
}

async function workspaceWithPlanningDb() {
  const ws = await tmpWorkspace();
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  db.close();
  return ws;
}

async function workspaceWithJsonRegistry() {
  const ws = await workspaceWithPlanningDb();
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  return ws;
}

async function runCae(ws, name, args, effectiveConfig) {
  return contextActivationModule.onCommand(
    { name, args },
    { runtimeVersion: "0.1", workspacePath: ws, effectiveConfig }
  );
}

test("cae-guidance-preview draftRule produces draftImpact matrix without registry writes", async () => {
  const ws = await workspaceWithJsonRegistry();
  const res = await runCae(
    ws,
    "cae-guidance-preview",
    {
      schemaVersion: 1,
      commandName: "get-next-actions",
      evalMode: "shadow",
      draftRule: {
        schemaVersion: 1,
        title: "Preview draft notebook",
        family: "think",
        priority: 800,
        scopeDraft: { preset: "workflow", workflowName: "get-next-actions" }
      }
    },
    {
      kit: {
        cae: {
          enabled: true,
          persistence: true,
          registryStore: "json",
          adminMutations: false
        }
      },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.ephemeral, true, "draft impact skips durable traces");
  const di = res.data.draftImpact;
  assert.ok(di, "draftImpact envelope");
  assert.equal(di.schemaVersion, 1);
  assert.ok(Array.isArray(di.samples) && di.samples.length >= 1);
  assert.ok(di.samples.some((row) => row.schemaVersion === 1));
  assert.equal(di.blastRadiusSummary.schemaVersion, 1);
  assert.ok(typeof di.blastRadiusSummary.draftScopeCategory === "string");
  assert.equal(di.activationReadiness.schemaVersion, 1);
  assert.ok(["ok", "warning", "stop_confirm"].includes(di.activationReadiness.level));
  assert.ok(Array.isArray(di.activationReadiness.reasons) && di.activationReadiness.reasons.length >= 1);
});

test("cae-guidance-preview always preset surfaces broad-scope warning metadata", async () => {
  const ws = await workspaceWithJsonRegistry();
  const res = await runCae(
    ws,
    "cae-guidance-preview",
    {
      schemaVersion: 1,
      commandName: "get-next-actions",
      evalMode: "shadow",
      draftRule: {
        schemaVersion: 1,
        title: "Always draft",
        family: "policy",
        priority: 900,
        scopeDraft: { preset: "always" }
      }
    },
    {
      kit: { cae: { enabled: true, persistence: true, registryStore: "json" } },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    }
  );
  assert.equal(res.ok, true);
  const di = res.data.draftImpact;
  assert.ok(di);
  assert.ok(Array.isArray(di.broadScopeWarnings) && di.broadScopeWarnings.length >= 1);
  assert.equal(di.activationReadiness.level, "stop_confirm");
  assert.ok(String(di.blastRadiusSummary.draftScopeCategory).includes("always"));
});
