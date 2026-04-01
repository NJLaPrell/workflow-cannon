#!/usr/bin/env node
/**
 * Maintainer-only: produce a markdown table of parity status for two+ local workspace roots.
 * No GitHub API; clone repos yourself. Tokens in paths are your problem.
 *
 * Usage:
 *   node examples/cross-repo-parity-matrix.mjs /path/to/repo-a /path/to/repo-b
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const roots = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (roots.length < 2) {
  console.error("Need at least two absolute or relative workspace paths.");
  process.exit(2);
}

function row(root) {
  const name = path.basename(path.resolve(root));
  const r = spawnSync("pnpm", ["run", "parity"], {
    cwd: root,
    encoding: "utf8",
    shell: true
  });
  return `| ${name} | ${r.status === 0 ? "ok" : "fail"} | ${r.status} |`;
}

console.log("| Workspace | Parity | Code |");
console.log("| --- | --- | --- |");
for (const root of roots) {
  console.log(row(root));
}
