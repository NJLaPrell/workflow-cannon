import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyQueueAcceptProposedPatchToSummaryCache,
  applyQueuePhasePatchToSummaryCache,
  applyQueueTaskRemovalPatchToSummaryCache,
  lookupProposedTaskSnapshot,
  mutateSummaryForCategoryMove,
  mutateSummaryForPhaseMove,
  mutateSummaryForTaskRemoval,
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

test("phase move into new phase bucket includes toBucketShellHtml", () => {
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
          phaseKey: "141",
          count: 1,
          taskIds: ["T100744"],
          top: [{ id: "T100744", title: "New phase task", status: "ready", phaseKey: "141" }]
        }
      ]
    }
  };
  const placement = resolveQueuePlacementFromTask({
    id: "T100744",
    status: "ready",
    type: "execution"
  });
  assert.ok(placement);
  const payload = applyQueuePhasePatchToSummaryCache(data, placement, {
    taskId: "T100744",
    task: { id: "T100744", title: "New phase task", status: "ready", type: "execution", phaseKey: "141" },
    fromPhaseKey: null,
    toPhaseKey: "141"
  });
  assert.ok(payload);
  assert.ok(payload.toBucketShellHtml);
  assert.match(payload.toBucketShellHtml, /data-wc-phase-key="141"/);
  assert.match(payload.toBucketShellHtml, /T100744/);
  assert.match(payload.toBucketShellHtml, /data-wc-lazy-loaded="1"/);
});

test("register-catalog drawer skips agent-activity CLI", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const block = src.slice(
    src.indexOf('session.kind === "register-catalog"'),
    src.indexOf('session.kind === "dismiss-note"')
  );
  assert.doesNotMatch(block, /recordActivity/);
  assert.doesNotMatch(block, /clearActivity/);
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

test("accept-proposed uses cross-category queue patch when possible", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const block = src.slice(
    src.indexOf("handleAcceptProposedDrawerSubmit"),
    src.indexOf("private async handleDrawerSubmit")
  );
  assert.match(block, /tryApplyQueueAcceptProposedTargetedPatch/);
  assert.match(block, /return !patched/);
});

test("mutateSummaryForCategoryMove moves proposed execution into ready phase bucket", () => {
  const data = {
    proposedExecutionSummary: {
      count: 1,
      phaseBuckets: [
        {
          phaseKey: null,
          count: 1,
          taskIds: ["T200"],
          top: [{ id: "T200", title: "New thing", status: "proposed", type: "execution" }]
        }
      ]
    },
    readyExecutionSummary: {
      count: 1,
      phaseBuckets: [
        {
          phaseKey: "139",
          count: 1,
          taskIds: ["T100"],
          top: [{ id: "T100", title: "Existing", status: "ready", phaseKey: "139" }]
        }
      ]
    }
  };
  const fromPlacement = { summaryField: "proposedExecutionSummary", category: "proposed-execution" };
  const toPlacement = { summaryField: "readyExecutionSummary", category: "ready" };
  const ok = mutateSummaryForCategoryMove(data, fromPlacement, toPlacement, {
    taskId: "T200",
    task: { id: "T200", title: "New thing", status: "ready", type: "execution" },
    fromPhaseKey: null,
    toPhaseKey: "139"
  });
  assert.equal(ok, true);
  assert.equal(data.proposedExecutionSummary.count, 0);
  assert.equal(data.readyExecutionSummary.count, 2);
  const readyBucket = data.readyExecutionSummary.phaseBuckets.find((b) => b.phaseKey === "139");
  assert.ok(readyBucket?.taskIds?.includes("T200"));
});

test("applyQueueTaskRemovalPatchToSummaryCache builds wcQueueTaskRemoval payload", () => {
  const data = {
    proposedExecutionSummary: {
      count: 1,
      phaseBuckets: [
        {
          phaseKey: "140",
          count: 1,
          taskIds: ["T201"],
          top: [{ id: "T201", title: "Nope", status: "proposed" }]
        }
      ]
    }
  };
  const snap = lookupProposedTaskSnapshot(data, "T201");
  assert.ok(snap);
  const payload = applyQueueTaskRemovalPatchToSummaryCache(
    data,
    snap.placement,
    "T201",
    snap.phaseKey
  );
  assert.ok(payload);
  assert.equal(payload.type, "wcQueueTaskRemoval");
  assert.equal(payload.category, "proposed-execution");
  assert.equal(data.proposedExecutionSummary.count, 0);
});

test("applyQueueAcceptProposedPatchToSummaryCache builds wcQueueTaskCategoryMove payload", () => {
  const data = {
    proposedExecutionSummary: {
      count: 1,
      phaseBuckets: [
        {
          phaseKey: null,
          count: 1,
          taskIds: ["T202"],
          top: [{ id: "T202", title: "Ship it", status: "proposed", type: "execution" }]
        }
      ]
    },
    readyExecutionSummary: { count: 0, phaseBuckets: [] }
  };
  const fromPlacement = { summaryField: "proposedExecutionSummary", category: "proposed-execution" };
  const toPlacement = { summaryField: "readyExecutionSummary", category: "ready" };
  const payload = applyQueueAcceptProposedPatchToSummaryCache(data, fromPlacement, toPlacement, {
    taskId: "T202",
    task: { id: "T202", title: "Ship it", status: "ready", type: "execution" },
    fromPhaseKey: null,
    toPhaseKey: "141"
  });
  assert.ok(payload);
  assert.equal(payload.type, "wcQueueTaskCategoryMove");
  assert.equal(payload.toPhaseKey, "141");
});

test("dashboard webview handles category move and removal patch messages", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-webview-client.ts"),
    "utf8"
  );
  assert.match(src, /wcQueueTaskPhaseMove/);
  assert.match(src, /applyQueueTaskPhaseMove/);
  assert.match(src, /wcQueueTaskCategoryMove/);
  assert.match(src, /applyQueueTaskCategoryMove/);
  assert.match(src, /wcQueueTaskRemoval/);
  assert.match(src, /applyQueueTaskRemoval/);
  assert.match(src, /toBucketShellHtml/);
  assert.match(src, /insertQueueBucketShell/);
  assert.match(src, /resolveTargetQueueBucket/);
  assert.match(src, /queuePhasePatchFailed/);
});
