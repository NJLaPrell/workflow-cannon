import test from "node:test";
import assert from "node:assert/strict";

import {
  PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT,
  buildPhaseReleaseOrchestrationState,
  classifyPhaseReleasePath
} from "../dist/modules/task-engine/phase-release-orchestration-state-runtime.js";

function verdictInput(overrides = {}) {
  return {
    phaseKey: "130",
    currentKitPhase: "130",
    gitBranch: "release/phase-130",
    releaseBranch: "release/phase-130",
    blockedCount: 0,
    nonTerminalCount: 0,
    closeoutPassed: true,
    preflightViolationCount: 0,
    rolledOut: false,
    ...overrides
  };
}

function task(id, status, opts = {}) {
  return {
    id,
    status,
    type: "execution",
    title: `Task ${id}`,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    archived: false,
    phaseKey: "130",
    dependsOn: [],
    ...opts
  };
}

test("classifyPhaseReleasePath -> ready-to-ship", () => {
  const verdict = classifyPhaseReleasePath(verdictInput());
  assert.equal(verdict, "ready-to-ship");
});

test("classifyPhaseReleasePath -> tasks-remaining", () => {
  const verdict = classifyPhaseReleasePath(verdictInput({ nonTerminalCount: 2 }));
  assert.equal(verdict, "tasks-remaining");
});

test("classifyPhaseReleasePath -> blocked", () => {
  const verdict = classifyPhaseReleasePath(verdictInput({ blockedCount: 1, nonTerminalCount: 3 }));
  assert.equal(verdict, "blocked");
});

test("classifyPhaseReleasePath -> closeout-pending", () => {
  const verdict = classifyPhaseReleasePath(
    verdictInput({ closeoutPassed: false, preflightViolationCount: 1 })
  );
  assert.equal(verdict, "closeout-pending");
});

test("classifyPhaseReleasePath -> release-running", () => {
  const verdict = classifyPhaseReleasePath(
    verdictInput({ gitBranch: "main", releaseBranch: "release/phase-130" })
  );
  assert.equal(verdict, "release-running");
});

test("classifyPhaseReleasePath -> post-release", () => {
  const verdict = classifyPhaseReleasePath(verdictInput({ rolledOut: true }));
  assert.equal(verdict, "post-release");
});

test("buildPhaseReleaseOrchestrationState is bounded and reference-first", () => {
  const tasks = [];
  for (let i = 0; i < PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT + 5; i++) {
    tasks.push(task(`T-ready-${i}`, "ready"));
    tasks.push(task(`T-blocked-${i}`, "blocked", { dependsOn: ["T-missing"] }));
  }

  const packet = buildPhaseReleaseOrchestrationState({
    workspacePath: process.cwd(),
    effectiveConfig: undefined,
    tasks,
    phaseKey: "130",
    currentKitPhase: "130",
    rolledOut: false
  });

  assert.equal(typeof packet.verdict, "string");
  assert.equal(packet.readyUnblockedTop.length <= PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT, true);
  assert.equal(packet.blockedTop.length <= PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT, true);
  assert.equal(Array.isArray(packet.refs.commands), true);
  assert.equal(Array.isArray(packet.refs.instructions), true);
  assert.equal(packet.refs.commands.length > 0, true);
  assert.equal(packet.refs.instructions.length > 0, true);
});
