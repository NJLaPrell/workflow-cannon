import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  evaluateDeliveryEvidence,
  summarizeDeliveryEvidence,
  buildPhaseDeliveryPreflight,
  buildPhaseCloseoutReadiness,
  buildStrandedWorkReport,
  DELIVERY_EVIDENCE_V2_MODES,
  createDeliveryEvidenceGuard,
  readDeliveryEvidenceEnforcementMode,
  validateDeliveryEvidenceMetadata,
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

test("validateDeliveryEvidenceMetadata returns structured invalid-evidence details", () => {
  const bad = { ...v2Github };
  delete bad.prUrl;
  const result = validateDeliveryEvidenceMetadata(bad);
  assert.equal(result.ok, false);
  assert.equal(result.code, "delivery-evidence-malformed-v2");
  assert.ok(result.missingFields.includes("deliveryEvidence.prUrl"));
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
  const r = evaluateDeliveryEvidence(t, {
    allowedEvidenceModes: ["github-pr"],
    requiredEvidenceMode: "github-pr",
    policyProfile: "github-pr",
    policyWarnings: ["profile warning"]
  });
  const violation = r.violations[0];
  assert.equal(violation?.code, "delivery-evidence-mode-not-allowed");
  assert.equal(violation?.requiredEvidenceMode, "github-pr");
  assert.equal(violation?.actualEvidenceMode, "local-reviewed-merge");
  assert.equal(violation?.policyProfile, "github-pr");
  assert.deepEqual(violation?.policyWarnings, ["profile warning"]);
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

test("buildPhaseDeliveryPreflight audits mixed policy profiles", () => {
  const tasks = [
    phasedTask({
      id: "Ta",
      status: "completed",
      metadata: { deliveryEvidence: v2Local }
    }),
    phasedTask({
      id: "Tb",
      status: "completed",
      metadata: { deliveryEvidence: v2Local }
    })
  ];
  const result = buildPhaseDeliveryPreflight({
    tasks,
    phaseKey: "81",
    includeInProgress: false,
    policyContextByTaskId: {
      Ta: {
        allowedEvidenceModes: ["local-reviewed-merge", "direct-reviewed-merge", "external-review"],
        requiredEvidenceMode: "manual",
        policyProfile: "manual-review"
      },
      Tb: {
        allowedEvidenceModes: ["github-pr"],
        requiredEvidenceMode: "github-pr",
        policyProfile: "github-pr"
      }
    }
  });

  assert.equal(result.checkedTaskCount, 2);
  assert.equal(result.violationCount, 1);
  assert.equal(result.violations[0]?.taskId, "Tb");
  assert.equal(result.violations[0]?.requiredEvidenceMode, "github-pr");
  assert.equal(result.violations[0]?.actualEvidenceMode, "local-reviewed-merge");
  assert.equal(result.violations[0]?.policyProfile, "github-pr");
});

test("buildPhaseCloseoutReadiness groups unfinished phase tasks by status", () => {
  const result = buildPhaseCloseoutReadiness({
    phaseKey: "81",
    tasks: [
      phasedTask({ id: "Tready", status: "ready", phaseKey: "81" }),
      phasedTask({ id: "Twork", status: "in_progress", phaseKey: "81" }),
      phasedTask({ id: "Tdone", status: "completed", phaseKey: "81", metadata: { deliveryEvidence: v2Github } }),
      phasedTask({ id: "Tother", status: "ready", phaseKey: "82" })
    ]
  });
  assert.equal(result.passed, false);
  assert.equal(result.remainingCount, 2);
  assert.deepEqual(result.remainingByStatus.ready?.map((task) => task.id), ["Tready"]);
  assert.deepEqual(result.remainingByStatus.in_progress?.map((task) => task.id), ["Twork"]);
});

test("delivery evidence enforcement defaults to enforce", async () => {
  assert.equal(readDeliveryEvidenceEnforcementMode({}), "enforce");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-dev2-"));
  try {
    const store = TaskStore.forJsonFile(workspace);
    await store.load();
    store.addTask(phasedTask({ status: "in_progress" }));
    await store.save();
    const service = new TransitionService(store, [createDeliveryEvidenceGuard()]);
    await assert.rejects(
      () => service.runTransition({ taskId: "T900", action: "complete" }),
      (err) => err instanceof TaskEngineError && err.code === "guard-rejected"
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("buildStrandedWorkReport maps changed files to completed task touched files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-stranded-"));
  try {
    execFileSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: workspace });
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(workspace, "one.txt"), "base\n"));
    execFileSync("git", ["add", "one.txt"], { cwd: workspace });
    execFileSync("git", ["commit", "-m", "base"], { cwd: workspace, stdio: "ignore" });
    execFileSync("git", ["branch", "release/phase-81"], { cwd: workspace });
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(workspace, "one.txt"), "changed\n"));
    execFileSync("git", ["add", "one.txt"], { cwd: workspace });
    execFileSync("git", ["commit", "-m", "task work"], { cwd: workspace, stdio: "ignore" });

    const report = buildStrandedWorkReport({
      workspacePath: workspace,
      phaseKey: "81",
      baseRef: "release/phase-81",
      tasks: [
        phasedTask({
          id: "Tdone",
          status: "completed",
          phaseKey: "81",
          metadata: { touchedFiles: ["one.txt"], deliveryEvidence: v2Github }
        })
      ]
    });
    assert.equal(report.passed, false);
    assert.equal(report.findings[0]?.code, "stranded-local-work");
    assert.equal(report.findings[0]?.taskId, "Tdone");
    assert.deepEqual(report.findings[0]?.files, ["one.txt"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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

test("DeliveryEvidenceGuard accepts local evidence when resolved policy allows manual evidence", async () => {
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
      createDeliveryEvidenceGuard({
        enforcementMode: "enforce",
        resolvePolicyContext: () => ({
          allowedEvidenceModes: ["local-reviewed-merge", "direct-reviewed-merge", "external-review"],
          requiredEvidenceMode: "manual",
          policyProfile: "manual-review"
        })
      })
    ]);
    const result = await service.runTransition({ taskId: "T900", action: "complete" });
    assert.equal(result.evidence.toState, "completed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("DeliveryEvidenceGuard rejects local evidence when resolved policy requires GitHub PR evidence", async () => {
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
      createDeliveryEvidenceGuard({
        enforcementMode: "enforce",
        resolvePolicyContext: () => ({
          allowedEvidenceModes: ["github-pr"],
          requiredEvidenceMode: "github-pr",
          policyProfile: "github-pr"
        })
      })
    ]);
    await assert.rejects(
      () => service.runTransition({ taskId: "T900", action: "complete" }),
      (err) => err instanceof TaskEngineError && err.code === "guard-rejected"
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
