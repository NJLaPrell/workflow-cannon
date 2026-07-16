import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (workspace-kit package) for native better-sqlite3 probes — temp stubs make every Node fail equally. */
function workspaceKitRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

import {
  CommandClient,
  classifyNativeSqliteErrorMessage,
  formatNodeExecutableDiagnostics,
  inspectNodeExecutableCandidates,
  parseRunCommandOutput,
  pickNodeExecutable,
  resolveCliJs,
  resolveRuntimeStampExecutionPlan
} from "../dist/runtime/command-client.js";

function writeFakeNode(filePath, version, body = "exit 0") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `#!/bin/sh
if [ "$1" = "-p" ]; then
  echo '{"version":"v${version}","arch":"arm64","platform":"darwin","execPath":"${filePath}","modules":"127"}'
  exit 0
fi
${body}
`,
    { mode: 0o755 }
  );
}

test("pickNodeExecutable uses resolver path when it exists", () => {
  const picked = pickNodeExecutable(() => process.execPath);
  assert.equal(picked, process.execPath);
});

test("pickNodeExecutable falls through when resolver path is bogus", () => {
  const picked = pickNodeExecutable(() => "/__no_such__/node");
  assert.notEqual(picked, "/__no_such__/node");
});

test("pickNodeExecutable ignores attached workspace Node markers and discovers Workflow Cannon Node 22", () => {
  const oldHome = process.env.HOME;
  const oldNvmDir = process.env.NVM_DIR;
  const oldNvmBin = process.env.NVM_BIN;
  const oldWorkspaceKitNode = process.env.WORKSPACE_KIT_NODE;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-node-pick-"));
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const workspaceRoot = path.join(tempRoot, "workspace");
    const node18 = path.join(process.env.NVM_DIR, "versions", "node", "v18.19.0", "bin", "node");
    const node22 = path.join(process.env.NVM_DIR, "versions", "node", "v22.22.2", "bin", "node");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    writeFakeNode(node18, "18.19.0");
    writeFakeNode(node22, "22.22.2");
    fs.writeFileSync(path.join(workspaceRoot, ".nvmrc"), "18\n");

    assert.equal(pickNodeExecutable(undefined, workspaceRoot), node22);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = oldNvmDir;
    if (oldNvmBin === undefined) delete process.env.NVM_BIN;
    else process.env.NVM_BIN = oldNvmBin;
    if (oldWorkspaceKitNode === undefined) delete process.env.WORKSPACE_KIT_NODE;
    else process.env.WORKSPACE_KIT_NODE = oldWorkspaceKitNode;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resolveCliJs prefers extension-packaged workspace-kit over attached workspace package", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-cli-resolve-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspace");
    const extensionRoot = path.join(tempRoot, "extension");
    const workspaceCli = path.join(
      workspaceRoot,
      "node_modules",
      "@workflow-cannon",
      "workspace-kit",
      "dist",
      "cli.js"
    );
    const extensionCli = path.join(
      extensionRoot,
      "node_modules",
      "@workflow-cannon",
      "workspace-kit",
      "dist",
      "cli.js"
    );
    fs.mkdirSync(path.dirname(workspaceCli), { recursive: true });
    fs.mkdirSync(path.dirname(extensionCli), { recursive: true });
    fs.writeFileSync(workspaceCli, "// workspace cli\n");
    fs.writeFileSync(extensionCli, "// extension cli\n");

    assert.equal(resolveCliJs(workspaceRoot, undefined, extensionRoot), extensionCli);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resolveRuntimeStampExecutionPlan prefers canonical workspace launcher", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-runtime-plan-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspace");
    const packageRoot = path.join(tempRoot, "package");
    const nodePath = path.join(tempRoot, "node22");
    const launcherPath = path.join(workspaceRoot, ".workspace-kit", "bin", "wk");
    fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
    fs.writeFileSync(nodePath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(path.join(packageRoot, "dist", "cli.js"), "// cli\n");
    fs.writeFileSync(launcherPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(
      path.join(workspaceRoot, ".workspace-kit", "runtime.json"),
      JSON.stringify({ schemaVersion: 1, nodeExecutable: nodePath, packageRoot }, null, 2)
    );

    const plan = resolveRuntimeStampExecutionPlan(workspaceRoot);
    assert.equal(plan.kind, "launcher");
    assert.equal(plan.executable, launcherPath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("CommandClient defaults to stamped launcher before Node probing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-runtime-client-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspace");
    const packageRoot = path.join(tempRoot, "package");
    const nodePath = path.join(tempRoot, "node22");
    const capturePath = path.join(tempRoot, "argv.json");
    const launcherPath = path.join(workspaceRoot, ".workspace-kit", "bin", "wk");
    fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
    fs.writeFileSync(nodePath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(path.join(packageRoot, "dist", "cli.js"), "// cli\n");
    fs.writeFileSync(path.join(workspaceRoot, ".nvmrc"), "18\n");
    fs.writeFileSync(
      launcherPath,
      `#!/bin/sh\nprintf '{"ok":true,"data":{"argv":["%s","%s","%s"]}}\n' "$1" "$2" "$3"\nprintf '%s\n' "$*" > ${JSON.stringify(capturePath)}\n`,
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(workspaceRoot, ".workspace-kit", "runtime.json"),
      JSON.stringify({ schemaVersion: 1, nodeExecutable: nodePath, nodeVersion: "v22.11.0", packageRoot }, null, 2)
    );

    const client = new CommandClient(workspaceRoot, { resolveNodeExecutable: () => "/__must_not_be_used__/node" });
    const out = await client.run("dashboard-summary", {});

    assert.equal(out.ok, true);
    assert.deepEqual(out.data.argv, ["run", "dashboard-summary", "{}"]);
    assert.equal(fs.readFileSync(capturePath, "utf8").trim(), "run dashboard-summary {}");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("CommandClient falls back to stamped Node from runtime stamp when launcher is absent", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-runtime-stamped-node-client-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspace");
    const packageRoot = path.join(tempRoot, "package");
    const nodePath = path.join(tempRoot, "node22");
    const capturePath = path.join(tempRoot, "argv.txt");
    const cliPath = path.join(packageRoot, "dist", "cli.js");
    fs.mkdirSync(path.join(workspaceRoot, ".workspace-kit"), { recursive: true });
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.writeFileSync(cliPath, "// cli\n");
    fs.writeFileSync(path.join(workspaceRoot, ".nvmrc"), "18\n");
    fs.writeFileSync(
      nodePath,
      `#!/bin/sh\nprintf '%s\n' "$@" > ${JSON.stringify(capturePath)}\nprintf '{"ok":true,"code":"tasks-listed"}\n'\n`,
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(workspaceRoot, ".workspace-kit", "runtime.json"),
      JSON.stringify({ schemaVersion: 1, nodeExecutable: nodePath, nodeVersion: "v22.11.0", packageRoot }, null, 2)
    );

    const client = new CommandClient(workspaceRoot, { resolveNodeExecutable: () => "/__must_not_be_used__/node" });
    const out = await client.run("list-tasks", {});

    assert.equal(out.ok, true);
    assert.equal(out.code, "tasks-listed");
    const captured = fs.readFileSync(capturePath, "utf8");
    assert.match(captured, /dist\/cli\.js/);
    assert.match(captured, /run\nlist-tasks\n\{\}/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("CommandClient returns structured diagnostics for a broken runtime stamp", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-runtime-broken-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspace");
    fs.mkdirSync(path.join(workspaceRoot, ".workspace-kit"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, ".workspace-kit", "runtime.json"), "{not json", "utf8");

    const client = new CommandClient(workspaceRoot, { resolveNodeExecutable: () => process.execPath });
    const out = await client.run("dashboard-summary", {});

    assert.equal(out.ok, false);
    assert.equal(out.code, "extension-runtime-stamp-invalid");
    assert.match(out.message, /Runtime stamp is not valid JSON/);
    assert.match(out.remediation.command, /workspace-kit init --force/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pickNodeExecutable skips native-incompatible resolver candidate", () => {
  const oldHome = process.env.HOME;
  const oldNvmDir = process.env.NVM_DIR;
  const oldNvmBin = process.env.NVM_BIN;
  const oldWorkspaceKitNode = process.env.WORKSPACE_KIT_NODE;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-node-native-"));
  const repoRoot = workspaceKitRepoRoot();
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const badNode = path.join(tempRoot, "bad-node");
    fs.writeFileSync(badNode, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    assert.notEqual(pickNodeExecutable(() => badNode, repoRoot), badNode);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = oldNvmDir;
    if (oldNvmBin === undefined) delete process.env.NVM_BIN;
    else process.env.NVM_BIN = oldNvmBin;
    if (oldWorkspaceKitNode === undefined) delete process.env.WORKSPACE_KIT_NODE;
    else process.env.WORKSPACE_KIT_NODE = oldWorkspaceKitNode;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pickNodeExecutable probes installed workspace-kit package root for native dependency", () => {
  const oldHome = process.env.HOME;
  const oldNvmDir = process.env.NVM_DIR;
  const oldNvmBin = process.env.NVM_BIN;
  const oldWorkspaceKitNode = process.env.WORKSPACE_KIT_NODE;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-node-package-native-"));
  const repoRoot = workspaceKitRepoRoot();
  const workspaceKitPackage = path.join(repoRoot, "node_modules", "@workflow-cannon", "workspace-kit");
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const badNode = path.join(tempRoot, "bad-node");
    fs.writeFileSync(badNode, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    assert.ok(fs.existsSync(path.join(repoRoot, "node_modules", "better-sqlite3")), "repo must have better-sqlite3 for native probe");
    assert.notEqual(pickNodeExecutable(() => badNode, repoRoot, [workspaceKitPackage]), badNode);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = oldNvmDir;
    if (oldNvmBin === undefined) delete process.env.NVM_BIN;
    else process.env.NVM_BIN = oldNvmBin;
    if (oldWorkspaceKitNode === undefined) delete process.env.WORKSPACE_KIT_NODE;
    else process.env.WORKSPACE_KIT_NODE = oldWorkspaceKitNode;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("classifyNativeSqliteErrorMessage detects macOS architecture mismatch", () => {
  const kind = classifyNativeSqliteErrorMessage(
    "dlopen(better_sqlite3.node): mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')"
  );
  assert.equal(kind, "architecture-mismatch");
});

test("inspectNodeExecutableCandidates captures native probe failures", () => {
  const oldHome = process.env.HOME;
  const oldNvmDir = process.env.NVM_DIR;
  const oldNvmBin = process.env.NVM_BIN;
  const oldWorkspaceKitNode = process.env.WORKSPACE_KIT_NODE;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-node-diagnostics-"));
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const badNode = path.join(tempRoot, "bad-node");
    fs.writeFileSync(
      badNode,
      `#!/bin/sh
if [ "$1" = "-p" ]; then
  echo '{"version":"v22.0.0","arch":"x64","platform":"darwin","execPath":"/tmp/bad-node","modules":"127"}'
  exit 0
fi
echo "dlopen(better_sqlite3.node): mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')" >&2
exit 1
`,
      { mode: 0o755 }
    );
    fs.mkdirSync(path.join(tempRoot, "node_modules", "better-sqlite3"), { recursive: true });

    const diagnostics = inspectNodeExecutableCandidates(() => badNode, tempRoot);
    assert.equal(diagnostics[0].path, badNode);
    assert.equal(diagnostics[0].arch, "x64");
    assert.equal(diagnostics[0].nativeSqlite.ok, false);
    assert.equal(diagnostics[0].nativeSqlite.kind, "architecture-mismatch");
    assert.match(formatNodeExecutableDiagnostics(diagnostics), /WORKSPACE_KIT_NODE|workflowCannon\.nodeExecutable/);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = oldNvmDir;
    if (oldNvmBin === undefined) delete process.env.NVM_BIN;
    else process.env.NVM_BIN = oldNvmBin;
    if (oldWorkspaceKitNode === undefined) delete process.env.WORKSPACE_KIT_NODE;
    else process.env.WORKSPACE_KIT_NODE = oldWorkspaceKitNode;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("parseRunCommandOutput parses valid JSON", () => {
  const out = parseRunCommandOutput('{"ok":true,"code":"tasks-listed"}', 0);
  assert.equal(out.ok, true);
  assert.equal(out.code, "tasks-listed");
});

test("parseRunCommandOutput parses pretty-printed JSON", () => {
  const out = parseRunCommandOutput('{\n  "ok": true,\n  "code": "tasks-listed"\n}\n', 0);
  assert.equal(out.ok, true);
  assert.equal(out.code, "tasks-listed");
});

test("parseRunCommandOutput returns parse error on malformed output", () => {
  const out = parseRunCommandOutput("not-json", 1);
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-json-parse");
});

test("parseRunCommandOutput includes stderr when stdout is empty", () => {
  const out = parseRunCommandOutput("", 1, "SyntaxError: Unexpected token 'with'");
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-json-parse");
  assert.match(out.message, /stderr: SyntaxError/);
  assert.match(out.details.stderr, /Unexpected token/);
});

test("parseRunCommandOutput returns timeout error when child was SIGTERM'd by exec timeout", () => {
  const out = parseRunCommandOutput(
    "",
    1,
    'unknown format "date-time" ignored in schema at path "#/properties/recordedAt"',
    { timedOut: true }
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-cli-timeout");
  assert.match(out.message, /timeout/i);
  assert.match(out.message, /create-idea/i);
  assert.doesNotMatch(out.message, /dashboard-summary/);
});

test("parseRunCommandOutput formats dashboard-summary timeout remediation by projection", () => {
  for (const projection of ["overview", "queue", "status"]) {
    const out = parseRunCommandOutput("", 1, "", {
      timedOut: true,
      commandName: "dashboard-summary",
      commandArgs: { projection }
    });
    const cleanInvocations = out.remediation.cleanInvocations.join("\n");
    assert.equal(out.ok, false);
    assert.equal(out.code, "extension-cli-timeout");
    assert.match(out.message, new RegExp(`dashboard-summary projection=${projection}`));
    assert.match(
      cleanInvocations,
      new RegExp(`pnpm exec wk run dashboard-summary '\\{"projection":"${projection}"\\}'`)
    );
    assert.doesNotMatch(out.message, /create-idea/);
    assert.doesNotMatch(cleanInvocations, /create-idea/);
  }
});

test("CommandClient.run passes command context to timeout remediation", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "",
      timedOut: true
    })
  });
  const out = await client.runForDashboardPaint(
    "dashboard-summary",
    { projection: "overview" },
    { bootstrap: true }
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-cli-timeout");
  assert.match(out.message, /dashboard-summary projection=overview/);
  assert.doesNotMatch(out.message, /create-idea/);
  assert.deepEqual(out.details.commandArgs, { projection: "overview" });
});

test("kitRunTimeoutMsForCommand gives mutations more time than refresh reads", async () => {
  const {
    kitRunTimeoutMsForCommand,
    KIT_MUTATION_RUN_TIMEOUT_MS,
    KIT_REFRESH_RUN_TIMEOUT_MS,
    isKitRefreshRunCommand,
    kitRefreshCoalesceKey
  } = await import("../dist/runtime/kit-refresh-run-commands.js");
  assert.equal(kitRunTimeoutMsForCommand("create-idea"), KIT_MUTATION_RUN_TIMEOUT_MS);
  assert.equal(kitRunTimeoutMsForCommand("dashboard-summary"), KIT_REFRESH_RUN_TIMEOUT_MS);
  assert.equal(isKitRefreshRunCommand("dashboard-bootstrap-slices"), true);
  assert.equal(kitRunTimeoutMsForCommand("dashboard-bootstrap-slices"), KIT_REFRESH_RUN_TIMEOUT_MS);
  assert.equal(
    kitRefreshCoalesceKey("dashboard-bootstrap-slices", { slices: ["queue", "overview"] }),
    "dashboard-bootstrap-slices:overview,queue"
  );
  assert.ok(KIT_MUTATION_RUN_TIMEOUT_MS > KIT_REFRESH_RUN_TIMEOUT_MS);
});

test("parseRunCommandOutput remediates pnpm banner contamination", () => {
  const out = parseRunCommandOutput(
    `> @workflow-cannon/workspace-kit@0.73.0 wk /repo
> node dist/cli.js run list-tasks '{}'

{"ok":true}`,
    0
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-json-parse");
  assert.equal(out.details.suspectedPackageManagerBanner, true);
  assert.match(out.message, /pnpm exec wk|node dist\/cli\.js/);
});

test("CommandClient.run handles non-zero with valid JSON payload", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => ({
      exitCode: 1,
      stdout: '{"ok":false,"code":"policy-denied","operationId":"tasks.run-transition"}',
      stderr: ""
    })
  });
  const out = await client.run("run-transition", { taskId: "T1", action: "start" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "policy-denied");
  assert.equal(out.operationId, "tasks.run-transition");
});

test("CommandClient.run returns native SQLite remediation when CLI stderr has native load failure", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-client-native-"));
  try {
    const client = new CommandClient(tempRoot, {
      resolveNodeExecutable: () => process.execPath,
      execFn: async () => ({
        exitCode: 1,
        stdout: "",
        stderr:
          "dlopen(better_sqlite3.node): mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')"
      })
    });
    const out = await client.run("dashboard-summary", {});
    assert.equal(out.ok, false);
    assert.equal(out.code, "extension-native-sqlite-runtime-incompatible");
    assert.match(out.message, /workflowCannon\.nodeExecutable|WORKSPACE_KIT_NODE/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("CommandClient.config returns execution error as stderr", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => {
      throw new Error("ENOENT workspace-kit");
    }
  });
  const out = await client.config(["validate"]);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /ENOENT/);
});

test("CommandClient uses cliPathOverride when provided", async () => {
  const fakeCli = path.join(process.cwd(), "dist", "cli.js");
  const client = new CommandClient("/tmp/noop", {
    cliPathOverride: fakeCli,
    execFn: async (_root, args) => ({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, data: { argv: args } }),
      stderr: ""
    })
  });
  const out = await client.run("list-tasks", {});
  assert.equal(out.ok, true);
});

test("CommandClient.recordActivity invokes set-agent-activity best-effort", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: "agent-activity-set" }), stderr: "" };
    }
  });

  await client.recordActivity({ kind: "planning", command: "build-plan", details: { planningType: "change" } });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ["run", "set-agent-activity"]);
  const payload = JSON.parse(calls[0][2]);
  assert.equal(payload.kind, "planning");
  assert.equal(payload.command, "build-plan");
  assert.equal(payload.source, "vscode-extension");
});

test("CommandClient.recordActivity merges activity envelope defaults", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    activityEnvelopeProvider: () => ({
      agentId: "cursor-orchestrator",
      sessionId: "sess-1",
      agentDefinitionId: "orchestrator",
      modelHint: "composer-2.5",
      thinkingLevel: "high"
    }),
    execFn: async (_root, args) => {
      calls.push(args);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: "agent-activity-set" }), stderr: "" };
    }
  });

  await client.recordActivity({ kind: "working_task", taskId: "T1" });
  const payload = JSON.parse(calls[0][2]);
  assert.equal(payload.agentId, "cursor-orchestrator");
  assert.equal(payload.sessionId, "sess-1");
  assert.equal(payload.agentDefinitionId, "orchestrator");
  assert.equal(payload.modelHint, "composer-2.5");
  assert.equal(payload.thinkingLevel, "high");
  assert.equal(payload.taskId, "T1");
});

test("CommandClient.run serializes concurrent kit invocations", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const order = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const cmd = args[1];
      order.push(cmd);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: cmd }), stderr: "" };
    }
  });
  await Promise.all([
    client.run("clear-task-phase", { taskId: "T1" }),
    client.run("clear-task-phase", { taskId: "T2" }),
    client.run("dashboard-summary", {})
  ]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(order, ["clear-task-phase", "clear-task-phase", "dashboard-summary"]);
});

test("CommandClient.setRefreshPaused skips refresh kit reads without enqueueing CLI", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args[1]);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  client.setRefreshPaused(true);
  const [summary, transition] = await Promise.all([
    client.run("dashboard-summary", {}),
    client.run("run-transition", { taskId: "T1", action: "accept" })
  ]);
  assert.equal(summary.ok, false);
  assert.equal(summary.code, "extension-refresh-paused");
  assert.equal(transition.ok, true);
  assert.equal(transition.code, "run-transition");
  assert.deepEqual(calls, ["run-transition"]);
  client.setRefreshPaused(false);
  const after = await client.run("list-phase-notes", {});
  assert.equal(after.ok, true);
  assert.deepEqual(calls, ["run-transition", "list-phase-notes"]);
});

test("CommandClient.setRefreshPaused skips refresh work already queued before pause", async () => {
  const calls = [];
  let releaseFirstSummary;
  const firstSummaryGate = new Promise((resolve) => {
    releaseFirstSummary = resolve;
  });
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      const cmd = args[1];
      calls.push(cmd);
      if (cmd === "dashboard-summary" && calls.filter((c) => c === "dashboard-summary").length === 1) {
        await firstSummaryGate;
      }
      await new Promise((r) => setTimeout(r, 5));
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: cmd }), stderr: "" };
    }
  });
  const summary1 = client.run("dashboard-summary", { pass: 1 });
  const summary2 = client.run("dashboard-summary", { pass: 2 });
  await new Promise((r) => setTimeout(r, 0));
  client.setRefreshPaused(true);
  releaseFirstSummary();
  const transition = client.run("run-transition", { taskId: "T100442", action: "accept" });
  const [s1, s2, t] = await Promise.all([summary1, summary2, transition]);
  assert.equal(s1.ok, true);
  assert.equal(s2.ok, true);
  assert.equal(t.ok, true);
  assert.equal(t.code, "run-transition");
  assert.deepEqual(calls, ["dashboard-summary", "run-transition"]);
});

test("CommandClient.setRefreshPaused skips newly enqueued refresh after pause", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args[1]);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  client.setRefreshPaused(true);
  const summary = await client.run("list-phase-notes", {});
  assert.equal(summary.ok, false);
  assert.equal(summary.code, "extension-refresh-paused");
  assert.deepEqual(calls, []);
});

test("CommandClient treats preempted in-flight refresh as paused", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      const cmd = args[1];
      if (cmd === "dashboard-summary") {
        return { exitCode: 1, stdout: "", stderr: "", preempted: true };
      }
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: cmd }), stderr: "" };
    }
  });
  const summary = await client.run("dashboard-summary", {});
  assert.equal(summary.ok, false);
  assert.equal(summary.code, "extension-refresh-paused");
});

test("isKitRefreshRunAborted treats empty stdout json-parse as refresh abort", async () => {
  const { isKitRefreshRunAborted, isLostKitCliOutput } = await import(
    "../dist/runtime/kit-refresh-run-commands.js"
  );
  assert.equal(
    isLostKitCliOutput({
      ok: false,
      code: "extension-json-parse",
      message: "exit 1; capture full stdout and JSON.parse the whole value; stdout: "
    }),
    true
  );
  assert.equal(
    isKitRefreshRunAborted({
      ok: false,
      code: "extension-json-parse",
      message: "exit 1; capture full stdout and JSON.parse the whole value; stdout: "
    }),
    true
  );
  assert.equal(isKitRefreshRunAborted({ ok: false, code: "extension-refresh-paused" }), true);
  assert.equal(
    isKitRefreshRunAborted({
      ok: false,
      code: "extension-json-parse",
      message: "exit 1; stdout: not json"
    }),
    false
  );
  assert.equal(
    isLostKitCliOutput({
      ok: false,
      code: "extension-json-parse",
      message: "exit 1; stdout: not json"
    }),
    false
  );
});

test("CommandClient.runForDashboardPaint honors refresh pause unless bootstrap", async () => {
  const calls = [];
  let releaseMutation;
  const mutationGate = new Promise((resolve) => {
    releaseMutation = resolve;
  });
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args[1]);
      if (args[1] === "task-state-hydrate") {
        await mutationGate;
      }
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  client.setRefreshPaused(true);
  const mutation = client.run("task-state-hydrate", { policyApproval: { confirmed: true, rationale: "t" } });
  await new Promise((r) => setTimeout(r, 0));

  const deferred = await client.runForDashboardPaint("dashboard-summary", { projection: "overview" });
  assert.equal(deferred.ok, false);
  assert.equal(deferred.code, "extension-refresh-paused");
  assert.ok(!calls.includes("dashboard-summary"), "paused paint lane must not spawn CLI");

  const bootstrap = await client.runForDashboardPaint(
    "dashboard-summary",
    { projection: "overview" },
    { bootstrap: true }
  );
  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.code, "dashboard-summary");
  assert.ok(calls.includes("dashboard-summary"));

  releaseMutation();
  await mutation;
});

test("CommandClient mutation lane runs before queued refresh", async () => {
  const order = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      order.push(args[1]);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  const [summary, transition] = await Promise.all([
    client.run("dashboard-summary", {}),
    client.run("run-transition", { taskId: "T1", action: "accept" })
  ]);
  assert.equal(transition.ok, true);
  assert.equal(transition.code, "run-transition");
  assert.deepEqual(order, ["run-transition", "dashboard-summary"]);
  assert.equal(summary.ok, true);
  assert.equal(summary.code, "dashboard-summary");
});

test("CommandClient refresh pause tracks owners and ignores unbalanced release", async () => {
  const notices = [];
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    onKitRunNotice: (message) => notices.push(message),
    execFn: async (_root, args) => {
      calls.push(args[1]);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });

  client.setRefreshPaused(true, { owner: "drawer", reason: "submit" });
  client.setRefreshPaused(true, { owner: "task-state-sync", reason: "apply" });
  client.setRefreshPaused(false, { owner: "drawer", reason: "done" });
  assert.equal(client.isRefreshPaused(), true);
  client.setRefreshPaused(false, { owner: "not-owner", reason: "stray" });
  assert.equal(client.isRefreshPaused(), true);

  const paused = await client.run("dashboard-summary", {});
  assert.equal(paused.ok, false);
  assert.equal(paused.code, "extension-refresh-paused");

  client.setRefreshPaused(false, { owner: "task-state-sync", reason: "done" });
  assert.equal(client.isRefreshPaused(), false);
  const ok = await client.run("dashboard-summary", {});
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, ["dashboard-summary"]);
  assert.ok(notices.some((line) => line.includes("refresh pause acquired | owner=drawer")));
  assert.ok(notices.some((line) => line.includes("refresh pause release ignored | owner mismatch: tried to release owner=not-owner")));
});

test("CommandClient clearRefreshPaused releases all pause owners", () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => ({ exitCode: 0, stdout: '{"ok":true}', stderr: "" })
  });
  client.setRefreshPaused(true, { owner: "drawer" });
  client.setRefreshPaused(true, { owner: "sync" });
  assert.equal(client.isRefreshPaused(), true);
  client.clearRefreshPaused("dispose");
  assert.equal(client.isRefreshPaused(), false);
});

test("CommandClient coalesces pending refresh jobs with the same key", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args[1]);
      await new Promise((r) => setTimeout(r, 10));
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  const [a, b] = await Promise.all([
    client.run("dashboard-summary", { pass: 1 }),
    client.run("dashboard-summary", { pass: 2 })
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(calls.filter((c) => c === "dashboard-summary").length, 1);
});

test("CommandClient.clearActivity invokes clear-agent-activity best-effort", async () => {
  const calls = [];
  const client = new CommandClient("/tmp/noop", {
    execFn: async (_root, args) => {
      calls.push(args);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: "agent-activity-cleared" }), stderr: "" };
    }
  });

  await client.clearActivity({ command: "build-plan" });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ["run", "clear-agent-activity"]);
  const payload = JSON.parse(calls[0][2]);
  assert.equal(payload.command, "build-plan");
  assert.equal(payload.source, "vscode-extension");
});
