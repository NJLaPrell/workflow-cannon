import assert from "node:assert/strict";
import test from "node:test";

import { buildPhaseReleaseState } from "../dist/modules/task-engine/phase-release-state-runtime.js";

function task(id, status = "completed", overrides = {}) {
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
    metadata: {
      deliveryEvidence: {
        schemaVersion: 1,
        branchName: `feature/${id}`,
        prUrl: `https://example.test/${id}`,
        prNumber: 1,
        baseBranch: "release/phase-130",
        mergeSha: "a".repeat(40),
        checks: [{ name: "test", conclusion: "success" }],
        validationCommands: [{ command: "pnpm run build", exitCode: 0 }]
      }
    },
    ...overrides
  };
}

test("buildPhaseReleaseState permits completed phase on release branch", () => {
  const packet = buildPhaseReleaseState({
    workspacePath: process.cwd(),
    effectiveConfig: undefined,
    tasks: [task("T9100"), task("T9101", "completed", { type: "improvement" })],
    phaseKey: "130",
    currentKitPhase: "130",
    planningGeneration: 77,
    gitBranch: "release/phase-130"
  });

  assert.equal(packet.packetKind, "phaseReleaseState");
  assert.equal(packet.completedExecutionTaskCount, 1);
  assert.equal(packet.canProceedToRelease, true);
  assert.equal(packet.publishSafety.safeToPublish, true);
  assert.deepEqual(packet.missingRequirements, []);
  assert.equal(packet.refs.nextRef.command, "prepare-release-artifacts");
  assert.equal(packet.planningGeneration, 77);
});

test("buildPhaseReleaseState reports compact missing requirements", () => {
  const packet = buildPhaseReleaseState({
    workspacePath: process.cwd(),
    effectiveConfig: undefined,
    tasks: [
      task("T9200", "ready", { title: "Ready work" }),
      task("T9201", "completed", { metadata: {} })
    ],
    phaseKey: "130",
    currentKitPhase: "130",
    planningGeneration: 78,
    gitBranch: "feature/not-release"
  });

  assert.equal(packet.canProceedToRelease, false);
  assert.equal(packet.publishSafety.status, "blocked");
  assert.ok(packet.missingRequirements.length > 0);
  assert.ok(packet.missingRequirements.length <= 10);
  assert.ok(packet.missingRequirements.some((requirement) => requirement.code === "task-not-terminal"));
  assert.ok(packet.missingRequirements.some((requirement) => requirement.ref.command === "phase-closeout-readiness"));
  assert.equal(packet.refs.nextRef.command, "phase-closeout-readiness");
});
