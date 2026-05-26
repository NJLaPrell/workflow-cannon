import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateTaskStateEvent } from "../dist/modules/task-engine/task-state-events/validate-event.js";
import { transitionEvidenceToTransitionedPayload } from "../dist/modules/task-engine/task-state-events/event-payloads.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

const GOLDEN = [
  "golden-task-transitioned.v1.json",
  "golden-task-created.v1.json",
  "golden-task-updated.v1.json",
  "golden-task-batch-applied.v1.json"
];

test("golden fixtures validate as full task state events", () => {
  for (const file of GOLDEN) {
    const event = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
    const result = validateTaskStateEvent(event);
    assert.equal(result.ok, true, file);
    assert.ok(result.data.kind.startsWith("task."));
  }
});

test("transitionEvidenceToTransitionedPayload preserves transitionLog fields", () => {
  const evidence = {
    transitionId: "T1-2026-01-01T00:00:00.000Z-abc",
    taskId: "T1",
    fromState: "ready",
    toState: "in_progress",
    action: "start",
    guardResults: [{ allowed: true, guardName: "state-validity" }],
    dependentsUnblocked: ["T2"],
    timestamp: "2026-01-01T00:00:00.000Z"
  };
  const payload = transitionEvidenceToTransitionedPayload(evidence);
  assert.equal(payload.transitionId, evidence.transitionId);
  assert.deepEqual(payload.dependentsUnblocked, ["T2"]);
});
