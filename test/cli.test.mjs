import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../dist/cli.js";

function createCapture() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

async function createDoctorFixture(rootDir) {
  const workspaceKitDir = path.join(rootDir, ".workspace-kit");
  const schemasDir = path.join(rootDir, "schemas");
  await mkdir(workspaceKitDir, { recursive: true });
  await mkdir(schemasDir, { recursive: true });

  await writeFile(
    path.join(rootDir, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "fixture-project" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(schemasDir, "workspace-kit-profile.schema.json"),
    JSON.stringify({ type: "object" }, null, 2)
  );

  await writeFile(
    path.join(workspaceKitDir, "manifest.json"),
    JSON.stringify({ schemaVersion: 1 }, null, 2)
  );

  await writeFile(
    path.join(workspaceKitDir, "owned-paths.json"),
    JSON.stringify({ schemaVersion: 1, ownedPaths: [] }, null, 2)
  );
}

test("runCli returns usage error for unknown commands", async () => {
  const capture = createCapture();
  const code = await runCli(["bogus"], capture);

  assert.equal(code, 2);
  assert.match(capture.errors[0], /Unknown command/);
});

test("runCli init generates profile-driven project context artifacts", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-init-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["init"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /generated profile-driven project context artifacts/);

  const generatedContext = JSON.parse(
    await readFile(
      path.join(fixtureRoot, ".workspace-kit", "generated", "project-context.json"),
      "utf8"
    )
  );
  assert.equal(generatedContext.projectName, "fixture-project");
  assert.equal(generatedContext.packageManager, "pnpm");
});

test("runCli doctor validates canonical files", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
});

test("runCli doctor returns validation failure when required files are missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-missing-"));
  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /failed validation/);
});

test("runCli check validates profile baseline fields", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-check-pass-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["check"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /check passed/);
});

test("runCli check returns validation failure for invalid profile values", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-check-fail-"));
  await mkdir(path.join(fixtureRoot, "schemas"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "" },
        packageManager: "invalid-pm",
        commands: { test: "pnpm test", lint: "", typecheck: "" },
        github: {}
      },
      null,
      2
    )
  );

  const capture = createCapture();
  const code = await runCli(["check"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /failed profile validation/);
});

test("runCli init updates generated project context after profile name changes", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-init-update-"));
  await createDoctorFixture(fixtureRoot);

  const firstRunCapture = createCapture();
  const firstCode = await runCli(["init"], { cwd: fixtureRoot, ...firstRunCapture });
  assert.equal(firstCode, 0);

  await writeFile(
    path.join(fixtureRoot, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "renamed-pilot-project" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    )
  );

  const secondRunCapture = createCapture();
  const secondCode = await runCli(["init"], { cwd: fixtureRoot, ...secondRunCapture });
  assert.equal(secondCode, 0);

  const generatedRule = await readFile(
    path.join(fixtureRoot, ".cursor", "rules", "workspace-kit-project-context.mdc"),
    "utf8"
  );
  assert.match(generatedRule, /project_name: renamed-pilot-project/);
  assert.doesNotMatch(generatedRule, /project_name: fixture-project/);
});

test("runCli upgrade overwrites kit-owned assets and preserves profile", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-upgrade-"));
  await createDoctorFixture(fixtureRoot);

  await writeFile(
    path.join(fixtureRoot, ".workspace-kit", "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        kit: { name: "quicktask-workspace-kit", version: "0.0.0-phase1-template" },
        installedAt: null,
        lastUpgrade: null,
        ownershipPolicyPath: ".workspace-kit/owned-paths.json"
      },
      null,
      2
    )
  );
  await writeFile(path.join(fixtureRoot, "schemas", "workspace-kit-profile.schema.json"), "{}");

  const capture = createCapture();
  const code = await runCli(["upgrade"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /upgrade completed/);

  const profile = JSON.parse(
    await readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8")
  );
  assert.equal(profile.project.name, "fixture-project");

  const manifest = JSON.parse(
    await readFile(path.join(fixtureRoot, ".workspace-kit", "manifest.json"), "utf8")
  );
  assert.equal(typeof manifest.lastUpgrade, "string");
  assert.match(manifest.lastUpgrade, /\d{4}-\d{2}-\d{2}T/);

  const schema = JSON.parse(
    await readFile(path.join(fixtureRoot, "schemas", "workspace-kit-profile.schema.json"), "utf8")
  );
  assert.equal(schema.title, "Workspace Kit Profile");

  const backupRoot = path.join(fixtureRoot, ".workspace-kit", "backups");
  const backupDirs = await readdir(backupRoot);
  assert.ok(backupDirs.length > 0);
});

test("runCli upgrade returns validation failure for invalid profile", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-upgrade-fail-"));
  await mkdir(path.join(fixtureRoot, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, "workspace-kit.profile.json"),
    JSON.stringify({ project: { name: "" } }, null, 2)
  );

  const capture = createCapture();
  const code = await runCli(["upgrade"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /upgrade failed profile validation/);
});
