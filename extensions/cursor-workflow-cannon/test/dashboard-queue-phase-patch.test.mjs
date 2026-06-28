import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyQueuePhasePatchToSummaryCache,
  mutateSummaryForPhaseMove,
  resolveQueuePlacementFromTask
} from "../dist/views/dashboard/dashboard-queue-phase-patch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("resolveQueuePlacementFromTask maps ready execution tasks", () => {
  assert.deepEqual(resolveQueuePlacementFromTask({ id: "T1", status: "ready", type: "execution" }), {
    summaryField: "readyExecutionSummary",
    category: "ready"
  });
});

test("mutateSummaryForPhaseMove moves task between phase buckets", () => {
  const data = {
    readyExecutionSummary: {
      count: 2,
      phaseBuckets: [
        {
          phaseKey: "139",
          count: 1,
          taskIds: ["T100743"],
          top: [{ id: "T100743", title: "Baseline", phaseKey: "139" }]
        },
        {
          phaseKey: null,
          count: 1,
          taskIds: ["T100744"],
          top: [{ id: "T100744", title: "Other", phaseKey: null }]
        }
      ]
    }
  };
  const ok = mutateSummaryForPhaseMove(data, "readyExecutionSummary", {
    taskId: "T100743",
    task: { id: "T100743", title: "Baseline", status: "ready", type: "execution" },
    fromPhaseKey: "139",
    toPhaseKey: null
  });
  assert.equal(ok, true);
  const buckets = data.readyExecutionSummary.phaseBuckets;
  const from = buckets.find((b) => b.phaseKey === "139");
  const to = buckets.find((b) => b.phaseKey == null);
  assert.equal(from?.count, 0);
  assert.deepEqual(from?.taskIds, []);
  assert.equal(to?.count, 2);
  assert.ok(to?.taskIds?.includes("T100743"));
});

test("applyQueuePhasePatchToSummaryCache returns wcQueueTaskPhaseMove payload", () => {
  const data = {
    readyExecutionSummary: {
      count: 1,
      phaseBuckets: [
        {
          phaseKey: "139",
          count: 1,
          taskIds: ["T100743"],
          top: [{ id: "T100743", title: "Baseline", phaseKey: "139" }]
        }
      ]
    }
  };
  const placement = resolveQueuePlacementFromTask({
    id: "T100743",
    status: "ready",
    type: "execution"
  });
  assert.ok(placement);
  const payload = applyQueuePhasePatchToSummaryCache(data, placement, {
    taskId: "T100743",
    task: { id: "T100743", title: "Baseline", status: "ready", type: "execution" },
    fromPhaseKey: "139",
    toPhaseKey: null
  });
  assert.ok(payload);
  assert.equal(payload.type, "wcQueueTaskPhaseMove");
  assert.equal(payload.category, "ready");
  assert.equal(payload.fromPhaseKey, "139");
  assert.equal(payload.toPhaseKey, "");
  assert.match(payload.taskRowHtml, /T100743/);
});

test("dashboard webview handles wcQueueTaskPhaseMove patch messages", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-webview-client.ts"),
    "utf8"
  );
  assert.match(src, /wcQueueTaskPhaseMove/);
  assert.match(src, /applyQueueTaskPhaseMove/);
  assert.match(src, /queuePhasePatchFailed/);
});

test("DashboardViewProvider applies targeted queue patch after phase mutations", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(src, /tryApplyQueueTaskPhaseTargetedPatch/);
  assert.match(src, /applyQueuePhasePatchToSummaryCache/);
  assert.match(src, /return !patched/);
});

test("Set Phase drawer path skips agent-activity CLI (assign-task-phase only)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const block = src.slice(
    src.indexOf("const assignTraceId = `assign-task-phase:${taskId}:set`"),
    src.indexOf('if (session.kind === "add-phase-note")')
  );
  assert.doesNotMatch(block, /recordActivity/);
  assert.doesNotMatch(block, /clearActivity/);
  assert.match(block, /assign-task-phase/);
});
