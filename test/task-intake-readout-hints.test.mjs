import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskIntakeReadoutBundle,
  compactTaskIntakeReadout,
  resolveTaskIntakeForAcceptTriage,
  taskIntakeReadoutHasSignal
} from "../dist/modules/task-engine/task-intake-readout-hints.js";

const baseExec = (overrides = {}) => ({
  id: "T880001",
  status: "ready",
  type: "execution",
  title: "Sample",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  phaseKey: "83",
  summary: "S",
  technicalScope: ["a"],
  acceptanceCriteria: ["b"],
  ...overrides
});

test("resolveTaskIntakeForAcceptTriage reports missing recommended on sparse ready task", () => {
  const r = resolveTaskIntakeForAcceptTriage(
    baseExec({
      summary: undefined,
      description: undefined,
      technicalScope: undefined,
      acceptanceCriteria: undefined
    }),
    {}
  );
  assert.ok(r.missingRecommendedFields.length > 0);
  assert.equal(r.resolvedPolicy.profileName, "advisory");
});

test("buildTaskIntakeReadoutBundle attaches suggested next and skips proposed block when none", () => {
  const b = buildTaskIntakeReadoutBundle({
    effectiveConfig: {},
    suggestedNext: baseExec({ id: "T9" }),
    proposedHeadlineTasks: []
  });
  assert.ok(b.taskIntakeSuggestedNext);
  assert.equal(b.taskIntakeProposedHeadlines, undefined);
});

test("taskIntakeReadoutHasSignal is true when improvement row misses recommended fields", () => {
  const r = resolveTaskIntakeForAcceptTriage(
    {
      id: "T880002",
      status: "proposed",
      type: "improvement",
      title: "Imp",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      technicalScope: ["scope"],
      acceptanceCriteria: ["crit"],
      metadata: {
        issue: "https://example.invalid/issue/1",
        supportingReasoning: "Because tests."
      }
    },
    {}
  );
  assert.equal(taskIntakeReadoutHasSignal(r), true);
  assert.ok(r.missingRecommendedFields.includes("summary"));
  assert.ok(compactTaskIntakeReadout(r).missingRequiredFields.length === 0);
});
