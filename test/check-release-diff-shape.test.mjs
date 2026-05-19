import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RELEASE_ALLOWLIST_GLOBS,
  evaluateReleaseDiffShape,
  globToRegExp,
  isReleaseBranchName,
  isPhaseIntegrationBranch,
  pathMatchesAllowlist,
  shouldEnforceReleaseDiffShape
} from "../scripts/check-release-diff-shape.mjs";

test("globToRegExp matches generated schema paths and workspace-kit", () => {
  const generated = globToRegExp("schemas/_generated-*");
  assert.equal(pathMatchesAllowlist("schemas/_generated-foo.json", [generated]), true);
  assert.equal(pathMatchesAllowlist("schemas/task-engine-run-contracts.schema.json", [generated]), false);

  const kit = globToRegExp(".workspace-kit/**");
  assert.equal(pathMatchesAllowlist(".workspace-kit/tasks/workspace-kit.db", [kit]), true);
});

test("evaluateReleaseDiffShape fails when src/ changes are present", () => {
  const result = evaluateReleaseDiffShape({
    changedPaths: ["package.json", "src/cli/init-command.ts"]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.disallowed, ["src/cli/init-command.ts"]);
});

test("evaluateReleaseDiffShape passes for allowlist-only diff", () => {
  const result = evaluateReleaseDiffShape({
    changedPaths: ["package.json", "CHANGELOG.md", ".workspace-kit/runtime.json"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.disallowed.length, 0);
});

test("profile extra allowlist globs extend defaults", () => {
  const result = evaluateReleaseDiffShape({
    changedPaths: ["docs/maintainers/ROADMAP.md"],
    extraAllowlistGlobs: ["docs/maintainers/**"]
  });
  assert.equal(result.ok, true);
});

test("isReleaseBranchName covers main and release/*", () => {
  assert.equal(isReleaseBranchName("main"), true);
  assert.equal(isReleaseBranchName("release/phase-103"), true);
  assert.equal(isReleaseBranchName("feature/foo"), false);
});

test("shouldEnforceReleaseDiffShape skips phase integration unless forced", () => {
  assert.equal(isPhaseIntegrationBranch("release/phase-103"), true);
  assert.equal(shouldEnforceReleaseDiffShape("release/phase-103"), false);
  assert.equal(shouldEnforceReleaseDiffShape("main"), true);
  const prev = process.env.RELEASE_DIFF_ENFORCE;
  process.env.RELEASE_DIFF_ENFORCE = "true";
  assert.equal(shouldEnforceReleaseDiffShape("release/phase-103"), true);
  if (prev === undefined) {
    delete process.env.RELEASE_DIFF_ENFORCE;
  } else {
    process.env.RELEASE_DIFF_ENFORCE = prev;
  }
});

test("DEFAULT_RELEASE_ALLOWLIST_GLOBS includes package.json and CHANGELOG", () => {
  assert.ok(DEFAULT_RELEASE_ALLOWLIST_GLOBS.includes("package.json"));
  assert.ok(DEFAULT_RELEASE_ALLOWLIST_GLOBS.includes("CHANGELOG.md"));
});
