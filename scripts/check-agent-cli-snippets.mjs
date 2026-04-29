#!/usr/bin/env node
/**
 * CI: manifest commands must each have a matching `--schema-only` JSON under
 * `.ai/agent-cli-snippets/by-command/` and appear in INDEX.json (Phase 76).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const INDEX_PATH = path.join(ROOT, ".ai/agent-cli-snippets/INDEX.json");
const BY_CMD = path.join(ROOT, ".ai/agent-cli-snippets/by-command");

function fail(msg) {
  console.error(`[check-agent-cli-snippets] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(INDEX_PATH)) {
  fail("Missing .ai/agent-cli-snippets/INDEX.json — run: node scripts/generate-agent-cli-snippets.mjs");
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const names = new Set(
  manifest.map((r) => (typeof r.name === "string" ? r.name.trim() : "")).filter(Boolean)
);
if (names.size === 0) {
  fail("No command names in builtin-run-command-manifest.json");
}

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
const indexed = new Set(
  Array.isArray(index.commands) ? index.commands.map((c) => c.name).filter(Boolean) : []
);
const missingFiles = [];
const missingIndex = [];

for (const name of names) {
  const fp = path.join(BY_CMD, `${name}.json`);
  if (!fs.existsSync(fp)) {
    missingFiles.push(name);
  }
  if (!indexed.has(name)) {
    missingIndex.push(name);
  }
}

if (missingFiles.length || missingIndex.length) {
  if (missingFiles.length) {
    console.error(`Missing snippet file(s): ${missingFiles.sort().join(", ")}`);
  }
  if (missingIndex.length) {
    console.error(`Missing from INDEX.json: ${missingIndex.sort().join(", ")}`);
  }
  fail("Regenerate: node scripts/generate-agent-cli-snippets.mjs (after pnpm run build)");
}

if (indexed.size !== names.size) {
  const stale = [...indexed].filter((n) => !names.has(n)).sort();
  if (stale.length) {
    fail(`INDEX.json lists unknown manifest command(s): ${stale.join(", ")}`);
  }
}

console.error(`[check-agent-cli-snippets] OK: ${names.size} command snippet(s)`);
