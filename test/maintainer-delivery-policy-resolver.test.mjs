import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMaintainerDeliveryPolicy,
  slugifyTaskTitle,
  parseMaintainerDeliveryPolicyConfig
} from "../dist/modules/task-engine/maintainer-delivery-policy-resolver.js";

test("slugifyTaskTitle produces stable slug", () => {
  assert.equal(slugifyTaskTitle("Task Engine: Resolve Policy!"), "task-engine-resolve-policy");
});

test("default workspace resolves github-pr phase branch flow", () => {
  const r = resolveMaintainerDeliveryPolicy({
    effectiveConfig: {},
    task: {
      id: "T100109",
      status: "in_progress",
      type: "execution",
      title: "Example Task Title",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      phaseKey: "83",
      metadata: {
        maintainerDeliveryProfile: "github-pr",
        requiresPhaseBranch: true
      }
    }
  });
  assert.equal(r.resolvedPolicy.profileName, "github-pr");
  assert.equal(r.resolvedPolicy.phaseIntegrationBranch, "release/phase-83");
  assert.match(r.resolvedPolicy.taskBranchExample ?? "", /^feature\/T100109-/);
  assert.equal(r.resolvedPolicy.reviewMode, "github-pr");
  assert.equal(r.resolvedPolicy.evidenceMode, "github-pr");
  assert.equal(r.resolvedPolicy.mergeTarget.branch, "release/phase-83");
});

test("task metadata profile wins over module override", () => {
  const r = resolveMaintainerDeliveryPolicy({
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
          "local-merge": {
            requiresPhaseBranch: false,
            branchPattern: "release/phase-{phaseKey}",
            review: "manual",
            evidenceKind: "manual"
          }
        },
        moduleOverrides: {
          "task-engine": { profile: "local-merge" }
        }
      }
    },
    task: {
      id: "T1",
      status: "ready",
      type: "execution",
      title: "T",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      phaseKey: "5",
      metadata: { maintainerDeliveryProfile: "github-pr" }
    },
    moduleId: "task-engine"
  });
  assert.equal(r.resolvedPolicy.profileName, "github-pr");
  assert.equal(r.resolvedPolicy.reviewMode, "github-pr");
});

test("prospective context expands patterns without task row", () => {
  const r = resolveMaintainerDeliveryPolicy({
    effectiveConfig: {},
    taskId: "T999",
    phaseKey: "44",
    slug: "slice-one",
    version: "0.99.0"
  });
  assert.equal(r.resolvedPolicy.phaseIntegrationBranch, "release/phase-44");
  assert.equal(r.resolvedPolicy.taskBranchExample, "feature/T999-slice-one");
  assert.equal(r.resolvedPolicy.releaseTagExample, "v0.99.0");
});

test("parseMaintainerDeliveryPolicyConfig merges defaults", () => {
  const cfg = parseMaintainerDeliveryPolicyConfig({});
  assert.ok(cfg.profiles["github-pr"]);
  assert.equal(cfg.defaultProfile, "github-pr");
});
