import assert from "node:assert/strict";
import test from "node:test";

import { buildReleaseStatusSnapshot } from "../dist/modules/task-engine/release-status-runtime.js";

test("buildReleaseStatusSnapshot merges git, npm, github, and phase fields", () => {
  const snap = buildReleaseStatusSnapshot({
    workspacePath: process.cwd(),
    currentPhase: "103",
    nextPhase: "104",
    collectors: {
      readPackageName: () => "@workflow-cannon/workspace-kit",
      readGitBranch: () => "release/phase-103",
      readLatestTag: () => "v0.96.0",
      readNpmDistTags: () => ({ latest: "0.96.0", next: "0.97.0" }),
      readLatestReleaseUrl: () => "https://github.com/example/releases/tag/v0.96.0"
    }
  });

  assert.equal(snap.schemaVersion, 1);
  assert.equal(snap.branch, "release/phase-103");
  assert.equal(snap.currentPhase, "103");
  assert.equal(snap.nextPhase, "104");
  assert.equal(snap.npmDistTags?.latest, "0.96.0");
  assert.equal(snap.signalStatus.git, "ok");
  assert.equal(snap.signalStatus.npm, "ok");
  assert.equal(snap.signalStatus.github, "ok");
  assert.equal(snap.degraded.length, 0);
});

test("buildReleaseStatusSnapshot records degraded when npm and gh missing", () => {
  const snap = buildReleaseStatusSnapshot({
    workspacePath: process.cwd(),
    currentPhase: null,
    nextPhase: null,
    collectors: {
      readPackageName: () => "@workflow-cannon/workspace-kit",
      readGitBranch: () => "main",
      readLatestTag: () => null,
      readNpmDistTags: () => null,
      readLatestReleaseUrl: () => null
    }
  });

  assert.equal(snap.signalStatus.npm, "degraded");
  assert.equal(snap.signalStatus.github, "degraded");
  assert.ok(snap.degraded.some((d) => d.includes("npm")));
  assert.ok(snap.degraded.some((d) => d.includes("GitHub")));
});
