import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { runCli } from "../dist/cli.js";
import { writeRuntimeLauncher, writeRuntimeStamp } from "../dist/core/runtime-contract.js";

async function workspace() {
  return mkdtemp(path.join(tmpdir(), "wc-runtime-e2e-"));
}

function runtimeIdentity(overrides = {}) {
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

async function runInitWithRuntime(root, identity) {
  const previous = process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY;
  process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY = JSON.stringify(identity);
  const errors = [];
  try {
    const code = await runCli(["init", "--yes", "--approval-rationale", "runtime e2e", "--no-starter-task"], {
      cwd: root,
      writeLine: () => {},
      writeError: (line) => errors.push(line)
    });
    assert.equal(code, 0, errors.join("\n"));
  } finally {
    if (previous === undefined) delete process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY;
    else process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY = previous;
  }
}

async function writeNodeWrapper(wrapperPath, capturePath) {
  await mkdir(path.dirname(wrapperPath), { recursive: true });
  await writeFile(
    wrapperPath,
    `#!/bin/sh\nprintf '%s\n' "$@" > ${JSON.stringify(capturePath)}\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
    "utf8"
  );
  await chmod(wrapperPath, 0o755);
}

async function writePoisonNode(fakeNodePath) {
  await mkdir(path.dirname(fakeNodePath), { recursive: true });
  await writeFile(fakeNodePath, "#!/bin/sh\necho poisoned-node >&2\nexit 98\n", "utf8");
  await chmod(fakeNodePath, 0o755);
}

test("runtime contract e2e: attached workspace commands execute through stamped launcher despite PATH", async () => {
  const root = await workspace();
  try {
    const capturePath = path.join(root, "stamped-node-argv.txt");
    const wrapperPath = path.join(root, "runtime", "node22-wrapper");
    const poisonBin = path.join(root, "poison-bin");
    await writeNodeWrapper(wrapperPath, capturePath);
    await writePoisonNode(path.join(poisonBin, "node"));
    await writeFile(path.join(root, ".nvmrc"), "16\n", "utf8");
    await runInitWithRuntime(root, runtimeIdentity({ nodeExecutable: wrapperPath }));

    const launcher = path.join(root, ".workspace-kit", "bin", "wk");
    const result = spawnSync(launcher, ["run", "list-tasks", "{}"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${poisonBin}:/bin:/usr/bin` }
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "tasks-listed");
    const captured = await readFile(capturePath, "utf8");
    assert.match(captured, /dist\/cli\.js/);
    assert.doesNotMatch(result.stderr, /poisoned-node/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime contract e2e: launcher fails clearly when runtime stamp is missing", async () => {
  const root = await workspace();
  try {
    await runInitWithRuntime(root, runtimeIdentity());
    await unlink(path.join(root, ".workspace-kit", "runtime.json"));

    const result = spawnSync(path.join(root, ".workspace-kit", "bin", "wk"), ["doctor"], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing runtime stamp/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime contract e2e: launcher fails clearly when stamped Node is deleted", async () => {
  const root = await workspace();
  try {
    const wrapperPath = path.join(root, "runtime", "node22-wrapper");
    await writeNodeWrapper(wrapperPath, path.join(root, "stamped-node-argv.txt"));
    await runInitWithRuntime(root, runtimeIdentity({ nodeExecutable: wrapperPath }));
    await unlink(wrapperPath);

    const result = spawnSync(path.join(root, ".workspace-kit", "bin", "wk"), ["run", "list-tasks", "{}"], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /stamped Node executable is missing or not executable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime contract e2e: doctor reports SQLite load failure from stamped package root", async () => {
  const root = await workspace();
  try {
    await runInitWithRuntime(root, runtimeIdentity());
    const isolatedPackageRoot = path.join(root, "isolated-package");
    const proxyCliPath = path.join(isolatedPackageRoot, "dist", "cli.js");
    await mkdir(path.dirname(proxyCliPath), { recursive: true });
    await writeFile(path.join(isolatedPackageRoot, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    await writeFile(
      proxyCliPath,
      `import { runCli } from ${JSON.stringify(pathToFileURL(path.join(process.cwd(), "dist", "cli.js")).href)};\nprocess.exitCode = await runCli(process.argv.slice(2));\n`,
      "utf8"
    );
    writeRuntimeStamp(root, runtimeIdentity({ packageRoot: isolatedPackageRoot }));
    writeRuntimeLauncher(root);
    assert.equal(existsSync(proxyCliPath), true);

    const result = spawnSync(path.join(root, ".workspace-kit", "bin", "wk"), ["doctor", "--json"], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 1, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "doctor-contract-failed");
    assert.ok(
      payload.data.runtimeContract.issues.some((issue) => issue.code === "runtime-sqlite-load-failed")
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});