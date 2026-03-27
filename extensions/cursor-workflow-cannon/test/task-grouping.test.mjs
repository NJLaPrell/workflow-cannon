import test from "node:test";
import assert from "node:assert/strict";

import { groupTasksByStatus } from "../dist/views/tasks/grouping.js";

test("groupTasksByStatus orders groups by canonical status order", () => {
  const groups = groupTasksByStatus([
    { id: "T2", title: "Done", status: "completed" },
    { id: "T1", title: "Ready", status: "ready" },
    { id: "T3", title: "Blocked", status: "blocked" }
  ]);
  assert.deepEqual(
    groups.map((g) => g.status),
    ["ready", "blocked", "completed"]
  );
});
