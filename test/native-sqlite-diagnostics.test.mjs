import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyNativeSqliteErrorMessage,
  formatArchMismatchRemediation,
  formatNodeRuntimeIdentity,
  nativeSqliteRecoveryHint
} from "../dist/core/native-sqlite-diagnostics.js";

test("native SQLite classifier detects ERR_DLOPEN_FAILED dlopen architecture mismatch", () => {
  const classification = classifyNativeSqliteErrorMessage(
    "ERR_DLOPEN_FAILED: dlopen(better_sqlite3.node): mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')"
  );
  assert.equal(classification.kind, "architecture-mismatch");
  assert.deepEqual(classification.architecture, { have: "x86_64", need: "arm64" });
});

test("formatArchMismatchRemediation returns runtime-host-arch-mismatch and arch prefix", () => {
  const remediation = formatArchMismatchRemediation(
    new Error("ERR_DLOPEN_FAILED: dlopen … incompatible architecture (have 'x86_64', need 'arm64')"),
    {
      execPath: "/usr/local/bin/node",
      version: "v22.0.0",
      arch: "x86_64",
      platform: "darwin",
      modules: "127"
    }
  );
  assert.equal(remediation.code, "runtime-host-arch-mismatch");
  assert.match(remediation.remediationCommand, /^arch -/);
  assert.match(remediation.message, /host is/);
});

test("native SQLite classifier detects macOS architecture mismatch", () => {
  const classification = classifyNativeSqliteErrorMessage(
    "dlopen(better_sqlite3.node): mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')"
  );
  assert.equal(classification.kind, "architecture-mismatch");
  assert.equal(classification.rebuildRecommended, true);
  assert.deepEqual(classification.architecture, { have: "arm64", need: "x86_64" });
});

test("native SQLite classifier detects Node ABI mismatch", () => {
  const classification = classifyNativeSqliteErrorMessage(
    "The module 'better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 127"
  );
  assert.equal(classification.kind, "abi-mismatch");
  assert.equal(classification.rebuildRecommended, true);
});

test("native SQLite classifier detects missing binding", () => {
  const classification = classifyNativeSqliteErrorMessage("Cannot find module 'better-sqlite3'");
  assert.equal(classification.kind, "missing-binding");
  assert.equal(classification.rebuildRecommended, true);
});

test("native SQLite recovery hint includes runtime identity", () => {
  const identity = {
    execPath: "/tmp/node",
    version: "v22.0.0",
    arch: "arm64",
    platform: "darwin",
    modules: "127"
  };
  assert.equal(formatNodeRuntimeIdentity(identity), "node=/tmp/node version=v22.0.0 arch=arm64 platform=darwin abi=127");
  assert.match(nativeSqliteRecoveryHint({ kind: "abi-mismatch", rebuildRecommended: true }, identity), /pnpm rebuild better-sqlite3/);
});
