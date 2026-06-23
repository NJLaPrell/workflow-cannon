import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScopePathManifest,
  extractScopePaths,
  KICKOFF_SCOPE_PATH_PREFIX_RE
} from "../dist/modules/task-engine/kickoff/scope-path-manifest.js";

describe("kickoff scope path manifest", () => {
  it("exports the documented scope path prefix regex", () => {
    assert.equal(KICKOFF_SCOPE_PATH_PREFIX_RE.test("src/foo.ts"), true);
    assert.equal(KICKOFF_SCOPE_PATH_PREFIX_RE.test("extensions/bar.ts"), true);
    assert.equal(KICKOFF_SCOPE_PATH_PREFIX_RE.test("docs/foo.md"), false);
  });

  it("returns deduped sorted paths from metadata.scopePaths and technicalScope", () => {
    const task = {
      metadata: {
        scopePaths: ["extensions/cursor-workflow-cannon/src/a.ts", "src/modules/a.ts"]
      },
      technicalScope: [
        "Add src/modules/task-engine/kickoff/scope-path-manifest.ts with extractScopePaths",
        "src/modules/b.ts"
      ],
      description: "Touch `src/modules/c.ts` when needed."
    };

    assert.deepEqual(extractScopePaths(task), [
      "extensions/cursor-workflow-cannon/src/a.ts",
      "src/modules/a.ts",
      "src/modules/b.ts",
      "src/modules/c.ts",
      "src/modules/task-engine/kickoff/scope-path-manifest.ts"
    ]);
  });

  it("ignores description prose without backtick paths", () => {
    const task = {
      technicalScope: ["src/modules/only-scope.ts"],
      description: "src/modules/not-from-prose.ts should not be picked up"
    };
    assert.deepEqual(extractScopePaths(task), ["src/modules/only-scope.ts"]);
  });

  it("emits parse-skipped findings for invalid metadata and backtick paths", () => {
    const manifest = buildScopePathManifest({
      metadata: { scopePaths: ["docs/readme.md", 42, ""] },
      technicalScope: ["Use `docs/invalid.md` as a reference"],
      description: "`package.json` is not a kickoff path"
    });

    assert.deepEqual(manifest.paths, []);
    assert.ok(
      manifest.findings.some((f) => f.code === "kickoff-scope-path-parse-skipped" && f.path === "docs/readme.md")
    );
    assert.ok(
      manifest.findings.some((f) => f.code === "kickoff-scope-path-parse-skipped" && f.path === "docs/invalid.md")
    );
    assert.ok(
      manifest.findings.some((f) => f.code === "kickoff-scope-path-parse-skipped" && f.path === "package.json")
    );
  });

  it("returns an empty list for tasks without path hints", () => {
    assert.deepEqual(extractScopePaths({}), []);
    assert.deepEqual(extractScopePaths({ technicalScope: ["Investigate symptom", "Ship a fix"] }), []);
  });
});
