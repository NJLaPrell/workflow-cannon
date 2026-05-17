import fs from "node:fs";
import path from "node:path";
import { nodeRuntimeIdentity } from "./native-sqlite-diagnostics.mjs";

export const runtimeStampRelativePath = ".workspace-kit/runtime.json";
/** Minimum supported Node.js major (see `src/core/runtime-contract.ts`). */
export const minimumNodeMajor = 22;
/** @deprecated use `minimumNodeMajor` */
export const requiredNodeMajor = String(minimumNodeMajor);

export function buildRuntimeStamp(packageRoot, checkedAt = new Date().toISOString()) {
  const identity = nodeRuntimeIdentity();
  return {
    schemaVersion: 1,
    nodeExecutable: identity.execPath,
    nodeVersion: identity.version,
    arch: identity.arch,
    platform: identity.platform,
    abi: identity.modules,
    packageRoot: path.resolve(packageRoot),
    checkedAt
  };
}

export function runtimeStampPath(workspaceRoot) {
  return path.join(workspaceRoot, runtimeStampRelativePath);
}

export function writeRuntimeStamp(workspaceRoot, packageRoot, checkedAt) {
  const stamp = buildRuntimeStamp(packageRoot, checkedAt);
  const stampPath = runtimeStampPath(workspaceRoot);
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
  return { stamp, stampPath };
}

export async function smokeTestNativeSqlite() {
  const { default: Database } = await import("better-sqlite3");
  const database = new Database(":memory:");
  database.close();
}

export function assertRequiredNodeMajor(minimum = minimumNodeMajor) {
  const min = typeof minimum === "string" ? Number(minimum) : minimum;
  const activeMajor = Number(process.versions.node.split(".", 1)[0]);
  if (!Number.isInteger(activeMajor) || activeMajor < min) {
    throw new Error(
      `Node.js ${min}+ is required by the Workflow Cannon runtime contract; active runtime is ${process.version}. Install Node ${min} or newer (matching host architecture) before installing or running setup.`
    );
  }
}
