import assert from "node:assert/strict";
import test from "node:test";

import { buildPhaseDeliveryPreflight, evaluateDeliveryEvidence } from "../dist/index.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../dist/modules/task-engine/maintainer-delivery-policy-resolver.js";

const now = "2026-05-09T14:00:00.000Z";

const effBothProfiles = {
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
};

const v2Github = {
  schemaVersion: 2,
  mode: "github-pr",
  branchName: "feature/T-A",
  baseBranch: "release/phase-5",
  mergeSha: "abc123",
  prUrl: "https://github.com/org/repo/pull/10",
  prNumber: 10,
  checks: [{ name: "ci", conclusion: "success" }],
  validationCommands: [{ command: "pnpm run test", exitCode: 0 }]
};

const v2Local = {
  schemaVersion: 2,
  mode: "local-reviewed-merge",
  branchName: "feature/T-B",
  baseBranch: "release/phase-5",
  mergeSha: "def456",
  reviewer: "alice",
  reviewArtifactRelativePath: "reviews/T-B.md",
  checks: [{ name: "ci", conclusion: "success" }],
  validationCommands: [{ command: "pnpm run test", exitCode: 0 }]
};

function doneTask(id, metaProfile, evidence) {
  return {
    id,
    status: "completed",
    type: "execution",
    title: "Done",
    createdAt: now,
    updatedAt: now,
    phaseKey: "5",
    metadata: {
      maintainerDeliveryProfile: metaProfile,
      deliveryEvidence: evidence
    }
  };
}

test("phase-delivery-preflight accepts mixed github-pr and local-reviewed-merge evidence in one phase", () => {
  const tGithub = doneTask("T900501", "github-pr", v2Github);
  const tLocal = doneTask("T900502", "local-reviewed-merge", v2Local);
  const policyContextByTaskId = Object.fromEntries(
    [tGithub, tLocal].map((task) => {
      const { resolvedPolicy, warnings } = resolveMaintainerDeliveryPolicy({
        effectiveConfig: effBothProfiles,
        task
      });
      return [task.id, buildDeliveryEvidencePolicyContext({ resolvedPolicy, warnings })];
    })
  );
  const pre = buildPhaseDeliveryPreflight({
    tasks: [tGithub, tLocal],
    phaseKey: "5",
    includeInProgress: false,
    policyContextByTaskId
  });
  assert.equal(pre.violationCount, 0);
});

test("github-pr profile still rejects local-only evidence", () => {
  const t = doneTask("T900503", "github-pr", v2Local);
  const { resolvedPolicy, warnings } = resolveMaintainerDeliveryPolicy({
    effectiveConfig: effBothProfiles,
    task: t
  });
  const ctx = buildDeliveryEvidencePolicyContext({ resolvedPolicy, warnings });
  const r = evaluateDeliveryEvidence(t, ctx);
  assert.equal(r.satisfied, false);
  assert.ok(r.violations.some((v) => v.code === "delivery-evidence-mode-not-allowed"));
});
