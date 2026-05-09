import assert from "node:assert/strict";
import test from "node:test";

import { buildMaintainerDeliveryPolicyGuidanceTitles } from "../dist/modules/context-activation/maintainer-delivery-guidance.js";
import { resolveMaintainerDeliveryPolicy } from "../dist/modules/task-engine/maintainer-delivery-policy-resolver.js";

test("CAE policy guidance titles for default github-pr profile", () => {
  const { resolvedPolicy } = resolveMaintainerDeliveryPolicy({
    effectiveConfig: {},
    task: {
      id: "T1",
      status: "in_progress",
      type: "execution",
      title: "Do the thing",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      phaseKey: "83",
      metadata: { maintainerDeliveryProfile: "github-pr" }
    }
  });
  const titles = buildMaintainerDeliveryPolicyGuidanceTitles(resolvedPolicy);
  assert.ok(titles[0].includes("pull request"));
  assert.ok(titles[0].includes("release/phase-83"));
  assert.ok(titles.some((line) => line.includes("github-pr") || line.includes("Delivery evidence")));
});

test("CAE policy guidance titles for manual / local-reviewed-merge style profile", () => {
  const { resolvedPolicy } = resolveMaintainerDeliveryPolicy({
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
    },
    task: {
      id: "T2",
      status: "ready",
      type: "execution",
      title: "Local merge path",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      phaseKey: "5",
      metadata: { maintainerDeliveryProfile: "local-reviewed-merge" }
    }
  });
  const titles = buildMaintainerDeliveryPolicyGuidanceTitles(resolvedPolicy);
  assert.ok(titles.some((line) => line.includes("manual")));
  assert.ok(titles.some((line) => line.includes("chat-only") || line.includes("not evidence")));
});
