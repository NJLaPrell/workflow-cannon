import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_STATE_BUCKETS,
  bucketPlanRowsByDisplayState,
  derivePlanArtifactDisplayState,
  groupPlanRowsByTitle,
  planArtifactDisplayStateMeta,
  planArtifactEffectiveStatus,
  planTitleSlug
} from "../dist/views/dashboard/plan-artifact-display-state.js";

test("planArtifactEffectiveStatus maps reviewed with blockers to needs_revision", () => {
  assert.equal(
    planArtifactEffectiveStatus({ status: "reviewed", blockerCount: 1 }),
    "needs_revision"
  );
  assert.equal(
    planArtifactEffectiveStatus({ status: "reviewed", blockerCount: 0 }),
    "approval_ready"
  );
});

test("derivePlanArtifactDisplayState follows planning to execution progression", () => {
  assert.equal(derivePlanArtifactDisplayState({ status: "draft" }), "new");
  assert.equal(
    derivePlanArtifactDisplayState({ lifecycleStatus: "needs_revision" }),
    "needs_revision"
  );
  assert.equal(
    derivePlanArtifactDisplayState({ lifecycleStatus: "approval_ready" }),
    "reviewed"
  );
  assert.equal(derivePlanArtifactDisplayState({ status: "accepted" }), "accepted");
  assert.equal(derivePlanArtifactDisplayState({ status: "finalized" }), "finalized");
  assert.equal(
    derivePlanArtifactDisplayState({ status: "finalized", tasksGenerated: true, executed: false }),
    "scheduled"
  );
  assert.equal(
    derivePlanArtifactDisplayState({ status: "finalized", tasksGenerated: true, executed: true }),
    "delivered"
  );
  assert.equal(derivePlanArtifactDisplayState({ status: "superseded" }), "superseded");
});

test("delivered wins over scheduled when executed is true", () => {
  assert.equal(
    derivePlanArtifactDisplayState({
      status: "accepted",
      tasksGenerated: true,
      executed: true
    }),
    "delivered"
  );
});

test("planArtifactDisplayStateMeta returns user-facing labels", () => {
  assert.equal(planArtifactDisplayStateMeta("new").label, "Draft");
  assert.equal(planArtifactDisplayStateMeta("reviewed").label, "Reviewed");
  assert.equal(planArtifactDisplayStateMeta("scheduled").label, "Scheduled");
  assert.equal(planArtifactDisplayStateMeta("delivered").label, "Delivered");
});

test("groupPlanRowsByTitle sorts groups alphabetically and rows by updatedAt desc", () => {
  const groups = groupPlanRowsByTitle([
    { planId: "b", title: "Beta", updatedAt: "2026-01-02" },
    { planId: "a", title: "Alpha", updatedAt: "2026-01-03" },
    { planId: "a2", title: "Alpha", updatedAt: "2026-01-04" }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].titleLabel, "Alpha");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[0].rows[0].planId, "a2");
  assert.equal(groups[1].titleLabel, "Beta");
});

test("bucketPlanRowsByDisplayState assigns rows to lifecycle buckets", () => {
  const buckets = bucketPlanRowsByDisplayState([
    { status: "draft", planId: "1" },
    { lifecycleStatus: "approval_ready", planId: "2" },
    { status: "finalized", tasksGenerated: true, executed: false, planId: "3" }
  ]);
  assert.equal(buckets.get("new")?.length, 1);
  assert.equal(buckets.get("reviewed")?.length, 1);
  assert.equal(buckets.get("scheduled")?.length, 1);
});

test("PLAN_STATE_BUCKETS default open states match spec", () => {
  const openKeys = PLAN_STATE_BUCKETS.filter((b) => b.defaultOpen).map((b) => b.key);
  assert.deepEqual(openKeys, ["new", "reviewed", "accepted", "finalized"]);
});

test("planTitleSlug produces stable ascii keys", () => {
  assert.equal(planTitleSlug("Phase Work Tree Diagram"), "phase-work-tree-diagram");
  assert.equal(planTitleSlug("   "), "untitled");
});
