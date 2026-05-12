import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

function workspace() {
  return mkdtempSync(path.join(tmpdir(), "wc-runtime-script-"));
}

test("runtime stamp script helper writes current runtime identity", async () => {
  const { runtimeStampPath, writeRuntimeStamp } = await import("../scripts/runtime-stamp.mjs");

  const root = workspace();
  const packageRoot = path.join(root, "package-root");
  fs.mkdirSync(packageRoot, { recursive: true });
  const { stamp, stampPath } = writeRuntimeStamp(root, packageRoot, "2026-05-12T00:00:00.000Z");

  assert.equal(stampPath, runtimeStampPath(root));
  assert.equal(stamp.nodeExecutable, process.execPath);
  assert.equal(stamp.nodeVersion, process.version);
  assert.equal(stamp.arch, process.arch);
  assert.equal(stamp.platform, process.platform);
  assert.equal(stamp.abi, process.versions.modules);
  assert.equal(stamp.packageRoot, path.resolve(packageRoot));
  assert.equal(stamp.checkedAt, "2026-05-12T00:00:00.000Z");
  assert.deepEqual(JSON.parse(fs.readFileSync(stampPath, "utf8")), stamp);
});

test("runtime stamp script helper enforces configured Node major", async () => {
  const { assertRequiredNodeMajor } = await import("../scripts/runtime-stamp.mjs");

  const activeMajor = process.versions.node.split(".", 1)[0];
  assert.doesNotThrow(() => assertRequiredNodeMajor(activeMajor));
  assert.throws(() => assertRequiredNodeMajor("999"), /Node 999\.x is required/);
});

test("package metadata declares Node 22 and pnpm 10 engines", async () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  assert.equal(packageJson.engines.node, ">=22 <23");
  assert.equal(packageJson.engines.pnpm, ">=10 <11");
  assert.equal(packageJson.files.includes("scripts/runtime-stamp.mjs"), true);
});
