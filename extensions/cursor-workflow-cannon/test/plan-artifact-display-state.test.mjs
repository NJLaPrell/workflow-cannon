import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_STATE_BUCKETS,
  bucketPlanRowsByDisplayState,
  derivePlanArtifactDisplayState,
  filterPlanArtifactRowsForRollup,
  groupPlanRowsByTitle,
  groupPlanRowsForStateBucket,
  planArtifactDisplayStateMeta,
  planArtifactEffectiveStatus,
  planArtifactRollupDisplayLabel,
  planArtifactRollupSubtitle,
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
    derivePlanArtifactDisplayState({ status: "cancelled", executed: true, tasksGenerated: true }),
    "cancelled"
  );
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

test("filterPlanArtifactRowsForRollup keeps only canonical lifecycle row per idea", () => {
  const filtered = filterPlanArtifactRowsForRollup([
    {
      planId: "accepted-plan",
      sourceIdeaId: "I011",
      title: "Agent Planning Tools",
      status: "accepted",
      tasksGenerated: true,
      executed: false,
      updatedAt: "2026-07-08T17:00:00.000Z"
    },
    {
      planId: "older-draft",
      sourceIdeaId: "I011",
      title: "Agent Planning Tools",
      status: "draft",
      updatedAt: "2026-07-08T15:00:00.000Z"
    }
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].planId, "accepted-plan");
  assert.equal(derivePlanArtifactDisplayState(filtered[0]), "scheduled");
});

test("filterPlanArtifactRowsForRollup keeps only newest draft when plan has not advanced", () => {
  const filtered = filterPlanArtifactRowsForRollup([
    {
      planId: "draft-new",
      sourceIdeaId: "I006",
      title: "Idea plan",
      status: "draft",
      updatedAt: "2026-07-08T15:55:19.690Z"
    },
    {
      planId: "draft-old",
      sourceIdeaId: "I006",
      title: "Idea plan",
      status: "draft",
      updatedAt: "2026-07-04T01:09:30.667Z"
    }
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].planId, "draft-new");
});

test("filterPlanArtifactRowsForRollup drops accepted rows superseded by delivered state", () => {
  const filtered = filterPlanArtifactRowsForRollup([
    {
      planId: "brainstorm-plan",
      sourceIdeaId: "I009",
      title: "Make brainstorming a real guided ideation session that seeds the plan",
      status: "accepted",
      tasksGenerated: true,
      executed: true,
      updatedAt: "2026-07-08T00:24:09.000Z"
    }
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(derivePlanArtifactDisplayState(filtered[0]), "delivered");
  const buckets = bucketPlanRowsByDisplayState(filtered);
  assert.equal(buckets.get("accepted")?.length ?? 0, 0);
  assert.equal(buckets.get("delivered")?.length, 1);
});

test("planArtifactRollupDisplayLabel formats as ID - Title", () => {
  assert.equal(
    planArtifactRollupDisplayLabel({ title: "Idea plan", sourceIdeaId: "I006" }),
    "I006 - Idea plan"
  );
  assert.equal(
    planArtifactRollupDisplayLabel({
      title: "Idea plan",
      sourceIdeaId: "I006",
      sourceIdeaTitle: "Merge Ideas and Planning modules"
    }),
    "I006 - Merge Ideas and Planning modules"
  );
  assert.equal(
    planArtifactRollupDisplayLabel({ title: "Agent Planning Tools v1", sourceIdeaId: "I011" }),
    "I011 - Agent Planning Tools v1"
  );
  assert.equal(
    planArtifactRollupDisplayLabel({ title: "Standalone plan" }),
    "Standalone plan"
  );
});

test("planArtifactRollupSubtitle prefers idea note over plan summary", () => {
  assert.equal(
    planArtifactRollupSubtitle({
      sourceIdeaNote: "Use CAE to cause the agent to file bug report tasks.",
      summary: "Idea plan"
    }),
    "Use CAE to cause the agent to file bug report tasks."
  );
});

test("groupPlanRowsForStateBucket keeps draft rows flat with idea labels", () => {
  const groups = groupPlanRowsForStateBucket("new", [
    { planId: "a", title: "Idea plan", sourceIdeaId: "I006", updatedAt: "2026-07-08T00:00:00.000Z" },
    { planId: "b", title: "Idea plan", sourceIdeaId: "I007", updatedAt: "2026-07-07T00:00:00.000Z" }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].titleLabel, "I006 - Idea plan");
  assert.equal(groups[1].titleLabel, "I007 - Idea plan");
  assert.equal(groups[0].rows.length, 1);
});
