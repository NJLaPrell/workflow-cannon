import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardHumanGatesSummary } from "../dist/modules/task-engine/dashboard/build-dashboard-human-gates.js";

const enrich = new Map();

test("buildDashboardHumanGatesSummary scopes to current phase and projects gate metadata", () => {
  const tasks = [
    {
      id: "T1",
      status: "awaiting_review",
      title: "Review me",
      phaseKey: "100",
      phase: "Phase 100",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T01:00:00.000Z",
      metadata: {
        humanGate: {
          gateKind: "awaiting_review",
          enteredAt: "2026-05-18T00:30:00.000Z",
          requestedDecision: "Merge approval",
          owner: "maintainer"
        }
      }
    },
    {
      id: "T2",
      status: "awaiting_policy_approval",
      title: "Other phase",
      phaseKey: "99",
      phase: "Phase 99",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T01:00:00.000Z",
      metadata: {
        humanGate: {
          gateKind: "awaiting_policy_approval",
          enteredAt: "2026-05-18T00:00:00.000Z"
        }
      }
    },
    {
      id: "T3",
      status: "ready",
      title: "Not gated",
      phaseKey: "100",
      phase: "Phase 100",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T01:00:00.000Z"
    }
  ];

  const summary = buildDashboardHumanGatesSummary(tasks, "100", enrich);
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.phaseKey, "100");
  assert.equal(summary.count, 1);
  assert.equal(summary.top.length, 1);
  assert.equal(summary.top[0].id, "T1");
  assert.equal(summary.top[0].status, "awaiting_review");
  assert.equal(summary.top[0].requestedDecision, "Merge approval");
  assert.equal(summary.top[0].owner, "maintainer");
  assert.ok(summary.top[0].ageMs >= 0);
});
