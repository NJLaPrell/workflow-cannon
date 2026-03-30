import test from "node:test";
import assert from "node:assert/strict";

import { buildTaskDetailMarkdown } from "../dist/task-detail-markdown.js";

test("buildTaskDetailMarkdown includes scope, criteria, and dependencies", () => {
  const md = buildTaskDetailMarkdown({
    task: {
      id: "T1",
      title: "Example",
      status: "ready",
      type: "improvement",
      priority: "P2",
      phase: "Phase A",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
      dependsOn: ["T0"],
      technicalScope: ["Do X", "Do Y"],
      acceptanceCriteria: ["Works"],
      approach: "Ship it carefully.",
      metadata: { risk: "low" }
    },
    allowedActions: [{ action: "start", targetStatus: "in_progress" }],
    recentTransitions: [
      { timestamp: "2026-01-01T00:00:00Z", action: "accept", fromState: "proposed", toState: "ready" }
    ]
  });
  assert.match(md, /# T1 — Example/);
  assert.match(md, /\*\*Type:\*\* improvement/);
  assert.match(md, /## Depends on/);
  assert.match(md, /`T0`/);
  assert.match(md, /## Technical scope/);
  assert.match(md, /## Acceptance criteria/);
  assert.match(md, /## Approach/);
  assert.match(md, /Ship it carefully/);
  assert.match(md, /```json/);
  assert.match(md, /"risk": "low"/);
  assert.match(md, /## Allowed actions/);
  assert.match(md, /\*\*start\*\* → in_progress/);
  assert.match(md, /## Recent transitions/);
  assert.match(md, /accept/);
});
