import assert from "node:assert/strict";
import test from "node:test";

import { buildReleaseNotes } from "../dist/modules/task-engine/generate-release-notes-runtime.js";
import {
  classifyReleaseNoteTask,
  dedupeBullets,
  loadFeatureTaxonomyForReleaseNotes,
  resolveUserFacingDescription
} from "../dist/modules/documentation/release-notes.js";

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
      task("T001", {
        title: "Add agent activity board",
        type: "feature",
        summary: "Multi-agent live activity tracking",
        features: ["cursor-extension"]
      }),
      task("T002", {
        title: "Improve dashboard refresh",
        type: "improvement",
        summary: "Coalesced background hydration",
        features: ["cursor-extension"]
      }),
      task("T003", {
        title: "Fix expand collapse state",
        type: "bug",
        summary: "Dashboard state survives refreshes",
        features: ["cursor-extension"]
      }),
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
  assert.match(result.data.markdown, /faster background updates/i);
  assert.match(result.data.markdown, /Dashboard state survives refreshes/);
  assert.match(result.data.markdown, /CHANGELOG\.md/);
});

test("buildReleaseNotes prefers metadata.releaseNoteSummary over technical summary", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "Wire dashboard-terminal-tasks projection",
        type: "feature",
        summary: "dashboard-terminal-tasks alongside the existing terminal-row readout",
        metadata: {
          releaseNoteSummary: "See terminal tasks directly on your dashboard"
        },
        features: ["cursor-extension"]
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /See terminal tasks directly on your dashboard/);
  assert.doesNotMatch(result.data.markdown, /dashboard-terminal-tasks/);
});

test("buildReleaseNotes includes release name in title when provided", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001", { title: "New feature", type: "feature", metadata: { releaseNoteSummary: "A helpful new capability" } })],
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
        metadata: {
          changeKind: "breaking",
          releaseNoteSummary: "The wishlist feature has been removed"
        }
      }),
      task("T002", {
        title: "Add ideas module",
        type: "feature",
        metadata: { releaseNoteSummary: "Capture ideas in a dedicated workflow" }
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /## Breaking Changes/);
  assert.match(result.data.markdown, /Action required/);
  assert.match(result.data.markdown, /wishlist feature has been removed/i);
  assert.ok(result.data.sections.breakingChanges.length > 0);
});

test("buildReleaseNotes supports github format with emoji", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "New feature", type: "feature", metadata: { releaseNoteSummary: "Cool stuff for users" } }),
      task("T002", { title: "Bug fix", type: "fix", metadata: { releaseNoteSummary: "Fixed a confusing error message" } })
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
    tasks: [task("T001", { title: "New feature", type: "feature", metadata: { releaseNoteSummary: "Plain feature copy" } })],
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
      task("T001", { title: "Feature", metadata: { changeKind: "feature", releaseNoteSummary: "Shipped feature one" } }),
      task("T002", { title: "Improvement", metadata: { changeKind: "improvement", releaseNoteSummary: "Shipped improvement one" } }),
      task("T003", { title: "Fix", metadata: { changeKind: "fix", releaseNoteSummary: "Shipped fix one" } }),
      task("T004", { title: "Chore", metadata: { changeKind: "chore" } })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  const kinds = result.data.sourceTasks.map((t) => t.changeKind);
  assert.deepEqual(kinds, ["feature", "improvement", "fix", "chore"]);
  assert.equal(result.data.sourceTasks.find((t) => t.taskId === "T004").includedInPublicSections, false);
});

test("buildReleaseNotes uses releaseNoteSummary for user-facing description", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "T001: Internal task title with ticket ID",
        summary: "SQLite schema v39 projection runtime refactor",
        metadata: { releaseNoteSummary: "Clean user-facing description" }
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /Clean user.facing description/);
  assert.doesNotMatch(result.data.markdown, /Internal task title/);
  assert.doesNotMatch(result.data.markdown, /SQLite/);
});

test("buildReleaseNotes humanizes title when no summary provided", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [task("T001", { title: "T001 - add user authentication flow", type: "feature" })],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.match(result.data.markdown, /user authentication flow/i);
  assert.doesNotMatch(result.data.markdown, /T001 -/);
});

test("buildReleaseNotes can filter by explicit taskIds", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Included task", type: "feature", metadata: { releaseNoteSummary: "Included" } }),
      task("T002", { title: "Excluded task", type: "feature", metadata: { releaseNoteSummary: "Excluded" } }),
      task("T003", { title: "Also included", type: "feature", metadata: { releaseNoteSummary: "Also included" } })
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
          releaseNoteSummary: "Wishlist has been removed",
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
  assert.doesNotMatch(result.data.markdown, /`wk doctor`/);
  assert.ok(result.data.sections.migration !== null);
});

test("buildReleaseNotes generates benefit-oriented overview paragraph", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Feature 1", type: "feature", metadata: { releaseNoteSummary: "Feature one for users" } }),
      task("T002", { title: "Feature 2", type: "feature", metadata: { releaseNoteSummary: "Feature two for users" } }),
      task("T003", { title: "Fix 1", type: "fix", metadata: { releaseNoteSummary: "Fix one for users" } })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.sections.overview.length > 0);
  assert.match(result.data.sections.overview, /2 new capabilities/);
  assert.match(result.data.sections.overview, /1 bug fix/);
});

test("buildReleaseNotes excludes archived and non-completed tasks", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", { title: "Completed", status: "completed", metadata: { releaseNoteSummary: "Completed task" } }),
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

test("buildReleaseNotes omits highly technical tasks without release note metadata", () => {
  const result = buildReleaseNotes({
    workspacePath: process.cwd(),
    tasks: [
      task("T001", {
        title: "Refactor SQLite schema v39 runtime",
        summary: "workspace-kit run migrate-planning-store alongside src/modules/task-engine"
      })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTasks[0].includedInPublicSections, false);
  assert.doesNotMatch(result.data.markdown, /SQLite/);
  assert.doesNotMatch(result.data.markdown, /workspace-kit/);
});

test("release notes humanizer dedupes bullets", () => {
  assert.deepEqual(dedupeBullets(["Same item", "same item", "Different item"]), ["Same item", "Different item"]);
});

test("release notes humanizer uses acceptance criteria when summary is technical", () => {
  const taxonomy = loadFeatureTaxonomyForReleaseNotes(process.cwd());
  const resolved = resolveUserFacingDescription(
    {
      id: "T001",
      title: "Internal wiring",
      summary: "projection runtime schema v39",
      acceptanceCriteria: ["Users can refresh the dashboard without losing layout"]
    },
    "feature",
    taxonomy
  );

  assert.match(resolved.description, /refresh the dashboard without losing layout/i);
});

test("release notes classifier groups by feature taxonomy", () => {
  const taxonomy = loadFeatureTaxonomyForReleaseNotes(process.cwd());
  const classified = classifyReleaseNoteTask(
    {
      id: "T001",
      title: "Add board",
      type: "feature",
      metadata: { releaseNoteSummary: "Live agent board" },
      features: ["cursor-extension"]
    },
    taxonomy
  );

  assert.equal(classified.featureSlug, "cursor-extension");
  assert.equal(classified.featureLabel, "Cursor extension & dashboard");
  assert.equal(classified.includeInPublicSections, true);
});
