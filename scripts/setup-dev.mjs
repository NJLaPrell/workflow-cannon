#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatNodeRuntimeIdentity } from "./native-sqlite-diagnostics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const checkOnly = args.includes("--check-only");
const skipInstall = checkOnly || args.includes("--skip-install");
const expectedPnpm = "10.0.0";

function readVersionMarker(fileName) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) return null;
  const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.trim();
  return line && !line.startsWith("#") ? line : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32"
  });
  if (options.capture) {
    return {
      status: result.status ?? 1,
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? "").trim()
    };
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return { status: 0, stdout: "", stderr: "" };
}

function fail(message) {
  console.error(`[workspace-kit setup] ${message}`);
  process.exit(1);
}

const specs = [readVersionMarker(".nvmrc"), readVersionMarker(".node-version")].filter(Boolean);
const expectedMajor = specs[0]?.replace(/^v/, "").split(".")[0] ?? "22";
const activeMajor = process.versions.node.split(".")[0];

console.log(`[workspace-kit setup] OS: ${process.platform} ${os.release()} (${os.arch()})`);
console.log(`[workspace-kit setup] Node runtime: ${formatNodeRuntimeIdentity()}`);
console.log(`[workspace-kit setup] Version markers: .nvmrc=${specs[0] ?? "missing"} .node-version=${specs[1] ?? "missing"}`);

if (activeMajor !== expectedMajor) {
  fail(`Node ${expectedMajor}.x is required by repo version markers; active runtime is ${process.version}. Run nvm use ${expectedMajor} or configure your shell/tooling to the same architecture before installing.`);
}

const pnpmVersion = run("pnpm", ["--version"], { capture: true });
if (pnpmVersion.status !== 0) {
  console.log(`[workspace-kit setup] pnpm missing; preparing pnpm@${expectedPnpm} with corepack.`);
  run("corepack", ["prepare", `pnpm@${expectedPnpm}`, "--activate"]);
} else {
  console.log(`[workspace-kit setup] pnpm: ${pnpmVersion.stdout}`);
}

if (checkOnly) {
  console.log("[workspace-kit setup] Check-only mode passed.");
  process.exit(0);
}

if (!skipInstall) {
  run("corepack", ["prepare", `pnpm@${expectedPnpm}`, "--activate"]);
  run("pnpm", ["install"]);
}
run("pnpm", ["run", "build"]);
run(process.execPath, ["-e", "import('better-sqlite3').then(({default: Database}) => { const db = new Database(':memory:'); db.close(); })"]);
console.log("[workspace-kit setup] Native SQLite smoke test passed.");
