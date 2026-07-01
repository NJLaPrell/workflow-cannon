import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TransitionService,
  TaskEngineError,
  TaskStore,
  SqliteDualPlanningStore,
  createDeliveryEvidenceGuard,
  createReleaseNoteSummaryGuard,
  evaluateReleaseNoteSummary
} from "../dist/index.js";

function makeTask(overrides = {}) {
  return {
    id: "T001",
    status: "in_progress",
    type: "feature",
    title: "Add dashboard board",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    archived: false,
    phaseKey: "130",
    dependsOn: [],
    ...overrides
  };
}

function deliveryEvidence() {
  return {
    schemaVersion: 1,
    branchName: "feature/T001-test",
    prUrl: "https://github.com/org/repo/pull/1",
    prNumber: 1,
    baseBranch: "release/phase-130",
    mergeSha: "abc123",
    checks: [{ name: "test", conclusion: "success" }],
    validationCommands: [{ command: "pnpm run test", exitCode: 0 }]
  };
}

async function storeWithTasks(tasks) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "rn-guard-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  for (const task of tasks) {
    store.addTask(task);
  }
  await store.save();
  return { store, workspace };
}

test("evaluateReleaseNoteSummary requires summary for user-visible feature tasks", () => {
  const evaluation = evaluateReleaseNoteSummary(
    makeTask({ summary: "Multi-agent live activity tracking" }),
    process.cwd()
  );
  assert.equal(evaluation.required, true);
  assert.equal(evaluation.satisfied, false);
  assert.equal(evaluation.violations[0]?.code, "release-note-summary-missing");
});

test("evaluateReleaseNoteSummary satisfied with releaseNoteSummary", () => {
  const evaluation = evaluateReleaseNoteSummary(
    makeTask({
      metadata: { releaseNoteSummary: "See what every agent is working on from one dashboard." }
    }),
    process.cwd()
  );
  assert.equal(evaluation.required, true);
  assert.equal(evaluation.satisfied, true);
  assert.equal(evaluation.satisfiedBy, "summary");
});

test("evaluateReleaseNoteSummary skips internal technical tasks", () => {
  const evaluation = evaluateReleaseNoteSummary(
    makeTask({
      title: "Refactor SQLite schema v39 runtime",
      summary: "workspace-kit run migrate-planning-store alongside src/modules/task-engine",
      type: "execution"
    }),
    process.cwd()
  );
  assert.equal(evaluation.required, false);
  assert.equal(evaluation.satisfiedBy, "not-required");
});

test("evaluateReleaseNoteSummary skips local-only tasks", () => {
  const evaluation = evaluateReleaseNoteSummary(
    makeTask({ metadata: { localOnly: true, releaseNoteSummary: undefined } }),
    process.cwd()
  );
  assert.equal(evaluation.required, false);
});

test("TransitionService release-note guard advisory allows complete without summary", async () => {
  const { store } = await storeWithTasks([
    makeTask({
      metadata: {
        deliveryEvidence: deliveryEvidence()
      }
    })
  ]);
  const service = new TransitionService(store, [
    createDeliveryEvidenceGuard({ enforcementMode: "enforce" }),
    createReleaseNoteSummaryGuard({ enforcementMode: "advisory", workspacePath: process.cwd() })
  ]);
  const result = await service.runTransition({ taskId: "T001", action: "complete" });
  assert.equal(result.evidence.toState, "completed");
  const guard = result.evidence.guardResults.find((r) => r.guardName === "release-note-summary");
  assert.equal(guard?.allowed, true);
  assert.equal(guard?.code, "release-note-summary-advisory");
});

test("TransitionService release-note guard enforce blocks missing summary", async () => {
  const { store } = await storeWithTasks([
    makeTask({
      metadata: {
        deliveryEvidence: deliveryEvidence()
      }
    })
  ]);
  const service = new TransitionService(store, [
    createDeliveryEvidenceGuard({ enforcementMode: "enforce" }),
    createReleaseNoteSummaryGuard({ enforcementMode: "enforce", workspacePath: process.cwd() })
  ]);
  await assert.rejects(
    () => service.runTransition({ taskId: "T001", action: "complete" }),
    (err) => err instanceof TaskEngineError && err.code === "guard-rejected"
  );
});

test("TransitionService release-note guard enforce allows explicit summary", async () => {
  const { store } = await storeWithTasks([
    makeTask({
      metadata: {
        deliveryEvidence: deliveryEvidence(),
        releaseNoteSummary: "Track live agent activity from a single dashboard."
      }
    })
  ]);
  const service = new TransitionService(store, [
    createDeliveryEvidenceGuard({ enforcementMode: "enforce" }),
    createReleaseNoteSummaryGuard({ enforcementMode: "enforce", workspacePath: process.cwd() })
  ]);
  const result = await service.runTransition({ taskId: "T001", action: "complete" });
  assert.equal(result.evidence.toState, "completed");
  assert.ok(result.evidence.guardResults.some((r) => r.code === "release-note-summary-present"));
});
