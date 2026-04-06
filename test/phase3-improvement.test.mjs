import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  approvalsModule,
  documentationModule,
  improvementModule,
  planningModule,
  resolveWorkspaceConfigWithLayers,
  taskEngineModule,
  workspaceConfigModule,
  computeHeuristicConfidence,
  HEURISTIC_1_ADMISSION_THRESHOLD,
  shouldAdmitRecommendation
} from "../dist/index.js";
import { withSqliteTaskPersistence } from "./config-test-helpers.mjs";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase3-"));
}

test("T202: heuristic confidence is deterministic and thresholded", () => {
  const a = computeHeuristicConfidence("policy_deny", { policyDenial: 0.8 });
  const b = computeHeuristicConfidence("policy_deny", { policyDenial: 0.8 });
  assert.deepEqual(a, b);
  assert.ok(shouldAdmitRecommendation(a));
  const low = computeHeuristicConfidence("transcript", { transcriptFriction: 0.1 });
  assert.equal(shouldAdmitRecommendation(low), false);
  assert.ok(low.score < HEURISTIC_1_ADMISSION_THRESHOLD);
});

test("Phase3: generate-recommendations, review-item, query-lineage", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, "agent-transcripts", "x.jsonl"),
    '{"role":"user","text":"This is broken again error"}\n',
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "policy"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "policy", "traces.jsonl"),
    `${JSON.stringify({
      schemaVersion: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      operationId: "tasks.run-transition",
      command: "run run-transition",
      actor: "a@b.c",
      allowed: false,
      rationale: "missing approval"
    })}\n`,
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig: withSqliteTaskPersistence(resolved.effective),
    resolvedActor: "tester@example.com",
    moduleRegistry: registry
  };

  const gen = await router.execute(
    "generate-recommendations",
    { transcriptsRoot: "agent-transcripts" },
    ctx
  );
  assert.equal(gen.ok, true, gen.message);
  assert.ok(gen.data?.created?.length >= 1);

  const taskId = gen.data.created[0];
  const lineage1 = await router.execute("query-lineage", { taskId }, ctx);
  assert.equal(lineage1.ok, true);
  assert.ok(lineage1.data?.byType?.rec?.length >= 1);

  const review = await router.execute(
    "review-item",
    { taskId, decision: "accept", actor: "tester@example.com" },
    ctx
  );
  assert.equal(review.ok, true, review.message);

  const lineage2 = await router.execute("query-lineage", { taskId }, ctx);
  assert.ok(lineage2.data?.events?.length >= 2);

  const review2 = await router.execute(
    "review-item",
    { taskId, decision: "accept", actor: "tester@example.com" },
    ctx
  );
  assert.equal(review2.ok, true);
  assert.equal(review2.code, "decision-idempotent");
});

test("Phase3: decline from in_progress uses decline transition", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  const now = new Date().toISOString();
  const taskId = "imp-decline-test-01";
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({
      schemaVersion: 1,
      tasks: [
        {
          id: taskId,
          status: "in_progress",
          type: "improvement",
          title: "t",
          createdAt: now,
          updatedAt: now,
          metadata: { evidenceKey: "k1" }
        }
      ],
      transitionLog: [],
      lastUpdated: now
    }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig: withSqliteTaskPersistence(resolved.effective),
    resolvedActor: "tester@example.com",
    moduleRegistry: registry
  };

  const mig = await router.execute(
    "migrate-task-persistence",
    { direction: "json-to-sqlite" },
    ctx
  );
  assert.equal(mig.ok, true, mig.message);

  const r = await router.execute("review-item", { taskId, decision: "decline" }, ctx);
  assert.equal(r.ok, true, r.message);
});

test("list-approval-queue returns in_progress improvement rows (read-only)", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  const now = new Date().toISOString();
  const taskId = "imp-list-queue-01";
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({
      schemaVersion: 1,
      tasks: [
        {
          id: taskId,
          status: "in_progress",
          type: "improvement",
          title: "queued",
          phase: "Phase 1",
          createdAt: now,
          updatedAt: now,
          metadata: { evidenceKey: "k1" }
        }
      ],
      transitionLog: [],
      lastUpdated: now
    }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig: withSqliteTaskPersistence(resolved.effective),
    resolvedActor: "tester@example.com",
    moduleRegistry: registry
  };

  const mig = await router.execute(
    "migrate-task-persistence",
    { direction: "json-to-sqlite" },
    ctx
  );
  assert.equal(mig.ok, true, mig.message);

  const q = await router.execute("list-approval-queue", {}, ctx);
  assert.equal(q.ok, true, q.message);
  assert.equal(q.code, "approval-queue-listed");
  assert.equal(q.data?.count, 1);
  assert.equal(q.data?.reviewItemQueue?.[0]?.id, taskId);
  assert.ok(Array.isArray(q.data?.operatorHints?.policyArtifacts));
});
