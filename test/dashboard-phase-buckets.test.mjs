import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardPhaseBucketsForTasks } from "../dist/modules/task-engine/dashboard/dashboard-phase-buckets.js";

test("dashboard phase buckets omit empty current/next roadmap slots", () => {
  const workspaceStatus = { currentKitPhase: "58", nextKitPhase: "59" };
  const tasks = [
    {
      id: "T1",
      status: "ready",
      type: "improvement",
      phase: "Phase 29 — backlog",
      phaseKey: undefined
    }
  ];
  const buckets = buildDashboardPhaseBucketsForTasks(
    tasks,
    workspaceStatus,
    (t) => ({ id: t.id }),
    5
  );
  const labels = buckets.map((b) => b.label);
  assert.ok(!labels.some((l) => l.includes("Phase 58")), labels.join(" | "));
  assert.ok(!labels.some((l) => l.includes("Phase 59")), labels.join(" | "));
  assert.ok(labels.some((l) => l.includes("Phase 29")), labels.join(" | "));
});

test("dashboard phase buckets includeAllTaskIds lists every id when top is capped", () => {
  const workspaceStatus = { currentKitPhase: "1", nextKitPhase: "2" };
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    id: `T${String(i + 1).padStart(3, "0")}`,
    status: "proposed",
    type: "workspace-kit",
    phase: "Phase 1",
    phaseKey: "1"
  }));
  const buckets = buildDashboardPhaseBucketsForTasks(
    tasks,
    workspaceStatus,
    (t) => ({ id: t.id, title: t.id }),
    3,
    { includeAllTaskIds: true }
  );
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].count, 20);
  assert.equal(buckets[0].top.length, 3);
  assert.ok(Array.isArray(buckets[0].taskIds));
  assert.equal(buckets[0].taskIds.length, 20);
  assert.ok(buckets[0].taskIds.includes("T001"));
  assert.ok(buckets[0].taskIds.includes("T020"));
});
