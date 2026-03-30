import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { runCli } from "../dist/cli.js";

const TEST_CLI_POLICY_APPROVAL = JSON.stringify({
  confirmed: true,
  rationale: "automated test fixture"
});

async function runCliWithPolicyApproval(args, options) {
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  process.env.WORKSPACE_KIT_POLICY_APPROVAL = TEST_CLI_POLICY_APPROVAL;
  try {
    return await runCli(args, options);
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    } else {
      process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
    }
  }
}

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
  assert.match(capture.errors[0], /--help/);
});

test("runCli --help prints orientation and exits 0", async () => {
  const capture = createCapture();
  const code = await runCli(["--help"], capture);

  assert.equal(code, 0);
  assert.ok(capture.lines.some((l) => l.includes("Workflow Cannon")));
  assert.ok(capture.lines.some((l) => l.includes("workspace-kit run")));
  assert.ok(capture.lines.some((l) => l.includes("get-next-actions")));
});

test("runCli help subcommand matches --help", async () => {
  const capture = createCapture();
  const code = await runCli(["help"], capture);

  assert.equal(code, 0);
  assert.ok(capture.lines.some((l) => l.includes("Start here")));
});

test("runCli with no args prints help on stdout and exits usage", async () => {
  const capture = createCapture();
  const code = await runCli([], capture);

  assert.equal(code, 2);
  assert.ok(capture.lines.some((l) => l.includes("Top-level commands")));
  assert.match(capture.errors[0], /Missing command/);
});

test("runCli --version prints a semver line", async () => {
  const capture = createCapture();
  const code = await runCli(["--version"], capture);

  assert.equal(code, 0);
  assert.match(capture.lines[0], /^\d+\.\d+\.\d+/);
});

test("runCli init generates profile-driven project context artifacts", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-init-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCliWithPolicyApproval(["init"], { cwd: fixtureRoot, ...capture });

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
  assert.ok(capture.lines.some((l) => l.includes("AGENT-CLI-MAP.md")));
});

test("runCli doctor --agent-instruction-surface emits JSON catalog", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-surface-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor", "--agent-instruction-surface"], {
    cwd: fixtureRoot,
    ...capture
  });

  assert.equal(code, 0);
  assert.equal(capture.lines.length >= 1, true);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.code, "agent-instruction-surface");
  assert.equal(payload.data.schemaVersion, 1);
  assert.ok(Array.isArray(payload.data.commands));
  assert.ok(payload.data.activationReport);
});

test("runCli doctor returns validation failure when required files are missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-missing-"));
  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /failed validation/);
  assert.ok(capture.errors.some((l) => l.includes("Next steps:")));
  assert.ok(capture.errors.some((l) => l.includes("upgrade")));
  assert.ok(capture.errors.some((l) => l.includes("--help")));
});

test("runCli doctor fails when sqlite persistence configured but DB missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-dr-sqlite-miss-"));
  await createDoctorFixture(fixtureRoot);
  await writeFile(
    path.join(fixtureRoot, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/planning.db"
        }
      },
      null,
      2
    )
  );

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.ok(capture.errors.some((e) => e.includes("sqlite-planning-db-missing")));
});

test("runCli doctor passes when sqlite DB exists but planning row not yet written", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-dr-sqlite-empty-"));
  await createDoctorFixture(fixtureRoot);
  await mkdir(path.join(fixtureRoot, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/planning.db"
        }
      },
      null,
      2
    )
  );

  const dbPath = path.join(fixtureRoot, ".workspace-kit", "tasks", "planning.db");
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL,
  wishlist_store_json TEXT NOT NULL
);`);
  db.close();

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
});

test("runCli doctor passes when sqlite DB exists with valid planning row", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-dr-sqlite-ok-"));
  await createDoctorFixture(fixtureRoot);
  await mkdir(path.join(fixtureRoot, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/planning.db"
        }
      },
      null,
      2
    )
  );

  const dbPath = path.join(fixtureRoot, ".workspace-kit", "tasks", "planning.db");
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL,
  wishlist_store_json TEXT NOT NULL
);`);
  const taskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  const wishDoc = JSON.stringify({
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare(
    "INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json) VALUES (1, ?, ?)"
  ).run(taskDoc, wishDoc);
  db.close();

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
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
  const firstCode = await runCliWithPolicyApproval(["init"], { cwd: fixtureRoot, ...firstRunCapture });
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
  const secondCode = await runCliWithPolicyApproval(["init"], { cwd: fixtureRoot, ...secondRunCapture });
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
        kit: { name: "@workflow-cannon/workspace-kit", version: "0.0.0-phase1-template" },
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
  const code = await runCliWithPolicyApproval(["upgrade"], { cwd: fixtureRoot, ...capture });

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
  const code = await runCliWithPolicyApproval(["upgrade"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /upgrade failed profile validation/);
});

test("runCli drift-check passes for aligned managed assets", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-drift-pass-"));
  await createDoctorFixture(fixtureRoot);

  const upgradeCapture = createCapture();
  const upgradeCode = await runCliWithPolicyApproval(["upgrade"], { cwd: fixtureRoot, ...upgradeCapture });
  assert.equal(upgradeCode, 0);

  const driftCapture = createCapture();
  const driftCode = await runCli(["drift-check"], { cwd: fixtureRoot, ...driftCapture });
  assert.equal(driftCode, 0);
  assert.match(driftCapture.lines[0], /drift-check passed/);
});

test("runCli drift-check fails when managed asset content drifts", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "qt-wskit-drift-fail-"));
  await createDoctorFixture(fixtureRoot);

  const upgradeCapture = createCapture();
  const upgradeCode = await runCliWithPolicyApproval(["upgrade"], { cwd: fixtureRoot, ...upgradeCapture });
  assert.equal(upgradeCode, 0);

  await writeFile(
    path.join(fixtureRoot, ".cursor", "rules", "workspace-kit-project-context.mdc"),
    "# drifted-content\n",
    "utf8"
  );

  const driftCapture = createCapture();
  const driftCode = await runCli(["drift-check"], { cwd: fixtureRoot, ...driftCapture });
  assert.equal(driftCode, 1);
  assert.match(driftCapture.errors[0], /detected drift/);
});

test("runCli run lists available module commands with no subcommand", async () => {
  const capture = createCapture();
  const code = await runCli(["run"], { cwd: process.cwd(), ...capture });
  assert.equal(code, 0);
  assert.ok(capture.lines.some((l) => l.includes("document-project")));
  assert.ok(capture.lines.some((l) => l.includes("generate-document")));
  assert.ok(capture.lines.some((l) => l.includes("run-transition")));
  assert.ok(capture.lines.some((l) => l.includes("list-planning-types")));
  assert.ok(capture.lines.some((l) => l.includes("build-plan")));
  assert.ok(capture.lines.some((l) => l.includes("explain-planning-rules")));
  assert.ok(capture.lines.some((l) => l.includes("AGENT-CLI-MAP.md")));
  assert.ok(capture.lines.some((l) => l.includes("instructions")));
});

test("runCli run dispatches generate-document with dryRun", async () => {
  const capture = createCapture();
  const code = await runCli(
    ["run", "generate-document", '{"documentType":"AGENTS.md","options":{"dryRun":true}}'],
    { cwd: process.cwd(), ...capture }
  );
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "generated-document");
});

test("runCli run dispatches document-project batch with dryRun", async () => {
  const capture = createCapture();
  const code = await runCli(
    ["run", "document-project", '{"options":{"dryRun":true}}'],
    { cwd: process.cwd(), ...capture }
  );
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "documented-project");
  assert.ok(output.data.summary.total >= 8);
});

test("runCli run returns validation failure for run-transition with missing args", async () => {
  const capture = createCapture();
  const code = await runCli(
    [
      "run",
      "run-transition",
      JSON.stringify({
        policyApproval: { confirmed: true, rationale: "test" }
      })
    ],
    { cwd: process.cwd(), ...capture }
  );
  assert.equal(code, 1);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, false);
  assert.equal(output.code, "invalid-task-schema");
});

test("runCli run returns error for invalid JSON args", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "generate-document", "not-json"], { cwd: process.cwd(), ...capture });
  assert.equal(code, 2);
  assert.ok(capture.errors.some((e) => e.includes("Invalid JSON")));
});
