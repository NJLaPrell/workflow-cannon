import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateDeliveryEvidence,
  summarizeDeliveryEvidence,
  buildPhaseDeliveryPreflight,
  DELIVERY_EVIDENCE_V2_MODES,
  createDeliveryEvidenceGuard,
  TransitionService,
  TaskStore,
  TaskEngineError
} from "../dist/index.js";

const now = "2026-05-09T12:00:00.000Z";

function phasedTask(overrides = {}) {
  return {
    id: "T900",
    status: "in_progress",
    type: "execution",
    title: "Delivery evidence fixture",
    createdAt: now,
    updatedAt: now,
    phaseKey: "81",
    ...overrides
  };
}

const checksOk = [{ name: "ci", conclusion: "success" }];
const validationsOk = [{ command: "pnpm run test", exitCode: 0 }];

const v1Evidence = {
  schemaVersion: 1,
  branchName: "feature/T900",
  prUrl: "https://github.com/org/repo/pull/9",
  prNumber: 9,
  baseBranch: "release/phase-81",
  mergeSha: "deadbeef",
  checks: checksOk,
  validationCommands: validationsOk
};

const v2Github = {
  schemaVersion: 2,
  mode: "github-pr",
  branchName: "feature/T900",
  baseBranch: "release/phase-81",
  mergeSha: "abc123",
  prUrl: "https://github.com/org/repo/pull/10",
  prNumber: 10,
  checks: checksOk,
  validationCommands: validationsOk
};

const v2Local = {
  schemaVersion: 2,
  mode: "local-reviewed-merge",
  branchName: "feature/T900",
  baseBranch: "release/phase-81",
  mergeSha: "abc123",
  reviewer: "alice",
  reviewArtifactRelativePath: "reviews/T900.md",
  checks: checksOk,
  validationCommands: validationsOk
};

test("evaluateDeliveryEvidence accepts v1 GitHub PR evidence", () => {
  const t = phasedTask({ metadata: { deliveryEvidence: v1Evidence } });
  const r = evaluateDeliveryEvidence(t);
  assert.equal(r.satisfied, true);
  assert.equal(r.evidenceSchemaVersion, 1);
});

test("evaluateDeliveryEvidence accepts v2 github-pr", () => {
  const t = phasedTask({ metadata: { deliveryEvidence: v2Github } });
  const r = evaluateDeliveryEvidence(t);
  assert.equal(r.satisfied, true);
  assert.equal(r.evidenceSchemaVersion, 2);
  assert.equal(r.evidenceMode, "github-pr");
});

test("evaluateDeliveryEvidence accepts v2 local-reviewed-merge without PR fields", () => {
  const t = phasedTask({ metadata: { deliveryEvidence: v2Local } });
  const r = evaluateDeliveryEvidence(t);
  assert.equal(r.satisfied, true);
  assert.equal(r.evidenceMode, "local-reviewed-merge");
});

test("evaluateDeliveryEvidence rejects malformed v2 with field paths", () => {
  const bad = { ...v2Local };
  delete bad.reviewer;
  const t = phasedTask({ metadata: { deliveryEvidence: bad } });
  const r = evaluateDeliveryEvidence(t);
  assert.equal(r.satisfied, false);
  assert.equal(r.violations[0]?.code, "delivery-evidence-malformed-v2");
  assert.ok(r.violations[0]?.missingFields.includes("deliveryEvidence.reviewer"));
});

test("evaluateDeliveryEvidence rejects unsupported v2 mode", () => {
  const t = phasedTask({
    metadata: {
      deliveryEvidence: {
        ...v2Local,
        mode: "telepathic-merge"
      }
    }
  });
  const r = evaluateDeliveryEvidence(t);
  assert.equal(r.violations[0]?.code, "delivery-evidence-unsupported-mode");
});

test("evaluateDeliveryEvidence rejects disallowed mode when allowedEvidenceModes set", () => {
  const t = phasedTask({ metadata: { deliveryEvidence: v2Local } });
  const r = evaluateDeliveryEvidence(t, { allowedEvidenceModes: ["github-pr"] });
  assert.equal(r.violations[0]?.code, "delivery-evidence-mode-not-allowed");
});

test("summarizeDeliveryEvidence extracts schemaVersion and mode", () => {
  assert.deepEqual(summarizeDeliveryEvidence(v2Github), { schemaVersion: 2, mode: "github-pr" });
  assert.deepEqual(summarizeDeliveryEvidence(v1Evidence), { schemaVersion: 1, mode: null });
});

test("DELIVERY_EVIDENCE_V2_MODES contains expected modes", () => {
  assert.ok(DELIVERY_EVIDENCE_V2_MODES.has("github-pr"));
  assert.ok(DELIVERY_EVIDENCE_V2_MODES.has("local-reviewed-merge"));
});

test("buildPhaseDeliveryPreflight respects allowedEvidenceModesByTaskId", () => {
  const tasks = [
    phasedTask({
      id: "Ta",
      status: "completed",
      metadata: { deliveryEvidence: v2Local }
    })
  ];
  const bad = buildPhaseDeliveryPreflight({
    tasks,
    phaseKey: "81",
    includeInProgress: false,
    allowedEvidenceModesByTaskId: { Ta: ["github-pr"] }
  });
  assert.equal(bad.violationCount, 1);

  const good = buildPhaseDeliveryPreflight({
    tasks,
    phaseKey: "81",
    includeInProgress: false,
    allowedEvidenceModesByTaskId: { Ta: ["local-reviewed-merge", "github-pr"] }
  });
  assert.equal(good.violationCount, 0);
});

test("TransitionService allows complete with v2 local evidence in enforce mode", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-dev2-"));
  try {
    const task = phasedTask({
      metadata: { deliveryEvidence: v2Local }
    });
    const store = TaskStore.forJsonFile(workspace);
    await store.load();
    store.addTask(task);
    await store.save();
    const service = new TransitionService(store, [createDeliveryEvidenceGuard({ enforcementMode: "enforce" })]);
    const result = await service.runTransition({ taskId: "T900", action: "complete" });
    assert.equal(result.evidence.toState, "completed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("TransitionService blocks v2 local when only github-pr allowed", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-dev2-"));
  try {
    const task = phasedTask({
      metadata: { deliveryEvidence: v2Local }
    });
    const store = TaskStore.forJsonFile(workspace);
    await store.load();
    store.addTask(task);
    await store.save();
    const service = new TransitionService(store, [
      createDeliveryEvidenceGuard({ enforcementMode: "enforce", allowedEvidenceModes: ["github-pr"] })
    ]);
    await assert.rejects(
      () => service.runTransition({ taskId: "T900", action: "complete" }),
      (err) => err instanceof TaskEngineError && err.code === "guard-rejected"
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
