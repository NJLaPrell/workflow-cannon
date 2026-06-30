import test from "node:test";
import assert from "node:assert/strict";

import {
  admitCanonicalStateEventStream,
  canonicalEventsAreIdempotentDuplicates
} from "../dist/modules/task-engine/task-state-events/canonical-event-admission.js";
import { createEmptyTaskStateProjection } from "../dist/modules/task-engine/task-state-events/event-applier.js";

function seedTask748Projection() {
  const projection = createEmptyTaskStateProjection();
  projection.tasksById.T100748 = {
    id: "T100748",
    title: "fixture",
    type: "workspace-kit",
    status: "ready",
    phase: "Phase 139",
    phaseKey: "139",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  projection.taskVersions.push({ taskId: "T100748", version: 1, lastEventId: "evt-seed" });
  return projection;
}

function loadGitTailDuplicateFixture() {
  const lines = [
    '{"schemaVersion":1,"eventId":"evt-e4d76bd2-b047-4071-9e89-c775ad333be4","sequence":2084,"parentEventId":"evt-cb34b80c-ade4-4c87-ae34-35f37be3000a","recordedAt":"2026-06-28T06:53:09.026Z","actor":{"id":"NJLaPrell@gmail.com","source":"system"},"command":{"name":"clear-task-phase","moduleId":"task-engine"},"kind":"task.updated","payload":{"taskId":"T100748","changedFields":["phase","phaseKey"],"values":{"phase":null,"phaseKey":null}},"clientMutationId":"dashboard-backlog-T100748-1782629558474"}',
    '{"schemaVersion":1,"eventId":"evt-2031316d-f61f-4c57-9962-8676d9c9351b","sequence":2085,"parentEventId":"evt-e4d76bd2-b047-4071-9e89-c775ad333be4","recordedAt":"2026-06-28T06:53:37.646Z","actor":{"id":"NJLaPrell@gmail.com","source":"system"},"command":{"name":"clear-task-phase","moduleId":"task-engine"},"kind":"task.updated","payload":{"taskId":"T100748","changedFields":["phase","phaseKey"],"values":{"phase":null,"phaseKey":null}},"clientMutationId":"dashboard-backlog-T100748-1782629558474"}'
  ];
  return lines.map((line) => JSON.parse(line));
}

test("canonicalEventsAreIdempotentDuplicates matches identical clear-task-phase tail events", () => {
  const [first, duplicate] = loadGitTailDuplicateFixture();
  assert.equal(canonicalEventsAreIdempotentDuplicates(first, duplicate), true);
});

test("admitCanonicalStateEventStream skips duplicate idempotency when payload is identical", () => {
  const [first, duplicate] = loadGitTailDuplicateFixture();
  const admitted = admitCanonicalStateEventStream([first, duplicate], {
    initialTaskProjection: seedTask748Projection()
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.events.length, 1);
  assert.equal(admitted.events[0]?.eventId, "evt-e4d76bd2-b047-4071-9e89-c775ad333be4");
});

test("admitCanonicalStateEventStream still rejects duplicate idempotency with conflicting payload", () => {
  const [first, duplicate] = loadGitTailDuplicateFixture();
  const conflict = {
    ...duplicate,
    eventId: "evt-conflict",
    payload: {
      taskId: "T100748",
      changedFields: ["phase", "phaseKey"],
      values: { phase: "Phase 99", phaseKey: "99" }
    }
  };
  const admitted = admitCanonicalStateEventStream([first, conflict], {
    initialTaskProjection: seedTask748Projection()
  });
  assert.equal(admitted.ok, false);
  assert.equal(admitted.error.code, "duplicate-idempotency-key");
});
