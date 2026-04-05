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
