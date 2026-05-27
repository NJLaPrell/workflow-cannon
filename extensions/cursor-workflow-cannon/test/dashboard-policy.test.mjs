import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tierMod = require("../dist/policy/dashboard-policy-tier.js");
const approvalMod = require("../dist/policy/build-dashboard-policy-approval.js");

test("tier matrix has no duplicate workflowId+action keys", () => {
  const seen = new Set();
  for (const row of tierMod.DASHBOARD_POLICY_TIER_MATRIX) {
    const key = `${row.workflowId}\0${row.action}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  }
});

test("resolveDashboardPolicyTierRow returns routine accept-single", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("accept-proposed", "accept-single");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "run-transition");
});

test("resolveDashboardPolicyTierRow returns routine PlanArtifact accept", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("plan-artifact", "accept");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "accept-plan-artifact");
});

test("buildDashboardPolicyApproval auto rationale for routine path", () => {
  const out = approvalMod.buildDashboardPolicyApproval({
    channel: "dashboard",
    workflowId: "review-approval-item",
    action: "accept",
    command: "review-item",
    taskId: "T100391",
    phaseKey: "107"
  });
  assert.equal(out.confirmed, true);
  assert.match(out.rationale, /^dashboard\|/);
  assert.match(out.rationale, /workflow=review-approval-item/);
  assert.match(out.rationale, /tier=routine/);
  assert.match(out.rationale, /taskId=T100391/);
});

test("elevated path requires humanRationale", () => {
  assert.throws(
    () =>
      approvalMod.buildDashboardPolicyApproval({
        channel: "dashboard",
        workflowId: "rewind-to-checkpoint",
        action: "rewind",
        command: "rewind-to-checkpoint",
        taskId: "T1"
      }),
    /requires humanRationale/
  );
});

test("elevatedPolicyExplainerHtml includes path-specific lead", () => {
  const html = tierMod.elevatedPolicyExplainerHtml("rewind-to-checkpoint", "rewind");
  assert.ok(html);
  assert.match(html, /Destructive rewind/);
  assert.match(html, /Elevated policy path/);
});

test("elevated path merges human detail", () => {
  const out = approvalMod.buildDashboardPolicyApproval({
    channel: "dashboard",
    workflowId: "rewind-to-checkpoint",
    action: "rewind",
    command: "rewind-to-checkpoint",
    humanRationale: "Revert bad checkpoint after review"
  });
  assert.match(out.rationale, /tier=elevated/);
  assert.match(out.rationale, /detail=Revert bad checkpoint after review/);
});

test("resolveDashboardPolicyTierRow returns routine accept-batch", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("accept-proposed", "accept-batch");
  assert.ok(row);
  assert.equal(row.tier, "routine");
});

test("appendElevatedPolicyExplainer leaves routine paths unchanged", () => {
  const out = tierMod.appendElevatedPolicyExplainer("Base copy.", "accept-proposed", "accept-single");
  assert.equal(out, "Base copy.");
});

test("appendElevatedPolicyExplainer leaves batch accept routine path unchanged", () => {
  const out = tierMod.appendElevatedPolicyExplainer("Base copy.", "accept-proposed", "accept-batch");
  assert.equal(out, "Base copy.");
});
