import { chmod, mkdtemp, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { runCli } from "../dist/cli.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { writeRuntimeLauncher, writeRuntimeStamp } from "../dist/core/runtime-contract.js";

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

async function runCliWithoutPolicyApproval(args, options) {
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  try {
    return await runCli(args, options);
  } finally {
    if (prev !== undefined) {
      process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
    }
  }
}

async function runCliWithRuntimeContract(args, options, runtimeOverrides = {}) {
  const prev = process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY;
  process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY = JSON.stringify({
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: "v22.11.0",
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules,
    packageRoot: process.cwd(),
    checkedAt: "2026-05-12T00:00:00.000Z",
    ...runtimeOverrides
  });
  try {
    return await runCli(args, options);
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY;
    } else {
      process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY = prev;
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

function runtimeContractFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: "v22.11.0",
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules,
    packageRoot: process.cwd(),
    checkedAt: "2026-05-12T00:00:00.000Z",
    ...overrides
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

  writeRuntimeStamp(rootDir, runtimeContractFixture());
  writeRuntimeLauncher(rootDir);

  const tasksDir = path.join(workspaceKitDir, "tasks");
  await mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, "workspace-kit.db");
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL
);`);
  const emptyTaskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare("INSERT OR REPLACE INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)").run(
    emptyTaskDoc
  );
  db.close();
}

async function replaceDoctorFixtureDbWithV10WorkspaceStatus(rootDir, { sqlitePhase = "67" } = {}) {
  const dbPath = path.join(rootDir, ".workspace-kit", "tasks", "workspace-kit.db");
  try {
    await unlink(dbPath);
  } catch {
    // ignore
  }
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  const taskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare("INSERT OR REPLACE INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)").run(taskDoc);
  db.prepare(
    "UPDATE kit_workspace_status SET current_kit_phase = ?, updated_at = ? WHERE id = 1"
  ).run(sqlitePhase, new Date().toISOString());
  db.close();
}

async function writeSqliteKitConfig(rootDir, kitPhaseNumber) {
  await writeFile(
    path.join(rootDir, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        },
        kit: { currentPhaseNumber: kitPhaseNumber }
      },
      null,
      2
    )
  );
}

function readTaskStoreDoc(rootDir) {
  const dbPath = path.join(rootDir, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    const row = db.prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1").get();
    return JSON.parse(row.task_store_json);
  } finally {
    db.close();
  }
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
  assert.ok(capture.lines.some((l) => l.includes("Command discovery")));
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

test("runCli refresh-context regenerates profile-driven project context artifacts", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-refresh-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCliWithPolicyApproval(["refresh-context"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /regenerated profile-driven project context artifacts/);

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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
  assert.ok(capture.lines.some((l) => l.includes("AGENT-CLI-MAP.md")));
  assert.ok(capture.lines.some((l) => l.includes("Effective task persistence:")));
});

test("runCli doctor --delivery-loop passes when delivery advisory has no triggers", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-del-loop-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor", "--delivery-loop"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.ok(capture.lines.some((l) => /doctor passed/.test(l)));
});

test("runCli doctor --agent-instruction-surface emits JSON catalog", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-surface-"));
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
  assert.equal(payload.data.errorRemediationCatalog?.schemaVersion, 1);
  assert.ok(Array.isArray(payload.data.errorRemediationCatalog?.entries));
});

test("runCli doctor --agent-instruction-surface-lean emits digest projection", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-surface-lean-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor", "--agent-instruction-surface-lean"], {
    cwd: fixtureRoot,
    ...capture
  });

  assert.equal(code, 0);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.data.projection, "lean");
  assert.ok(typeof payload.data.instructionSurfaceDigest === "string");
  assert.ok(payload.data.instructionSurfaceDigest.startsWith("sha256:"));
  assert.equal(payload.data.commandCounts?.total > 0, true);
  assert.equal(payload.data.commands, undefined);
});

test("runCli doctor returns validation failure when required files are missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-missing-"));
  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.match(capture.errors[0], /failed validation/);
  assert.ok(capture.errors.some((l) => l.includes("Next steps:")));
  assert.ok(capture.errors.some((l) => l.includes("workspace-kit init")));
  assert.ok(capture.errors.some((l) => l.includes("--help")));
});

test("runCli doctor prioritizes init repair for partial attach", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-partial-attach-"));
  await createDoctorFixture(fixtureRoot);
  await unlink(path.join(fixtureRoot, ".workspace-kit", "owned-paths.json"));

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  const nextStep = capture.errors.find((l) => l.includes("Partial attach detected"));
  assert.match(nextStep ?? "", /workspace-kit init/);
  assert.match(nextStep ?? "", /workspace-kit init --dry-run/);
  assert.ok((nextStep ?? "").indexOf("workspace-kit init") < (nextStep ?? "").indexOf("workspace-kit upgrade"));
});

test("runCli doctor reports healthy runtime contract details in JSON", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-runtime-ok-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["doctor", "--json"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.runtimeContract.ok, true);
  assert.equal(payload.data.runtimeContract.stampPath, ".workspace-kit/runtime.json");
  assert.equal(payload.data.runtimeContract.launcherPath, ".workspace-kit/bin/wk");
  assert.equal(payload.data.runtimeContract.nodeVersion, "v22.11.0");
  assert.deepEqual(payload.data.runtimeContract.issues, []);
});

test("runCli doctor fails when runtime launcher is missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-runtime-launcher-missing-"));
  await createDoctorFixture(fixtureRoot);
  await unlink(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"));

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.ok(capture.errors.some((line) => line.includes("runtime-launcher-missing")));
  assert.ok(capture.errors.some((line) => line.includes("workspace-kit init --force")));
});

test("runCli doctor catches missing node, wrong major, arch, and ABI drift", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-runtime-stamp-drift-"));
  await createDoctorFixture(fixtureRoot);
  writeRuntimeStamp(
    fixtureRoot,
    runtimeContractFixture({
      nodeExecutable: path.join(fixtureRoot, "missing-node"),
      nodeVersion: "v20.19.0",
      arch: "not-this-arch",
      abi: "0"
    })
  );

  const capture = createCapture();
  const code = await runCli(["doctor", "--json"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  const payload = JSON.parse(capture.lines[0]);
  const codes = payload.data.runtimeContract.issues.map((issue) => issue.code);
  assert.ok(codes.includes("runtime-node-missing"));
  assert.ok(codes.includes("runtime-node-wrong-major"));
  assert.ok(codes.includes("runtime-arch-mismatch"));
  assert.ok(codes.includes("runtime-abi-mismatch"));
});

test("runCli doctor catches runtime SQLite load failure", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-runtime-sqlite-fail-"));
  await createDoctorFixture(fixtureRoot);
  writeRuntimeStamp(fixtureRoot, runtimeContractFixture({ packageRoot: fixtureRoot }));

  const capture = createCapture();
  const code = await runCli(["doctor", "--json"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  const payload = JSON.parse(capture.lines[0]);
  assert.ok(
    payload.data.runtimeContract.issues.some((issue) => issue.code === "runtime-sqlite-load-failed")
  );
});

test("runCli init --dry-run previews plan without writing (minimal package.json)", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-dry-"));
  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "wk-init-dry-fixture", version: "1.0.0", private: true }, null, 2)
  );

  const capture = createCapture();
  const code = await runCli(["init", "--dry-run"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.ok(capture.lines.some((l) => l.includes("dry-run")));
  assert.ok(capture.lines.some((l) => l.includes("Planned paths:")));
});

test("runCli init --dry-run --json emits init-plan envelope", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-dry-json-"));
  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "wk-init-json-fixture", version: "1.0.0", private: true }, null, 2)
  );

  const capture = createCapture();
  const code = await runCli(["init", "--dry-run", "--json"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.ok(capture.lines.length >= 1);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.code, "init-plan");
  assert.ok(payload.data && typeof payload.data === "object");
});

test("runCli init mutates empty workspace and leaves doctor healthy", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-mutating-"));

  const initCapture = createCapture();
  const initCode = await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "integration test"], {
    cwd: fixtureRoot,
    ...initCapture
  });

  assert.equal(initCode, 0);
  assert.match(initCapture.lines[0], /init completed/);
  await readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8");
  await readFile(path.join(fixtureRoot, ".workspace-kit", "manifest.json"), "utf8");
  const runtimeStamp = JSON.parse(await readFile(path.join(fixtureRoot, ".workspace-kit", "runtime.json"), "utf8"));
  assert.equal(runtimeStamp.nodeVersion, "v22.11.0");
  await readFile(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"), "utf8");
  await readFile(path.join(fixtureRoot, ".workspace-kit", "tasks", "workspace-kit.db"), "utf8");

  const doctorCapture = createCapture();
  const doctorCode = await runCli(["doctor", "--json"], { cwd: fixtureRoot, ...doctorCapture });
  assert.equal(doctorCode, 0);
  const doctorPayload = JSON.parse(doctorCapture.lines[0]);
  assert.equal(doctorPayload.ok, true);
  assert.equal(doctorPayload.code, "doctor-contract-ok");
});

test("runCli init --json reports runtime contract artifacts", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-runtime-json-"));
  const capture = createCapture();
  const code = await runCliWithRuntimeContract(
    ["init", "--yes", "--approval-rationale", "runtime json", "--json", "--no-starter-task"],
    { cwd: fixtureRoot, ...capture }
  );

  assert.equal(code, 0);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.code, "init-complete");
  assert.equal(payload.data.runtimeContract.ok, true);
  assert.match(payload.data.runtimeContract.stampPath, /\.workspace-kit\/runtime\.json$/);
  assert.match(payload.data.runtimeContract.launcherPath, /\.workspace-kit\/bin\/wk$/);
});

test("runCli init refuses when the runtime contract is invalid", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-runtime-invalid-"));
  const capture = createCapture();
  const code = await runCliWithRuntimeContract(
    ["init", "--yes", "--approval-rationale", "bad runtime"],
    { cwd: fixtureRoot, ...capture },
    { nodeVersion: "v20.19.0" }
  );

  assert.equal(code, 1);
  assert.ok(capture.errors.some((line) => line.includes("requires a valid runtime contract")));
  assert.ok(capture.errors.some((line) => line.includes("runtime-node-wrong-major")));
  await assert.rejects(readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8"));
  await assert.rejects(readFile(path.join(fixtureRoot, ".workspace-kit", "runtime.json"), "utf8"));
});

test("runCli init without non-interactive approval writes nothing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-no-approval-"));

  const capture = createCapture();
  const code = await runCliWithoutPolicyApproval(["init"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 1);
  assert.ok(capture.errors.some((l) => l.includes("Non-interactive init requires")));
  await assert.rejects(readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8"));
  await assert.rejects(readFile(path.join(fixtureRoot, ".workspace-kit", "manifest.json"), "utf8"));
});

test("runCli init manages starter task defaults and no-starter flag", async () => {
  const defaultRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-starter-"));
  const firstCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "starter default"], {
      cwd: defaultRoot,
      ...firstCapture
    }),
    0
  );

  let taskDoc = readTaskStoreDoc(defaultRoot);
  assert.equal(taskDoc.tasks.filter((t) => t.metadata?.starterTask === true).length, 1);

  const secondCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "starter idempotent"], {
      cwd: defaultRoot,
      ...secondCapture
    }),
    0
  );
  taskDoc = readTaskStoreDoc(defaultRoot);
  assert.equal(taskDoc.tasks.filter((t) => t.metadata?.starterTask === true).length, 1);

  const noStarterRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-no-starter-"));
  const noStarterCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(
      ["init", "--yes", "--approval-rationale", "no starter", "--no-starter-task"],
      { cwd: noStarterRoot, ...noStarterCapture }
    ),
    0
  );
  taskDoc = readTaskStoreDoc(noStarterRoot);
  assert.equal(taskDoc.tasks.filter((t) => t.metadata?.starterTask === true).length, 0);
});

test("runCli start reports before and after attach in text and JSON", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-start-"));

  const beforeCapture = createCapture();
  assert.equal(await runCli(["start"], { cwd: fixtureRoot, ...beforeCapture }), 1);
  assert.ok(beforeCapture.lines.some((l) => l.includes("not attached")));

  const beforeJsonCapture = createCapture();
  assert.equal(await runCli(["start", "--json"], { cwd: fixtureRoot, ...beforeJsonCapture }), 1);
  const beforeJson = JSON.parse(beforeJsonCapture.lines[0]);
  assert.equal(beforeJson.ok, false);
  assert.equal(beforeJson.code, "workspace-start-not-attached");

  const initCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "start after attach"], {
      cwd: fixtureRoot,
      ...initCapture
    }),
    0
  );

  const afterCapture = createCapture();
  assert.equal(await runCli(["start"], { cwd: fixtureRoot, ...afterCapture }), 0);
  assert.ok(afterCapture.lines.some((l) => l.includes("workspace looks healthy")));

  const afterJsonCapture = createCapture();
  assert.equal(await runCli(["start", "--json"], { cwd: fixtureRoot, ...afterJsonCapture }), 0);
  const afterJson = JSON.parse(afterJsonCapture.lines[0]);
  assert.equal(afterJson.ok, true);
  assert.equal(afterJson.data.doctorOk, true);
});

test("runCli init preserves profile on re-init and force repairs kit-owned drift", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-init-preserve-force-"));
  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "package-name-should-not-win", version: "1.0.0" }, null, 2)
  );
  await writeFile(
    path.join(fixtureRoot, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "preserved-profile" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    )
  );

  const initCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "preserve profile"], {
      cwd: fixtureRoot,
      ...initCapture
    }),
    0
  );
  const profileAfterFirstInit = JSON.parse(await readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8"));
  assert.equal(profileAfterFirstInit.project.name, "preserved-profile");

  const pointerPath = path.join(fixtureRoot, ".cursor", "rules", "workspace-kit-profile-pointer.mdc");
  await writeFile(pointerPath, "# drifted pointer\n", "utf8");
  await unlink(path.join(fixtureRoot, ".workspace-kit", "runtime.json"));
  await unlink(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"));

  const reinitCapture = createCapture();
  assert.equal(
    await runCliWithRuntimeContract(["init", "--yes", "--approval-rationale", "force repair", "--force"], {
      cwd: fixtureRoot,
      ...reinitCapture
    }),
    0
  );
  const profileAfterReinit = JSON.parse(await readFile(path.join(fixtureRoot, "workspace-kit.profile.json"), "utf8"));
  assert.equal(profileAfterReinit.project.name, "preserved-profile");

  const pointerAfterForce = await readFile(pointerPath, "utf8");
  assert.doesNotMatch(pointerAfterForce, /drifted pointer/);
  await readFile(path.join(fixtureRoot, ".workspace-kit", "runtime.json"), "utf8");
  await readFile(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"), "utf8");
  const backupDirs = await readdir(path.join(fixtureRoot, ".workspace-kit", "backups"));
  assert.ok(backupDirs.length > 0);
});

test("runCli doctor fails when sqlite persistence configured but DB missing", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-dr-sqlite-miss-"));
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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-dr-sqlite-empty-"));
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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-dr-sqlite-ok-"));
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

test("runCli doctor ignores maintainer YAML for phase drift when SQLite v10 matches config", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-dr-phase-sqlite-yaml-"));
  await createDoctorFixture(fixtureRoot);
  await replaceDoctorFixtureDbWithV10WorkspaceStatus(fixtureRoot, { sqlitePhase: "67" });
  await writeSqliteKitConfig(fixtureRoot, 67);
  const yamlDir = path.join(fixtureRoot, "docs", "maintainers", "data");
  await mkdir(yamlDir, { recursive: true });
  await writeFile(
    path.join(yamlDir, "workspace-kit-status.yaml"),
    'current_kit_phase: "99"\nnext_kit_phase: "100"\n'
  );

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
});

test("runCli doctor passes when kit.currentPhaseNumber disagrees with kit_workspace_status (advisory only)", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-dr-phase-sqlite-mismatch-"));
  await createDoctorFixture(fixtureRoot);
  await replaceDoctorFixtureDbWithV10WorkspaceStatus(fixtureRoot, { sqlitePhase: "67" });
  await writeSqliteKitConfig(fixtureRoot, 68);

  const capture = createCapture();
  const code = await runCli(["doctor"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /doctor passed/);
  const joined = capture.lines.join("\n");
  assert.ok(
    joined.includes("differs from kit_workspace_status"),
    "expected doctor summary to note config vs SQLite drift"
  );
});

test("runCli check validates profile baseline fields", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-check-pass-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["check"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /check passed/);
});

test("runCli check returns validation failure for invalid profile values", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-check-fail-"));
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

test("runCli refresh-context updates generated project context after profile name changes", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-refresh-update-"));
  await createDoctorFixture(fixtureRoot);

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

  const capture = createCapture();
  const code = await runCliWithPolicyApproval(["refresh-context"], { cwd: fixtureRoot, ...capture });
  assert.equal(code, 0);

  const generatedRule = await readFile(
    path.join(fixtureRoot, ".cursor", "rules", "workspace-kit-project-context.mdc"),
    "utf8"
  );
  assert.match(generatedRule, /project_name: renamed-pilot-project/);
  assert.doesNotMatch(generatedRule, /project_name: fixture-project/);
});

test("runCli upgrade overwrites kit-owned assets and preserves profile", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-upgrade-"));
  await createDoctorFixture(fixtureRoot);
  const runtimeStampBefore = await readFile(path.join(fixtureRoot, ".workspace-kit", "runtime.json"), "utf8");

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
  await writeFile(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"), "#!/bin/sh\necho drifted\n", "utf8");
  await chmod(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"), 0o644);

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
  const runtimeStampAfter = await readFile(path.join(fixtureRoot, ".workspace-kit", "runtime.json"), "utf8");
  assert.equal(runtimeStampAfter, runtimeStampBefore);
  const runtimeLauncher = await readFile(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"), "utf8");
  assert.match(runtimeLauncher, /exec "\$node_executable" "\$cli_path" "\$@"/);
  const runtimeLauncherMode = (await stat(path.join(fixtureRoot, ".workspace-kit", "bin", "wk"))).mode;
  assert.notEqual(runtimeLauncherMode & 0o111, 0);

  const backupRoot = path.join(fixtureRoot, ".workspace-kit", "backups");
  const backupDirs = await readdir(backupRoot);
  assert.ok(backupDirs.length > 0);
});

test("runCli upgrade returns validation failure for invalid profile", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-upgrade-fail-"));
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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-drift-pass-"));
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
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-drift-fail-"));
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

test("runCli drift-check detects missing and corrupt runtime launcher artifacts", async () => {
  const missingRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-drift-runtime-launcher-missing-"));
  await createDoctorFixture(missingRoot);
  assert.equal(await runCliWithPolicyApproval(["upgrade"], { cwd: missingRoot, ...createCapture() }), 0);
  await unlink(path.join(missingRoot, ".workspace-kit", "bin", "wk"));

  const missingCapture = createCapture();
  const missingCode = await runCli(["drift-check"], { cwd: missingRoot, ...missingCapture });
  assert.equal(missingCode, 1);
  assert.ok(missingCapture.errors.some((line) => line.includes(".workspace-kit/bin/wk: missing")));

  const corruptRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-drift-runtime-launcher-corrupt-"));
  await createDoctorFixture(corruptRoot);
  assert.equal(await runCliWithPolicyApproval(["upgrade"], { cwd: corruptRoot, ...createCapture() }), 0);
  await writeFile(path.join(corruptRoot, ".workspace-kit", "bin", "wk"), "#!/bin/sh\necho nope\n", "utf8");
  await chmod(path.join(corruptRoot, ".workspace-kit", "bin", "wk"), 0o644);

  const corruptCapture = createCapture();
  const corruptCode = await runCli(["drift-check"], { cwd: corruptRoot, ...corruptCapture });
  assert.equal(corruptCode, 1);
  assert.ok(corruptCapture.errors.some((line) => line.includes(".workspace-kit/bin/wk: content drift detected")));
  assert.ok(corruptCapture.errors.some((line) => line.includes(".workspace-kit/bin/wk: not executable")));
});

test("runCli drift-check validates runtime stamp without content-locking environment identity", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-drift-runtime-stamp-"));
  await createDoctorFixture(fixtureRoot);
  assert.equal(await runCliWithPolicyApproval(["upgrade"], { cwd: fixtureRoot, ...createCapture() }), 0);
  writeRuntimeStamp(fixtureRoot, runtimeContractFixture({ arch: process.arch, abi: "999" }));

  const safeCapture = createCapture();
  const safeCode = await runCli(["drift-check"], { cwd: fixtureRoot, ...safeCapture });
  assert.equal(safeCode, 0);

  writeRuntimeStamp(fixtureRoot, runtimeContractFixture({ nodeVersion: "v20.19.0" }));
  const driftCapture = createCapture();
  const driftCode = await runCli(["drift-check"], { cwd: fixtureRoot, ...driftCapture });
  assert.equal(driftCode, 1);
  assert.ok(driftCapture.errors.some((line) => line.includes("runtime-node-wrong-major")));
});

test("runCli detach --dry-run lists owned paths without deleting files", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-detach-dry-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["detach", "--dry-run"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  assert.match(capture.lines[0], /detach \(dry-run\)/);
  assert.ok(capture.lines.some((l) => l.includes("workspace-kit.profile.json")));
  assert.ok(capture.lines.some((l) => l.includes(".workspace-kit/manifest.json")));
  await readFile(path.join(fixtureRoot, ".workspace-kit", "manifest.json"), "utf8");
});

test("runCli detach --dry-run --json emits a valid plan envelope", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-detach-json-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["detach", "--dry-run", "--json"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 0);
  const payload = JSON.parse(capture.lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.code, "detach-plan");
  assert.equal(payload.data.dryRun, true);
  assert.equal(payload.data.deletionEnabled, false);
  assert.ok(payload.data.ownedPaths.includes("workspace-kit.profile.json"));
});

test("runCli detach without dry-run does not delete files", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-detach-preview-only-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["detach"], { cwd: fixtureRoot, ...capture });

  assert.equal(code, 2);
  assert.ok(capture.errors.some((l) => l.includes("preview-only")));
  assert.ok(capture.errors.some((l) => l.includes("No files changed")));
  await readFile(path.join(fixtureRoot, ".workspace-kit", "manifest.json"), "utf8");
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

test("runCli run --json emits machine command catalog", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "--json"], { cwd: process.cwd(), ...capture });
  assert.equal(code, 0);
  assert.equal(capture.lines.length, 1);
  const output = JSON.parse(capture.lines[0]);
  assert.equal(output.ok, true);
  assert.equal(output.code, "run-command-catalog");
  assert.equal(output.schemaVersion, 1);
  assert.ok(Array.isArray(output.data?.commands));
  assert.ok(output.data.commands.some((c) => c.name === "list-tasks"));
  const row = output.data.commands.find((c) => c.name === "run-transition");
  assert.ok(row);
  assert.equal(typeof row.jsonApprovalRequired, "boolean");
  assert.ok(row.instructionPath?.includes("run-transition.md"));
});

test("runCli doctor --json emits contract-ok envelope", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-doctor-json-"));
  await createDoctorFixture(fixtureRoot);
  const capture = createCapture();
  const code = await runCli(["doctor", "--json"], { cwd: fixtureRoot, ...capture });
  assert.equal(code, 0);
  assert.equal(capture.lines.length, 1);
  const output = JSON.parse(capture.lines[0]);
  assert.equal(output.ok, true);
  assert.equal(output.code, "doctor-contract-ok");
  assert.equal(output.schemaVersion, 1);
  assert.ok(Array.isArray(output.data?.summaryText));
  assert.ok(output.data.summaryText.some((s) => /doctor passed/.test(s)));
});

test("runCli run dispatches generate-document with dryRun", async () => {
  const capture = createCapture();
  const code = await runCli(
    ["run", "generate-document", '{"documentType":"AGENTS.md","options":{"dryRun":true,"overwriteAi":true}}'],
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

test("runCli run dispatches agent-bootstrap", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-agent-bootstrap-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(["run", "agent-bootstrap", "{}"], { cwd: fixtureRoot, ...capture });
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "agent-bootstrap");
  assert.equal(output.data?.doctor?.ok, true);
  assert.ok(typeof output.data?.planningGeneration === "number");
  assert.ok(typeof output.data?.cliFootguns?.discovery?.commandMenuJson === "string");
  assert.equal(output.data?.instructionSurface, undefined);
  assert.equal(output.data?.maintainerDelivery?.schemaVersion, 1);
  assert.ok(Array.isArray(output.data?.maintainerDelivery?.inProgressTasks));
});

test("runCli run agent-bootstrap projection lean includes instruction surface digest", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-test-agent-bootstrap-lean-"));
  await createDoctorFixture(fixtureRoot);

  const capture = createCapture();
  const code = await runCli(
    ["run", "agent-bootstrap", JSON.stringify({ projection: "lean" })],
    { cwd: fixtureRoot, ...capture }
  );
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.data?.instructionSurface?.projection, "lean");
  assert.ok(typeof output.data?.instructionSurface?.instructionSurfaceDigest === "string");
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
  assert.equal(output.code, "invalid-run-args");
  assert.ok(Array.isArray(output.details?.errors));
  assert.equal(
    output.remediation?.instructionPath,
    "src/modules/task-engine/instructions/run-transition.md"
  );
});

test("runCli run returns error for invalid JSON args", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "generate-document", "not-json"], { cwd: process.cwd(), ...capture });
  assert.equal(code, 2);
  assert.ok(capture.errors.some((e) => e.includes("Invalid JSON")));
});

test("runCli run unknown subcommand emits JSON with remediation (not stderr dump)", async () => {
  const capture = createCapture();
  const code = await runCli(
    ["run", "__not_a_real_workspace_kit_command__", "{}"],
    { cwd: process.cwd(), ...capture }
  );
  assert.equal(code, 1);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, false);
  assert.equal(output.code, "unknown-command");
  assert.match(output.message, /Sample of/);
  assert.ok(output.remediation?.docPath?.includes("AGENT-CLI-MAP.md"));
});

test("runCli run pilot command --schema-only emits schema payload", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "dashboard-summary", "--schema-only"], {
    cwd: process.cwd(),
    ...capture
  });
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "run-args-schema");
  assert.equal(output.command, "dashboard-summary");
  assert.equal(output.schemaSource, "pilot-run-args-snapshot");
  assert.ok(output.schema && typeof output.schema === "object");
  assert.deepEqual(output.sampleArgs, {});
  assert.equal(output.policy.sensitivity, "non-sensitive");
  assert.equal(output.idempotency.clientMutationId, false);
});

test("runCli run non-pilot command --schema-only emits permissive manifest payload", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "explain-config", "--schema-only"], {
    cwd: process.cwd(),
    ...capture
  });
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "run-args-schema");
  assert.equal(output.command, "explain-config");
  assert.equal(output.schemaSource, "manifest-permissive-fallback");
  assert.equal(output.schema.additionalProperties, true);
  assert.equal(output.moduleId, "workspace-config");
  assert.equal(output.instructionPath, "src/modules/workspace-config/instructions/explain-config.md");
  assert.equal(output.policy.sensitivity, "non-sensitive");
  assert.ok(output.examples[0].argv.includes("workspace-kit run explain-config"));
});

test("runCli run --schema-only succeeds for every listed executable command", async () => {
  const catalogCapture = createCapture();
  const catalogCode = await runCli(["run"], { cwd: process.cwd(), ...catalogCapture });
  assert.equal(catalogCode, 0);
  const commandNames = catalogCapture.lines
    .map((line) => /^  ([^ ]+) \(/.exec(line)?.[1])
    .filter(Boolean);
  assert.ok(commandNames.length > 0);

  for (const commandName of commandNames) {
    const capture = createCapture();
    const code = await runCli(["run", commandName, "--schema-only"], {
      cwd: process.cwd(),
      ...capture
    });
    assert.equal(code, 0, `${commandName}: ${capture.lines.join("\n") || capture.errors.join("\n")}`);
    const output = JSON.parse(capture.lines.join(""));
    assert.equal(output.ok, true, commandName);
    assert.equal(output.code, "run-args-schema", commandName);
    assert.equal(output.command, commandName);
    assert.ok(output.schema && typeof output.schema === "object", commandName);
    assert.ok(output.sampleArgs && typeof output.sampleArgs === "object", commandName);
    assert.ok(output.instructionPath, commandName);
    assert.ok(output.policy && typeof output.policy === "object", commandName);
    assert.ok(output.planningGeneration && typeof output.planningGeneration === "object", commandName);
    assert.ok(Array.isArray(output.examples) && output.examples.length > 0, commandName);
  }
});

test("runCli run persist-planning-execution-drafts --schema-only emits working batch shorthand sample", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "persist-planning-execution-drafts", "--schema-only"], {
    cwd: process.cwd(),
    ...capture
  });
  assert.equal(code, 0);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.command, "persist-planning-execution-drafts");
  assert.equal(output.sampleArgs.targetPhaseKey, "73");
  assert.equal(output.sampleArgs.targetPhase, "Phase 73");
  assert.equal(output.sampleArgs.desiredStatus, "ready");
  assert.equal(output.sampleArgs.tasks.length, 1);
  assert.equal(Object.hasOwn(output.sampleArgs.tasks[0], "phase"), false);
});

test("runCli run run-transition --schema-only exposes runtime action enum", async () => {
  const capture = createCapture();
  const code = await runCli(["run", "run-transition", "--schema-only"], {
    cwd: process.cwd(),
    ...capture
  });
  assert.equal(code, 0, capture.errors.join("\n"));
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.deepEqual(output.schema.properties.action.enum, [
    "accept",
    "block",
    "cancel",
    "complete",
    "decline",
    "demote",
    "pause",
    "reject",
    "start",
    "unblock"
  ]);
  assert.equal(output.schema.properties.clientMutationId.type, "string");
  assert.equal(output.sampleArgs.action, "accept");
});
