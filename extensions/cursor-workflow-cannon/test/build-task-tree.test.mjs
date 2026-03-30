import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskTreeRootsFromTasks,
  effectiveTaskType,
  isActiveImprovementForTree,
  isWishlistIntakeOpenForTree
} from "../dist/views/tasks/build-task-tree.js";

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

test("isActiveImprovementForTree excludes completed/cancelled", () => {
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
  assert.equal(roots[1].tasks.length, 1);
  assert.equal(roots[2].kind, "group");
  assert.equal(roots[2].status, "proposed");
  assert.equal(roots[2].tasks.length, 1);
  assert.equal(roots[2].tasks[0].id, "T390");
});
