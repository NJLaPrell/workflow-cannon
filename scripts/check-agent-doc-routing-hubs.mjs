#!/usr/bin/env node
/**
 * Phase 76: token routing — required hub entrypoints exist so agents can avoid
 * enumerating whole `.ai/cae`, `.ai/runbooks`, `.ai/adrs` trees.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = [".ai/cae/HUB.md", ".ai/runbooks/HUB.md", ".ai/adrs/HUB.md"];

let failed = false;
for (const rel of REQUIRED) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error(`[check-agent-doc-routing-hubs] missing ${rel}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.error(`[check-agent-doc-routing-hubs] OK (${REQUIRED.length} hub file(s))`);
