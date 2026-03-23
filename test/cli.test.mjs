import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

test("runCli init returns success and guidance text", async () => {
  const capture = createCapture();
  const code = await runCli(["init"], capture);

  assert.equal(code, 0);
  assert.match(capture.lines.join("\n"), /placeholder/);
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
