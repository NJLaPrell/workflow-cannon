import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskTreeRootsFromTasks,
  effectiveTaskType,
  inferTreeTaskPhaseKey,
  isActiveImprovementForTree,
  isImprovementLikeForTree,
  isWishlistIntakeOpenForTree
} from "../dist/views/tasks/build-task-tree.js";

function tasksUnderGroup(g) {
  return g.phaseBuckets.flatMap((b) => b.tasks);
}

test("effectiveTaskType infers wishlist_intake from legacyWishlistId when type missing", () => {
  assert.equal(
    effectiveTaskType({
      id: "T999",
      title: "x",
      status: "proposed",
      metadata: { legacyWishlistId: "W12" }
    }),
    "wishlist_intake"
  );
});

test("isWishlistIntakeOpenForTree is true for non-terminal intake", () => {
  assert.equal(
    isWishlistIntakeOpenForTree({
      id: "T1",
      title: "w",
      status: "ready",
      type: "wishlist_intake"
    }),
    true
  );
  assert.equal(
    isWishlistIntakeOpenForTree({
      id: "T1",
      title: "w",
      status: "completed",
      type: "wishlist_intake"
    }),
    false
  );
});

test("isImprovementLikeForTree treats imp-* as improvement even when type is missing", () => {
  assert.equal(
    isImprovementLikeForTree({
      id: "imp-abc0123456789a",
      title: "x",
      status: "ready"
    }),
    true
  );
  assert.equal(
    isImprovementLikeForTree({
      id: "T500",
      title: "x",
      status: "ready",
      type: "improvement"
    }),
    true
  );
  assert.equal(
    isImprovementLikeForTree({
      id: "T500",
      title: "x",
      status: "ready",
      type: "workspace-kit"
    }),
    false
  );
});

test("isActiveImprovementForTree is true only for proposed (triage); ready uses status groups", () => {
  assert.equal(
    isActiveImprovementForTree({
      id: "T388",
      title: "x",
      status: "proposed",
      type: "improvement"
    }),
    true
  );
  assert.equal(
    isActiveImprovementForTree({
      id: "imp-1",
      title: "x",
      status: "ready",
      type: "improvement"
    }),
    false
  );
  assert.equal(
    isActiveImprovementForTree({
      id: "imp-2",
      title: "x",
      status: "in_progress",
      type: "improvement"
    }),
    false
  );
  assert.equal(
    isActiveImprovementForTree({
      id: "T1",
      title: "x",
      status: "completed",
      type: "improvement"
    }),
    false
  );
});

test("buildTaskTreeRootsFromTasks adds improvement group and status groups without duplicates", () => {
  const roots = buildTaskTreeRootsFromTasks([
    { id: "T388", title: "Imp", status: "proposed", type: "improvement" },
    { id: "T390", title: "Kit", status: "proposed", type: "workspace-kit" },
    {
      id: "T500",
      title: "Wish",
      status: "proposed",
      type: "wishlist_intake",
      metadata: {}
    }
  ]);
  assert.equal(roots.length, 3);
  assert.equal(roots[0].kind, "wishlist-group");
  assert.equal(roots[1].kind, "improvement-group");
  assert.equal(tasksUnderGroup(roots[1]).length, 1);
  assert.equal(roots[2].kind, "group");
  assert.equal(roots[2].status, "proposed");
  assert.equal(tasksUnderGroup(roots[2]).length, 1);
  assert.equal(tasksUnderGroup(roots[2])[0].id, "T390");
});

test("buildTaskTreeRootsFromTasks puts ready improvements under ready group, not Improvements", () => {
  const roots = buildTaskTreeRootsFromTasks([
    { id: "imp-a", title: "Triage", status: "proposed", type: "improvement" },
    { id: "imp-b", title: "Do me", status: "ready", type: "improvement" },
    { id: "T390", title: "Kit", status: "ready", type: "workspace-kit" }
  ]);
  const impGroup = roots.find((r) => r.kind === "improvement-group");
  assert.ok(impGroup);
  assert.equal(tasksUnderGroup(impGroup).length, 1);
  assert.equal(tasksUnderGroup(impGroup)[0].id, "imp-a");
  const readyGroup = roots.find((r) => r.kind === "group" && r.status === "ready");
  assert.ok(readyGroup);
  assert.equal(tasksUnderGroup(readyGroup).length, 2);
  const readyIds = new Set(tasksUnderGroup(readyGroup).map((t) => t.id));
  assert.ok(readyIds.has("imp-b"));
  assert.ok(readyIds.has("T390"));
});

test("buildTaskTreeRootsFromTasks puts imp-* ready tasks in ready group when type is omitted", () => {
  const roots = buildTaskTreeRootsFromTasks([
    { id: "imp-deadbeefcafe42", title: "No type field", status: "ready" },
    { id: "T390", title: "Kit", status: "ready", type: "workspace-kit" }
  ]);
  assert.equal(
    roots.find((r) => r.kind === "improvement-group"),
    undefined
  );
  const readyGroup = roots.find((r) => r.kind === "group" && r.status === "ready");
  assert.ok(readyGroup);
  assert.equal(tasksUnderGroup(readyGroup).length, 2);
});

test("inferTreeTaskPhaseKey prefers phaseKey then parses phase text", () => {
  assert.equal(inferTreeTaskPhaseKey({ phaseKey: "34", phase: "Phase 99 (x)" }), "34");
  assert.equal(inferTreeTaskPhaseKey({ phase: "Phase 28 (foo)" }), "28");
  assert.equal(inferTreeTaskPhaseKey({ phase: "36 remainder" }), "36");
  assert.equal(inferTreeTaskPhaseKey({}), null);
});

test("phase buckets order current, next, other keys, then Not Phased", () => {
  const roots = buildTaskTreeRootsFromTasks(
    [
      { id: "A", title: "a", status: "ready", phaseKey: "36" },
      { id: "B", title: "b", status: "ready", phaseKey: "34" },
      { id: "C", title: "c", status: "ready" },
      { id: "D", title: "d", status: "ready", phaseKey: "35" }
    ],
    { currentKitPhase: "34", nextKitPhase: "35" }
  );
  const ready = roots.find((r) => r.kind === "group" && r.status === "ready");
  assert.ok(ready);
  const labels = ready.phaseBuckets.map((b) => b.label);
  assert.ok(labels[0].includes("(current)"));
  assert.ok(labels[1].includes("(next)"));
  assert.equal(ready.phaseBuckets[2].phaseKey, "36");
  assert.equal(ready.phaseBuckets[3].phaseKey, null);
  assert.equal(ready.phaseBuckets[3].tasks.length, 1);
  assert.equal(ready.phaseBuckets[3].tasks[0].id, "C");
});
