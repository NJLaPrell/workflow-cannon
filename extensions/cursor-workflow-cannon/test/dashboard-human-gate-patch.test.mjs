import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyQueueHumanGateResumePatchToSummaryCache,
  lookupHumanGateTaskSnapshot,
  mutateHumanGatesSummaryRemove
} from "../dist/views/dashboard/dashboard-human-gate-patch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("lookupHumanGateTaskSnapshot finds row in humanGatesSummary.top", () => {
  const data = {
    humanGatesSummary: {
      count: 1,
      top: [
        {
          id: "T500",
          title: "Needs eyes",
          status: "awaiting_review",
          phaseKey: "139"
        }
      ]
    }
  };
  const snap = lookupHumanGateTaskSnapshot(data, "T500");
  assert.ok(snap);
  assert.equal(snap.phaseKey, "139");
});

test("resume_work removes human gate row only", () => {
  const data = {
    humanGatesSummary: {
      count: 2,
      top: [
        { id: "T500", title: "A", status: "awaiting_review", phaseKey: "139" },
        { id: "T501", title: "B", status: "awaiting_review", phaseKey: "140" }
      ]
    }
  };
  const payload = applyQueueHumanGateResumePatchToSummaryCache(data, "T500", "resume_work");
  assert.ok(payload);
  assert.equal(payload.type, "wcQueueHumanGateResume");
  assert.equal(payload.humanGateCount, 1);
  assert.equal(payload.readyMove, undefined);
  assert.equal((data.humanGatesSummary).count, 1);
});

test("resume_ready removes human gate and inserts into ready bucket", () => {
  const data = {
    humanGatesSummary: {
      count: 1,
      top: [{ id: "T600", title: "Gate task", status: "awaiting_review", phaseKey: "141" }]
    },
    readyExecutionSummary: {
      count: 0,
      phaseBuckets: []
    }
  };
  const payload = applyQueueHumanGateResumePatchToSummaryCache(data, "T600", "resume_ready");
  assert.ok(payload);
  assert.equal(payload.humanGateCount, 0);
  assert.ok(payload.readyMove);
  assert.equal(payload.readyMove.toPhaseKey, "141");
  assert.match(payload.readyMove.taskRowHtml, /T600/);
  assert.equal(data.readyExecutionSummary.count, 1);
  const bucket = data.readyExecutionSummary.phaseBuckets.find((b) => b.phaseKey === "141");
  assert.ok(bucket?.taskIds?.includes("T600"));
});

test("DashboardViewProvider wires human-gate transition patch", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(src, /applyQueueHumanGateResumePatchToSummaryCache/);
  assert.match(src, /resume_ready/);
  assert.match(src, /resume_work/);
});

test("webview handles wcQueueHumanGateResume and sorted bucket insert", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-webview-client.ts"),
    "utf8"
  );
  assert.match(src, /wcQueueHumanGateResume/);
  assert.match(src, /applyQueueHumanGateResume/);
  assert.match(src, /insertBucketSortedInStack/);
  assert.match(src, /updateHumanGateSectionMeta/);
});
