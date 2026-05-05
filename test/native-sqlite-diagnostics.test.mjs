import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyNativeSqliteErrorMessage,
  formatNodeRuntimeIdentity,
  nativeSqliteRecoveryHint
} from "../dist/core/native-sqlite-diagnostics.js";

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
