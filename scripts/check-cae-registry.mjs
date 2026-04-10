#!/usr/bin/env node
/**
 * CI gate: CAE registry + activation JSON must load (shipped `cae-registry-validate`).
 * Intended to run after the TypeScript stage in `pnpm run check` so dist/cli.js exists.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(`check-cae-registry: missing ${cli} — run pnpm run build first.`);
  process.exit(1);
}

const jsonArgs = JSON.stringify({ schemaVersion: 1 });
const res = spawnSync(process.execPath, [cli, "run", "cae-registry-validate", jsonArgs], {
  cwd: root,
  encoding: "utf8"
});

if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

if (res.status !== 0) {
  console.error("check-cae-registry: workspace-kit run cae-registry-validate failed");
  process.exit(res.status ?? 1);
}

let parsed;
try {
  parsed = JSON.parse(String(res.stdout ?? "").trim());
} catch {
  console.error("check-cae-registry: could not parse CLI JSON stdout");
  process.exit(1);
}

if (!parsed.ok) {
  console.error("check-cae-registry: cae-registry-validate returned ok:false", parsed.code, parsed.message);
  process.exit(1);
}
