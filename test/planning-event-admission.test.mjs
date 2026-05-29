import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validatePlanningStateEvent } from "../dist/modules/task-engine/task-state-events/validate-planning-event.js";
import { replayPlanningStateEvents, applyPlanningStateEvent } from "../dist/modules/task-engine/task-state-events/planning-event-applier.js";
import { admitCanonicalStateEventStream } from "../dist/modules/task-engine/task-state-events/canonical-event-admission.js";
import { replayCanonicalStateEvents } from "../dist/modules/task-engine/task-state-events/canonical-replay.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

const PLANNING_GOLDEN = [
  "golden-planning-catalog-upserted.v1.json",
  "golden-planning-catalog-removed.v1.json",
  "golden-planning-workspace-status-updated.v1.json"
];

test("planning golden fixtures validate", () => {
  for (const file of PLANNING_GOLDEN) {
    const event = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
    const result = validatePlanningStateEvent(event);
    assert.equal(result.ok, true, file);
    assert.ok(result.data.kind.startsWith("planning."));
  }
});

test("planning catalog replay produces expected rows", () => {
  const upsert = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-catalog-upserted.v1.json"), "utf8")
  );
  const removed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-catalog-removed.v1.json"), "utf8")
  );
  const replayed = replayPlanningStateEvents([upsert, removed]);
  assert.equal(replayed.ok, true);
  assert.equal(Object.keys(replayed.projection.phaseCatalogByKey).length, 1);
  assert.equal(replayed.projection.phaseCatalogByKey["119"].shortDescription, "Planning git sync phase");
});

test("workspace status replay requires matching expectedWorkspaceRevision", () => {
  const wsEvent = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-workspace-status-updated.v1.json"), "utf8")
  );
  const seed = {
    schemaVersion: 1,
    phaseCatalogByKey: {},
    workspaceStatus: {
      workspaceRevision: 69,
      currentKitPhase: "119",
      nextKitPhase: "116",
      activeFocus: "Phase 119",
      lastUpdated: "2026-05-29T06:55:18.092Z",
      blockers: [],
      pendingDecisions: [],
      nextAgentActions: [],
      updatedAt: "2026-05-29T06:55:18.092Z"
    },
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set(),
    lastEventSequence: 0,
    lastUpdated: "1970-01-01T00:00:00.000Z"
  };
  const admitted = admitCanonicalStateEventStream([wsEvent], { initialPlanningProjection: seed });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.events.length, 1);
  const applied = applyPlanningStateEvent(seed, admitted.events[0]);
  assert.equal(applied.ok, true);
  assert.equal(applied.projection.workspaceStatus?.workspaceRevision, 70);
  assert.equal(applied.projection.workspaceStatusAudits.length, 1);
});

test("workspace revision mismatch rejects admission", () => {
  const wsEvent = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "golden-planning-workspace-status-updated.v1.json"), "utf8")
  );
  wsEvent.expectedWorkspaceRevision = 99;
  const admitted = admitCanonicalStateEventStream([wsEvent]);
  assert.equal(admitted.ok, false);
  assert.equal(admitted.error.code, "workspace-revision-mismatch");
});
