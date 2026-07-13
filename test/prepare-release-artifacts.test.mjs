import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareReleaseArtifacts } from "../scripts/prepare-release-artifacts.mjs";

async function createWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-release-prep-"));
  await mkdir(path.join(workspace, "docs", "maintainers"), { recursive: true });
  await mkdir(path.join(workspace, "schemas"), { recursive: true });
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "@workflow-cannon/workspace-kit", version: "0.99.26" }, null, 2) + "\n",
    "utf8"
  );
  await writeFile(
    path.join(workspace, "CHANGELOG.md"),
    [
      "# Changelog",
      "",
      "Canonical changelog location: `docs/maintainers/CHANGELOG.md`.",
      "",
      "This root file is intentionally pointer-only to avoid split release history.",
      "",
      "## [Unreleased]",
      "",
      "- See `docs/maintainers/CHANGELOG.md` for release notes, migration notes, and historical entries.",
      "",
      "## [0.99.26] - 2026-06-03",
      "",
      "- See `docs/maintainers/CHANGELOG.md`."
    ].join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    path.join(workspace, "docs", "maintainers", "CHANGELOG.md"),
    [
      "# Changelog",
      "",
      "All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "- Worker-facing deterministic release prep command.",
      "",
      "### Fixed",
      "",
      "- Safe ambiguity detection for changelog edits.",
      "",
      "## [0.99.26] - 2026-06-03",
      "",
      "Patch release."
    ].join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    path.join(workspace, "schemas", "task-engine-run-contracts.schema.json"),
    JSON.stringify(
      {
        properties: {
          packageVersion: {
            const: "0.99.26"
          }
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await writeFile(
    path.join(workspace, "schemas", "pilot-run-args.snapshot.json"),
    JSON.stringify({ schemaVersion: 1, sourceSchemaPackageVersion: "0.99.26" }, null, 2) + "\n",
    "utf8"
  );
  return workspace;
}

test("CLI dry-run reports exact file changes", async () => {
  const workspace = await createWorkspace();
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "prepare-release-artifacts.mjs"),
        "--workspace",
        workspace,
        "--version",
        "0.99.27",
        "--date",
        "2026-06-04",
        "--dry-run"
      ],
      { encoding: "utf8" }
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.data.dryRun, true);
    assert.deepEqual(
      result.data.changes.map((entry) => entry.path),
      [
        "package.json",
        "CHANGELOG.md",
        "docs/maintainers/CHANGELOG.md",
        "schemas/task-engine-run-contracts.schema.json",
        "schemas/pilot-run-args.snapshot.json"
      ]
    );
    assert.match(result.data.changes[0].replacements[0].newText, /0\.99\.27/);
    assert.match(result.data.changes[1].replacements[0].newText, /## \[0\.99\.27\] - 2026-06-04/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("apply mode preserves maintainer changelog manual context under the new version", async () => {
  const workspace = await createWorkspace();
  try {
    const result = prepareReleaseArtifacts({
      workspacePath: workspace,
      version: "0.99.27",
      date: "2026-06-04",
      dryRun: false
    });
    assert.equal(result.ok, true);

    const maintainer = await readFile(path.join(workspace, "docs", "maintainers", "CHANGELOG.md"), "utf8");
    assert.match(maintainer, /## \[Unreleased\]\n\n## \[0\.99\.27\] - 2026-06-04/);
    assert.match(maintainer, /## \[0\.99\.27\] - 2026-06-04\n\n### Added\n\n- Worker-facing deterministic release prep command\./);
    assert.match(maintainer, /### Fixed\n\n- Safe ambiguity detection for changelog edits\./);

    const root = await readFile(path.join(workspace, "CHANGELOG.md"), "utf8");
    assert.match(root, /## \[Unreleased\]\n\n- See `docs\/maintainers\/CHANGELOG\.md`/);
    assert.match(root, /## \[0\.99\.27\] - 2026-06-04/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fails safely when changelog edits are ambiguous", async () => {
  const workspace = await createWorkspace();
  try {
    await writeFile(
      path.join(workspace, "docs", "maintainers", "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- one\n\n## [Unreleased]\n\n- two\n",
      "utf8"
    );

    const result = prepareReleaseArtifacts({
      workspacePath: workspace,
      version: "0.99.27",
      date: "2026-06-04",
      dryRun: false
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "ambiguous-changelog-section");

    const packageJson = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
    assert.equal(packageJson.version, "0.99.26");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
