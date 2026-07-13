import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesPath = path.join(root, ".ai", "cae", "presentation-guidance-examples.v1.json");

async function workspaceWithJsonRegistry() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-agent-presentation-cae-"));
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  db.close();
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  return ws;
}

async function loadExamples() {
  const raw = JSON.parse(await readFile(examplesPath, "utf8"));
  assert.equal(raw.schemaVersion, 1);
  assert.ok(Array.isArray(raw.examples));
  return raw.examples;
}

async function previewDraft(ws, example) {
  return contextActivationModule.onCommand(
    {
      name: "cae-guidance-preview",
      args: {
        schemaVersion: 1,
        commandName: example.previewCommandName,
        commandArgs: example.previewCommandArgs ?? {},
        currentKitPhase: example.currentKitPhase,
        evalMode: "shadow",
        draftRule: example.draftRule
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: {
        kit: { cae: { enabled: true, persistence: true, registryStore: "json", adminMutations: false } },
        tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
      }
    }
  );
}

test("agent presentation CAE examples are scoped and visible in preview overlay", async () => {
  const ws = await workspaceWithJsonRegistry();
  const examples = await loadExamples();
  assert.equal(examples.length, 3);

  for (const example of examples) {
    const result = await previewDraft(ws, example);
    assert.equal(result.ok, true, example.id);
    assert.equal(result.data.ephemeral, true, example.id);
    assert.equal(result.data.draftImpact.schemaVersion, 1, example.id);
    assert.equal(result.data.draftImpact.samples[0].sampleKind, "primary", example.id);
    assert.equal(result.data.draftImpact.samples[0].draftVisibleInOverlay, true, example.id);
    assert.equal(result.data.draftImpact.broadScopeWarnings.length, 0, example.id);
    assert.notEqual(result.data.draftImpact.activationReadiness.level, "stop_confirm", example.id);
  }
});

test("agent presentation CAE docs avoid thought-disclosure labels", async () => {
  const examplesText = await readFile(examplesPath, "utf8");
  const runbookText = await readFile(path.join(root, ".ai", "runbooks", "agent-presentation-policy.md"), "utf8");
  const combined = `${examplesText}\n${runbookText}`;

  assert.doesNotMatch(combined, /show thoughts/i);
  assert.doesNotMatch(combined, /(?:show|display|provide|include)\s+(?:private\s+)?(?:chain-of-thought|hidden deliberation|scratchpad)/i);
  assert.match(combined, /privateReasoning` to `never_disclose/);
});

test("agent presentation broad CAE override receives existing blast-radius warnings", async () => {
  const ws = await workspaceWithJsonRegistry();
  const result = await previewDraft(ws, {
    id: "presentation.broad-always-warning",
    previewCommandName: "get-next-actions",
    draftRule: {
      schemaVersion: 1,
      title: "Presentation: broad always-on override",
      family: "think",
      priority: 999,
      artifactType: "runbook",
      refPath: ".ai/runbooks/agent-presentation-policy.md",
      scopeDraft: { preset: "always" }
    }
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.draftImpact.broadScopeWarnings.length >= 1);
  assert.ok(["warning", "stop_confirm"].includes(result.data.draftImpact.activationReadiness.level));
  assert.equal(result.data.draftImpact.blastRadiusSummary.draftScopeCategory, "always_global");
});
