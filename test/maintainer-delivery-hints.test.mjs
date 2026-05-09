import assert from "node:assert/strict";
import test from "node:test";

import { buildMaintainerDeliveryHints } from "../dist/modules/task-engine/maintainer-delivery-hints.js";

const baseTask = (overrides) => ({
  id: "T900001",
  status: "ready",
  type: "execution",
  title: "Sample delivery task",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  phaseKey: "83",
  metadata: {},
  ...overrides
});

test("buildMaintainerDeliveryHints omits resolved policy when effectiveConfig is absent", () => {
  const hints = buildMaintainerDeliveryHints({
    tasks: [baseTask({ id: "T900001" })],
    canonicalPhaseKey: "83",
    suggestedNext: { id: "T900001" }
  });
  assert.equal(hints.resolvedPolicySuggestedNext, undefined);
  assert.equal(hints.resolvedPolicyInProgress, undefined);
});

test("buildMaintainerDeliveryHints attaches github-pr compact policy for suggested next", () => {
  const hints = buildMaintainerDeliveryHints({
    tasks: [baseTask({ id: "T900001", metadata: { maintainerDeliveryProfile: "github-pr" } })],
    canonicalPhaseKey: "83",
    suggestedNext: { id: "T900001" },
    effectiveConfig: {}
  });
  assert.ok(hints.resolvedPolicySuggestedNext);
  assert.equal(hints.resolvedPolicySuggestedNext.profileName, "github-pr");
  assert.equal(hints.resolvedPolicySuggestedNext.reviewMode, "github-pr");
  assert.equal(hints.resolvedPolicySuggestedNext.evidenceMode, "github-pr");
  assert.equal(hints.resolvedPolicySuggestedNext.phaseIntegrationBranch, "release/phase-83");
  assert.match(hints.resolvedPolicySuggestedNext.taskBranchExample ?? "", /^feature\/T900001-/);
});

test("buildMaintainerDeliveryHints uses manual evidence profile when configured", () => {
  const hints = buildMaintainerDeliveryHints({
    tasks: [
      baseTask({
        id: "T900002",
        title: "Local merge task",
        metadata: { maintainerDeliveryProfile: "local-reviewed-merge" }
      })
    ],
    canonicalPhaseKey: "12",
    suggestedNext: { id: "T900002" },
    effectiveConfig: {
      maintainerDelivery: {
        defaultProfile: "github-pr",
        enforcementMode: "advisory",
        profiles: {
          "github-pr": {
            requiresPhaseBranch: true,
            branchPattern: "release/phase-{phaseKey}",
            review: "github-pr",
            evidenceKind: "github-pr"
          },
          "local-reviewed-merge": {
            requiresPhaseBranch: false,
            branchPattern: "release/phase-{phaseKey}",
            review: "manual",
            evidenceKind: "manual"
          }
        },
        moduleOverrides: {}
      }
    }
  });
  const rp = hints.resolvedPolicySuggestedNext;
  assert.ok(rp);
  assert.equal(rp.profileName, "local-reviewed-merge");
  assert.equal(rp.reviewMode, "manual");
  assert.equal(rp.evidenceMode, "manual");
  assert.equal(rp.requiresPhaseBranch, false);
});

test("buildMaintainerDeliveryHints resolves in-progress tasks when effectiveConfig is set", () => {
  const hints = buildMaintainerDeliveryHints({
    tasks: [
      baseTask({
        id: "T900010",
        status: "in_progress",
        title: "Doing work",
        phaseKey: "44",
        metadata: {}
      })
    ],
    canonicalPhaseKey: "44",
    suggestedNext: null,
    effectiveConfig: {}
  });
  assert.equal(hints.resolvedPolicySuggestedNext, null);
  assert.ok(Array.isArray(hints.resolvedPolicyInProgress));
  assert.equal(hints.resolvedPolicyInProgress.length, 1);
  assert.equal(hints.resolvedPolicyInProgress[0].id, "T900010");
  assert.equal(hints.resolvedPolicyInProgress[0].resolvedPolicy.profileName, "github-pr");
});
