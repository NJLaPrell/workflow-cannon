import test from "node:test";
import assert from "node:assert/strict";

import { groupTasksByStatus } from "../dist/views/tasks/grouping.js";

test("groupTasksByStatus orders groups by canonical status order", () => {
  const groups = groupTasksByStatus([
    { id: "T2", title: "Done", status: "completed" },
    { id: "T1", title: "Ready", status: "ready" },
    { id: "T3", title: "Blocked", status: "blocked" },
    { id: "T4", title: "Proposed", status: "proposed" },
    { id: "T5", title: "Research", status: "research" }
  ]);
  assert.deepEqual(
    groups.map((g) => g.status),
    ["ready", "proposed", "research", "blocked", "completed"]
  );
});

test("groupTasksByStatus appends non-canonical statuses after known order", () => {
  const groups = groupTasksByStatus([
    { id: "T1", title: "Odd", status: "weird_status" },
    { id: "T2", title: "Ready", status: "ready" }
  ]);
  assert.deepEqual(
    groups.map((g) => g.status),
    ["ready", "weird_status"]
  );
  assert.equal(groups[1].tasks.length, 1);
});
