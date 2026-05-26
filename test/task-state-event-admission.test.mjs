import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { admitTaskStateEvent, admitTaskStateEventStream } from "../dist/modules/task-engine/task-state-events/event-admission.js";
import { TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION } from "../dist/modules/task-engine/task-state-events/event-admission-policy.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

test("rejects unknown event kind before schema merge noise", () => {
  const base = loadJson("golden-task-created.v1.json");
  const result = admitTaskStateEvent({ ...base, kind: "task.deleted" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unknown-event-kind");
});

test("rejects unsupported schema version", () => {
  const base = loadJson("golden-task-created.v1.json");
  const result = admitTaskStateEvent({ ...base, schemaVersion: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported-schema-version");
});

test("supported schema version constant matches envelope v1", () => {
  assert.equal(TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION, 1);
});

test("rejects duplicate clientMutationId in prior stream", () => {
  const stream = loadJson("replay-stream-lifecycle.v1.json");
  const priorEvents = [];
  for (const raw of stream) {
    const step = admitTaskStateEvent(raw, { priorEvents });
    assert.equal(step.ok, true);
    priorEvents.push(step.event);
  }
  const base = {
    schemaVersion: 1,
    eventId: "tse.dup-idem.first",
    sequence: 50,
    parentEventId: "tse.replay.0004.start",
    recordedAt: "2026-05-26T22:00:00.000Z",
    actor: { id: "maintainer@example.com", source: "explicit" },
    clientMutationId: "shared-update-key",
    command: { name: "update-task", moduleId: "task-engine" },
    kind: "task.updated",
    payload: {
      taskId: "T100509",
      changedFields: ["summary"],
      values: { summary: "first" }
    }
  };
  const duplicate = {
    ...base,
    eventId: "tse.dup-idem.second",
    sequence: 51,
    parentEventId: base.eventId
  };
  const firstAdmit = admitTaskStateEvent(base, { priorEvents });
  assert.equal(firstAdmit.ok, true);
  const secondAdmit = admitTaskStateEvent(duplicate, { priorEvents: [...priorEvents, firstAdmit.event] });
  assert.equal(secondAdmit.ok, false);
  assert.equal(secondAdmit.error.code, "duplicate-idempotency-key");
});

test("rejects invalid lifecycle transition against replayed state", () => {
  const stream = loadJson("replay-stream-lifecycle.v1.json");
  const priorEvents = [];
  for (const raw of stream) {
    const step = admitTaskStateEvent(raw, { priorEvents });
    assert.equal(step.ok, true);
    priorEvents.push(step.event);
  }

  const badTransition = {
    schemaVersion: 1,
    eventId: "tse.replay.bad-transition",
    sequence: 99,
    parentEventId: "tse.replay.0004.start",
    recordedAt: "2026-05-26T22:00:00.000Z",
    actor: { id: "maintainer@example.com", source: "explicit" },
    command: { name: "run-transition", moduleId: "task-engine" },
    kind: "task.transitioned",
    payload: {
      taskId: "T100509",
      fromState: "proposed",
      toState: "completed",
      action: "complete",
      transitionId: "T100509-bad",
      guardResults: [{ allowed: true, guardName: "state-validity" }],
      dependentsUnblocked: []
    }
  };
  const result = admitTaskStateEvent(badTransition, { priorEvents });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid-lifecycle-transition");
});

test("admitTaskStateEventStream accepts replay lifecycle fixture", () => {
  const stream = loadJson("replay-stream-lifecycle.v1.json");
  const result = admitTaskStateEventStream(stream);
  assert.equal(result.ok, true);
  assert.equal(result.events.length, stream.length);
});
