import assert from "node:assert/strict";
import test from "node:test";

import { buildReleaseNotes } from "../dist/modules/task-engine/generate-release-notes-runtime.js";

function task(id, overrides = {}) {
  return {
    id,
    status: "completed",
    type: "execution",
    title: `Task ${id}`,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    archived: false,
    phaseKey: "130",
    dependsOn: [],
    ...overrides
  };
}

test("buildReleaseNotes generates markdown from completed phase tasks", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Add agent activity board", type: "feature", summary: "Multi-agent live activity tracking" }),
      task("T002", { title: "Improve dashboard refresh", type: "improvement", summary: "Coalesced background hydration" }),
      task("T003", { title: "Fix expand collapse state", type: "bug", summary: "Dashboard state survives refreshes" }),
      task("T-other-phase", { phaseKey: "129" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      releaseVersion: "0.99.28"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.releaseVersion, "0.99.28");
  assert.equal(result.data.phaseKey, "130");
  assert.equal(result.data.sourceTaskCount, 3);
  assert.match(result.data.markdown, /# Release 0\.99\.28/);
  assert.match(result.data.markdown, /## New Features/);
  assert.match(result.data.markdown, /## Improvements/);
  assert.match(result.data.markdown, /## Bug Fixes/);
  assert.match(result.data.markdown, /Multi.agent live activity tracking/);
  assert.match(result.data.markdown, /Coalesced background hydration/);
  assert.match(result.data.markdown, /Dashboard state survives refreshes/);
});

test("buildReleaseNotes includes release name in title when provided", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001", { title: "New feature", type: "feature" })],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      releaseVersion: "0.99.28",
      releaseName: "Agent Activity Board"
    }
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /# Release 0\.99\.28: Agent Activity Board/);
  assert.equal(result.data.releaseName, "Agent Activity Board");
});

test("buildReleaseNotes handles breaking changes specially", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "Remove wishlist module",
        type: "feature",
        summary: "Wishlist commands removed",
        metadata: { changeKind: "breaking" }
      }),
      task("T002", { title: "Add ideas module", type: "feature", summary: "New ideas workflow" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /## Breaking Changes/);
  assert.match(result.data.markdown, /Action required/);
  assert.match(result.data.markdown, /Wishlist commands removed/);
  assert.ok(result.data.sections.breakingChanges.length > 0);
});

test("buildReleaseNotes supports github format with emoji", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "New feature", type: "feature", summary: "Cool stuff" }),
      task("T002", { title: "Bug fix", type: "fix", summary: "Fixed stuff" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      format: "github"
    }
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /### 🚀 New Features/);
  assert.match(result.data.markdown, /### 🐛 Bug Fixes/);
});

test("buildReleaseNotes supports plain format without markdown", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001", { title: "New feature", type: "feature" })],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      format: "plain"
    }
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /Release \d+\.\d+\.\d+/);
  assert.match(result.data.markdown, /====/);
  assert.doesNotMatch(result.data.markdown, /^#/m);
});

test("buildReleaseNotes fails gracefully when no tasks found", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001", { phaseKey: "129" })],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "generate-release-notes-no-tasks");
});

test("buildReleaseNotes fails when phase key is missing", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001")],
    phaseKey: null,
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "generate-release-notes-invalid-phase");
});

test("buildReleaseNotes extracts changeKind from task metadata", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Feature", metadata: { changeKind: "feature" } }),
      task("T002", { title: "Improvement", metadata: { changeKind: "improvement" } }),
      task("T003", { title: "Fix", metadata: { changeKind: "fix" } }),
      task("T004", { title: "Chore", metadata: { changeKind: "chore" } })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  const kinds = result.data.sourceTasks.map((t) => t.changeKind);
  assert.deepEqual(kinds, ["feature", "improvement", "fix", "chore"]);
});

test("buildReleaseNotes uses task summary for user-facing description", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "T001: Internal task title with ticket ID",
        summary: "Clean user-facing description"
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /Clean user.facing description/);
  assert.doesNotMatch(result.data.markdown, /Internal task title/);
});

test("buildReleaseNotes humanizes title when no summary provided", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "T001 - add_user_authentication_flow" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /add user authentication flow/i);
  assert.doesNotMatch(result.data.markdown, /T001 -/);
});

test("buildReleaseNotes can filter by explicit taskIds", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Included task", type: "feature" }),
      task("T002", { title: "Excluded task", type: "feature" }),
      task("T003", { title: "Also included", type: "feature" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      taskIds: ["T001", "T003"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTaskCount, 2);
  assert.ok(result.data.sourceTasks.some((t) => t.taskId === "T001"));
  assert.ok(result.data.sourceTasks.some((t) => t.taskId === "T003"));
  assert.ok(!result.data.sourceTasks.some((t) => t.taskId === "T002"));
});

test("buildReleaseNotes includes migration notes from task metadata", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "Remove wishlist",
        type: "feature",
        metadata: {
          changeKind: "breaking",
          migrationNote: "Back up wishlist items before upgrading. Run `wk doctor` after upgrade."
        }
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /## Migration Notes/);
  assert.match(result.data.markdown, /Back up wishlist items/);
  assert.ok(result.data.sections.migration !== null);
});

test("buildReleaseNotes generates sensible overview paragraph", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Feature 1", type: "feature" }),
      task("T002", { title: "Feature 2", type: "feature" }),
      task("T003", { title: "Fix 1", type: "fix" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.sections.overview.length > 0);
  assert.match(result.data.sections.overview, /2 new features/);
  assert.match(result.data.sections.overview, /1 bug fix/);
});

test("buildReleaseNotes excludes archived and non-completed tasks", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Completed", status: "completed" }),
      task("T002", { title: "In progress", status: "in_progress" }),
      task("T003", { title: "Archived completed", status: "completed", archived: true }),
      task("T004", { title: "Ready", status: "ready" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTaskCount, 1);
  assert.ok(result.data.sourceTasks.some((t) => t.taskId === "T001"));
});
