import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function workspace() {
  return mkdtempSync(path.join(tmpdir(), "wc-runtime-"));
}

function validStamp(overrides = {}) {
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

test("runtime contract: writes, reads, and verifies a valid stamp", async () => {
  const {
    generateWorkspaceKitLauncherContent,
    readRuntimeStamp,
    runtimeLauncherPath,
    runtimeStampPath,
    verifyRuntimeStampFile,
    writeRuntimeStamp
  } = await import("../dist/core/runtime-contract.js");

  const root = workspace();
  const stamp = writeRuntimeStamp(root, validStamp({ packageRoot: process.cwd() }));
  assert.equal(runtimeStampPath(root), path.join(root, ".workspace-kit/runtime.json"));
  assert.equal(runtimeLauncherPath(root), path.join(root, ".workspace-kit/bin/wk"));
  assert.match(generateWorkspaceKitLauncherContent(), /^#!\/bin\/sh/);
  assert.match(generateWorkspaceKitLauncherContent(), /exec "\$node_executable" "\$cli_path" "\$@"/);
  const read = readRuntimeStamp(root);
  assert.equal(read.ok, true);
  assert.equal(read.stamp.nodeExecutable, process.execPath);
  assert.equal(read.stamp.packageRoot, path.resolve(process.cwd()));
  assert.deepEqual(read.stamp, stamp);
  const verified = verifyRuntimeStampFile(root, { currentIdentity: stamp });
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.issues, []);
});

test("runtime contract: reports missing and malformed stamps", async () => {
  const { parseRuntimeStamp, readRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const missing = readRuntimeStamp(workspace());
  assert.equal(missing.ok, false);
  assert.equal(missing.issues[0].code, "runtime-stamp-missing");

  const parsed = parseRuntimeStamp({ schemaVersion: 1, nodeExecutable: "" });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.issues.some((issue) => issue.message.includes("nodeVersion")), true);
});

test("runtime contract: Node 23 stamp verifies when minimum major is 22", async () => {
  const { verifyRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const stamp = validStamp({ nodeVersion: "v23.11.0" });
  const verified = verifyRuntimeStamp(stamp, { currentIdentity: stamp });
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.issues, []);
});

test("runtime contract: detects wrong major, architecture, ABI, and missing node", async () => {
  const { verifyRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const currentIdentity = validStamp();
  const verified = verifyRuntimeStamp(
    validStamp({
      nodeExecutable: path.join(workspace(), "missing-node"),
      nodeVersion: "v20.11.0",
      arch: "definitely-not-this-arch",
      abi: "0"
    }),
    { currentIdentity }
  );
  assert.equal(verified.ok, false);
  const codes = verified.issues.map((issue) => issue.code);
  assert.equal(codes.includes("runtime-node-missing"), true);
  assert.equal(codes.includes("runtime-node-wrong-major"), true);
  assert.equal(codes.includes("runtime-arch-mismatch"), true);
  assert.equal(codes.includes("runtime-abi-mismatch"), true);
});

test("runtime contract: native SQLite smoke check reports load failure", async () => {
  const { smokeTestNativeSqlite, verifyRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const emptyPackageRoot = workspace();
  const smoke = smokeTestNativeSqlite(emptyPackageRoot);
  assert.equal(smoke.ok, false);
  assert.equal(smoke.issue.code, "runtime-sqlite-load-failed");

  const stamp = validStamp({ packageRoot: emptyPackageRoot });
  const verified = verifyRuntimeStamp(stamp, { currentIdentity: stamp, checkNativeSqlite: true });
  assert.equal(verified.ok, false);
  assert.equal(verified.issues.some((issue) => issue.code === "runtime-sqlite-load-failed"), true);
});

test("runtime contract: launcher delegates to the stamped Node executable", async () => {
  const { writeRuntimeLauncher, writeRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const root = workspace();
  const packageRoot = path.join(root, "kit-package");
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "capture.json");
  const fakeNodePath = path.join(fakeBin, "node-stamped");
  const cliPath = path.join(packageRoot, "dist", "cli.js");
  await fs.mkdir(path.dirname(cliPath), { recursive: true });
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.writeFile(path.join(root, ".nvmrc"), "16\n", "utf8");
  await fs.writeFile(cliPath, "console.log('placeholder cli');\n", "utf8");
  await fs.writeFile(
    fakeNodePath,
    `#!/bin/sh\nprintf '{"argv":["%s","%s","%s"]}\n' "$1" "$2" "$3" > ${JSON.stringify(capturePath)}\n`,
    "utf8"
  );
  await fs.chmod(fakeNodePath, 0o755);
  writeRuntimeStamp(root, validStamp({ nodeExecutable: fakeNodePath, packageRoot }));
  const launcher = writeRuntimeLauncher(root);

  const result = spawnSync(launcher, ["doctor", "--json"], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const captured = JSON.parse(await fs.readFile(capturePath, "utf8"));
  assert.deepEqual(captured.argv, [cliPath, "doctor", "--json"]);
});

test("runtime contract: launcher fails clearly without a runtime stamp", async () => {
  const { writeRuntimeLauncher } = await import("../dist/core/runtime-contract.js");

  const root = workspace();
  const launcher = writeRuntimeLauncher(root);
  const result = spawnSync(launcher, ["doctor"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing runtime stamp/);
});

test("runtime contract: launcher fails clearly when stamped Node is unavailable", async () => {
  const { writeRuntimeLauncher, writeRuntimeStamp } = await import("../dist/core/runtime-contract.js");

  const root = workspace();
  const packageRoot = path.join(root, "kit-package");
  await fs.mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await fs.writeFile(path.join(packageRoot, "dist", "cli.js"), "console.log('placeholder cli');\n", "utf8");
  writeRuntimeStamp(root, validStamp({ nodeExecutable: path.join(root, "missing-node"), packageRoot }));
  const launcher = writeRuntimeLauncher(root);
  const result = spawnSync(launcher, ["doctor"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stamped Node executable is missing or not executable/);
});
