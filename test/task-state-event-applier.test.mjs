import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateTaskStateEvent } from "../dist/modules/task-engine/task-state-events/validate-event.js";
import {
  applyTaskStateEvent,
  createEmptyTaskStateProjection,
  materializeTaskStoreDocument,
  replayTaskStateEvents
} from "../dist/modules/task-engine/task-state-events/event-applier.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

function loadValidatedEvents(fileName) {
  const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, fileName), "utf8"));
  const events = Array.isArray(raw) ? raw : [raw];
  return events.map((event) => {
    const result = validateTaskStateEvent(event);
    assert.equal(result.ok, true, fileName);
    return result.data;
  });
}

test("replay fixture stream yields stable document and task versions", () => {
  const events = loadValidatedEvents("replay-stream-lifecycle.v1.json");
  const first = replayTaskStateEvents(events);
  assert.equal(first.ok, true);
  const second = replayTaskStateEvents(events);
  assert.equal(second.ok, true);
  assert.deepEqual(first.result.document, second.result.document);
  assert.deepEqual(first.result.projection.taskVersions, second.result.projection.taskVersions);

  const doc = first.result.document;
  assert.equal(doc.tasks.length, 1);
  assert.equal(doc.tasks[0].id, "T100509");
  assert.equal(doc.tasks[0].status, "in_progress");
  assert.equal(doc.tasks[0].summary, "Stable replay summary");
  assert.equal(doc.transitionLog.length, 2);
  assert.equal(doc.mutationLog.length, 2);
  assert.equal(first.result.projection.taskVersions.length, 4);
  assert.equal(first.result.projection.taskVersions.at(-1)?.version, 4);
});

test("materializeTaskStoreDocument sorts tasks by numeric id", () => {
  const projection = createEmptyTaskStateProjection();
  projection.tasksById.T100510 = {
    id: "T100510",
    status: "ready",
    type: "workspace-kit",
    title: "B",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  projection.tasksById.T100509 = {
    id: "T100509",
    status: "ready",
    type: "workspace-kit",
    title: "A",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const doc = materializeTaskStoreDocument(projection);
  assert.deepEqual(
    doc.tasks.map((t) => t.id),
    ["T100509", "T100510"]
  );
});

test("applyTaskStateEvent rejects out-of-order sequence", () => {
  const [created] = loadValidatedEvents("golden-task-created.v1.json");
  let projection = createEmptyTaskStateProjection();
  const ok = applyTaskStateEvent(projection, created);
  assert.equal(ok.ok, true);
  projection = ok.projection;
  const bad = applyTaskStateEvent(projection, { ...created, sequence: 1, eventId: "dup" });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "event-order-violation");
});

test("transitioned without prior create fails task-not-found", () => {
  const [transitioned] = loadValidatedEvents("golden-task-transitioned.v1.json");
  const projection = createEmptyTaskStateProjection();
  const result = applyTaskStateEvent(projection, transitioned, { enforceSequence: false });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "task-not-found");
});

test("task.updated with changedFields metadata replaces metadata map", () => {
  const [created] = loadValidatedEvents("golden-task-created.v1.json");
  let projection = createEmptyTaskStateProjection();
  const createdResult = applyTaskStateEvent(projection, created, { enforceSequence: false });
  assert.equal(createdResult.ok, true);
  projection = createdResult.projection;

  const addEvidence = {
    ...created,
    sequence: 2,
    eventId: "evt-add-evidence",
    kind: "task.updated",
    payload: {
      taskId: created.payload.taskId,
      changedFields: ["metadata"],
      values: {
        metadata: {
          deliveryEvidence: { schemaVersion: 2, mode: "github-pr" },
          planRef: "plan-artifact:demo"
        }
      }
    }
  };
  const addResult = applyTaskStateEvent(projection, addEvidence, { enforceSequence: false });
  assert.equal(addResult.ok, true);
  projection = addResult.projection;
  assert.ok(projection.tasksById[created.payload.taskId].metadata?.deliveryEvidence);

  const replaceMetadata = {
    ...addEvidence,
    sequence: 3,
    eventId: "evt-replace-metadata",
    payload: {
      taskId: created.payload.taskId,
      changedFields: ["metadata"],
      values: {
        metadata: {
          deliveryWaiver: { schemaVersion: 1, actor: "maintainer@example.com" },
          planRef: "plan-artifact:demo"
        }
      }
    }
  };
  const replaceResult = applyTaskStateEvent(projection, replaceMetadata, { enforceSequence: false });
  assert.equal(replaceResult.ok, true);
  const metadata = replaceResult.projection.tasksById[created.payload.taskId].metadata ?? {};
  assert.equal(metadata.deliveryEvidence, undefined);
  assert.ok(metadata.deliveryWaiver);
  assert.equal(metadata.planRef, "plan-artifact:demo");
});
