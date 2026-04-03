import test from "node:test";
import assert from "node:assert/strict";

import {
  describeDropTarget,
  isTaskDragSource,
  phaseMutationAllowed,
  transitionActionForTargetStatus
} from "../dist/views/tasks/task-tree-dnd.js";

test("transitionActionForTargetStatus maps lifecycle edges", () => {
  assert.equal(transitionActionForTargetStatus("ready", "in_progress"), "start");
  assert.equal(transitionActionForTargetStatus("in_progress", "ready"), "pause");
  assert.equal(transitionActionForTargetStatus("completed", "ready"), null);
});

test("isTaskDragSource allows T### execution rows, rejects wishlist intake", () => {
  assert.equal(
    isTaskDragSource({
      kind: "task",
      task: { id: "T1", title: "x", status: "ready", type: "workspace-kit" }
    }),
    true
  );
  assert.equal(
    isTaskDragSource({
      kind: "task",
      task: { id: "T1", title: "w", status: "proposed", type: "wishlist_intake" }
    }),
    false
  );
  assert.equal(
    isTaskDragSource({
      kind: "task",
      task: { id: "imp-deadbeef", title: "i", status: "ready", type: "improvement" }
    }),
    false
  );
});

test("describeDropTarget classifies group vs phase-bucket", () => {
  const g = describeDropTarget({
    kind: "group",
    label: "Ready",
    status: "ready",
    phaseBuckets: []
  });
  assert.equal(g.kind, "status");
  assert.equal(g.status, "ready");

  const p = describeDropTarget({
    kind: "phase-bucket",
    parentSegment: "ready",
    phaseKey: "44",
    label: "Phase 44",
    tasks: []
  });
  assert.equal(p.kind, "phase");
  assert.equal(p.phaseKey, "44");
});

test("phaseMutationAllowed rejects terminal parents", () => {
  assert.equal(phaseMutationAllowed("completed"), false);
  assert.equal(phaseMutationAllowed("ready"), true);
});
