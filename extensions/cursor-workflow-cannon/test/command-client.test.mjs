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
