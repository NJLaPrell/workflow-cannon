#!/usr/bin/env node
/**
 * After install or when Node upgrades, better-sqlite3's .node binary can target the wrong
 * NODE_MODULE_VERSION. Rebuild only when load fails with that signature.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Directory where the user ran install (npm/pnpm set this for lifecycle scripts). */
const installRoot = process.env.INIT_CWD?.trim() || pkgRoot;

function needsRebuildMessage(msg) {
  return (
    msg.includes("NODE_MODULE_VERSION") ||
    msg.includes("was compiled against a different Node.js") ||
    msg.includes("better_sqlite3.node")
  );
}

async function main() {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!needsRebuildMessage(msg)) {
      console.error("[workspace-kit] better-sqlite3 load failed:", msg);
      process.exit(1);
    }
  }

  console.warn("[workspace-kit] Rebuilding better-sqlite3 for this Node.js (native ABI mismatch)…");
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
    process.exit(r.status ?? 1);
  }

  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
