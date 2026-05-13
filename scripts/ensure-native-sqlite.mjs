#!/usr/bin/env node
/**
 * After install or when Node upgrades, better-sqlite3's .node binary can target the wrong
 * NODE_MODULE_VERSION. Rebuild only when load fails with that signature.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import {
  classifyNativeSqliteErrorMessage,
  formatNodeRuntimeIdentity,
  nativeSqliteRecoveryHint
} from "./native-sqlite-diagnostics.mjs";
import { writeRuntimeStamp } from "./runtime-stamp.mjs";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Directory where the user ran install (npm/pnpm set this for lifecycle scripts). */
const installRoot = process.env.INIT_CWD?.trim() || pkgRoot;

/**
 * Detect Node running under emulation (e.g. x64 Node on arm64 macOS via Rosetta). In that case
 * any native binding installed/built now is pinned to the wrong architecture for the host, which
 * silently produces a runtime stamp that no other shell on this machine can use.
 */
function assertHostArchMatchesProcessArch() {
  const hostArch = os.arch();
  if (hostArch === process.arch) return;
  console.error(
    `[workspace-kit] Refusing to install native bindings: Node is ${process.arch} but host is ${hostArch}.`
  );
  console.error(
    `[workspace-kit] This usually means you are running an x64 Node under Rosetta on an ${hostArch} machine.`
  );
  console.error(
    `[workspace-kit] Switch to a Node built for ${hostArch} (e.g. \`nvm use\` an ${hostArch} install) and re-run \`pnpm install\`.`
  );
  console.error(`[workspace-kit] Active runtime: ${formatNodeRuntimeIdentity()}`);
  process.exit(1);
}

async function main() {
  assertHostArchMatchesProcessArch();
  let classification;
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    writeRuntimeStamp(installRoot, pkgRoot);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    classification = classifyNativeSqliteErrorMessage(msg);
    if (!classification.rebuildRecommended) {
      console.error("[workspace-kit] better-sqlite3 load failed:", msg);
      console.error(`[workspace-kit] ${nativeSqliteRecoveryHint(classification)}`);
      console.error(
        "[workspace-kit] Install / troubleshooting: docs/maintainers/runbooks/native-sqlite-consumer-install.md"
      );
      process.exit(1);
    }
  }

  console.warn(`[workspace-kit] better-sqlite3 load failed (${classification.kind}).`);
  console.warn(`[workspace-kit] Runtime: ${formatNodeRuntimeIdentity()}`);
  console.warn(`[workspace-kit] Install root: ${installRoot}`);
  console.warn("[workspace-kit] Rebuilding better-sqlite3 for this Node.js runtime...");
  const shell = process.platform === "win32";
  let r = spawnSync("pnpm", ["rebuild", "better-sqlite3"], {
    cwd: installRoot,
    stdio: "inherit",
    shell
  });
  if (r.status !== 0) {
    r = spawnSync("npm", ["rebuild", "better-sqlite3"], {
      cwd: installRoot,
      stdio: "inherit",
      shell
    });
  }
  if (r.status !== 0) {
    console.error(
      "[workspace-kit] Rebuild failed — see docs/maintainers/runbooks/native-sqlite-consumer-install.md"
    );
    process.exit(r.status ?? 1);
  }

  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
  writeRuntimeStamp(installRoot, pkgRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
