import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CommandClient,
  classifyNativeSqliteErrorMessage,
  formatNodeExecutableDiagnostics,
  inspectNodeExecutableCandidates,
  parseRunCommandOutput,
  pickNodeExecutable
} from "../dist/runtime/command-client.js";

test("pickNodeExecutable uses resolver path when it exists", () => {
  const picked = pickNodeExecutable(() => process.execPath);
  assert.equal(picked, process.execPath);
});

test("pickNodeExecutable falls through when resolver path is bogus", () => {
  const picked = pickNodeExecutable(() => "/__no_such__/node");
  assert.notEqual(picked, "/__no_such__/node");
});

test("pickNodeExecutable discovers nvm node matching workspace version", () => {
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
    const node20 = path.join(process.env.NVM_DIR, "versions", "node", "v20.3.0", "bin", "node");
    const node22 = path.join(process.env.NVM_DIR, "versions", "node", "v22.22.2", "bin", "node");
    fs.mkdirSync(path.dirname(node20), { recursive: true });
    fs.mkdirSync(path.dirname(node22), { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(node20, "");
    fs.writeFileSync(node22, "");
    fs.writeFileSync(path.join(workspaceRoot, ".nvmrc"), "22\n");

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

test("pickNodeExecutable skips native-incompatible resolver candidate", () => {
  const oldHome = process.env.HOME;
  const oldNvmDir = process.env.NVM_DIR;
  const oldNvmBin = process.env.NVM_BIN;
  const oldWorkspaceKitNode = process.env.WORKSPACE_KIT_NODE;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wc-node-native-"));
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const badNode = path.join(tempRoot, "bad-node");
    fs.writeFileSync(badNode, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    fs.mkdirSync(path.join(tempRoot, "node_modules", "better-sqlite3"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "node_modules", "better-sqlite3", "index.js"), "module.exports = {};\n");

    assert.notEqual(pickNodeExecutable(() => badNode, tempRoot), badNode);
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
  try {
    process.env.HOME = tempRoot;
    process.env.NVM_DIR = path.join(tempRoot, ".nvm");
    delete process.env.NVM_BIN;
    delete process.env.WORKSPACE_KIT_NODE;
    const workspaceRoot = path.join(tempRoot, "consumer");
    const packageRoot = path.join(workspaceRoot, "node_modules", "@workflow-cannon", "workspace-kit");
    const badNode = path.join(tempRoot, "bad-node");
    fs.mkdirSync(path.join(packageRoot, "node_modules", "better-sqlite3"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "node_modules", "better-sqlite3", "index.js"), "module.exports = {};\n");
    fs.writeFileSync(badNode, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    assert.notEqual(pickNodeExecutable(() => badNode, workspaceRoot, [packageRoot]), badNode);
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
