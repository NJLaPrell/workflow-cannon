#!/usr/bin/env node
import os from "node:os";
import {
  classifyNativeSqliteErrorMessage,
  formatNodeRuntimeIdentity,
  nativeSqliteRecoveryHint
} from "./native-sqlite-diagnostics.mjs";

function fail(message) {
  console.error(`[workspace-kit] ${message}`);
  process.exit(1);
}

function assertHostMatchesProcess() {
  const hostArch = os.arch();
  if (hostArch === process.arch) {
    return;
  }
  fail(
    `native-binding-arch-mismatch: host=${hostArch} runtime=${process.arch}. Use a ${hostArch} Node runtime, then run \"pnpm rebuild better-sqlite3\". Runtime: ${formatNodeRuntimeIdentity()}`
  );
}

async function assertBetterSqliteLoads() {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const classification = classifyNativeSqliteErrorMessage(msg);
    if (classification.kind === "architecture-mismatch") {
      fail(
        `${msg} — ${nativeSqliteRecoveryHint(classification)} Remediation command: pnpm rebuild better-sqlite3`
      );
    }
  }
}

async function main() {
  assertHostMatchesProcess();
  await assertBetterSqliteLoads();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
