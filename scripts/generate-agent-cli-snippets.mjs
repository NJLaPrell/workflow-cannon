#!/usr/bin/env node
/**
 * Emit `.ai/agent-cli-snippets/by-command/*.json` from `wk run <cmd> --schema-only '{}'`
 * plus `INDEX.json`. Run after `pnpm run build`. Used for Phase 76 token-efficient agent loading.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist/cli.js");
const MANIFEST = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const OUT_ROOT = path.join(ROOT, ".ai/agent-cli-snippets");
const OUT_CMD = path.join(OUT_ROOT, "by-command");

function fail(msg) {
  console.error(`[generate-agent-cli-snippets] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(CLI)) {
  fail("dist/cli.js missing — run pnpm run build first.");
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail("builtin-run-command-manifest.json must be a non-empty array.");
}

fs.mkdirSync(OUT_CMD, { recursive: true });
/** @type {{ schemaVersion: number; generatedAt: string; commands: Array<{ name: string; path: string; moduleId: string }> }} */
const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commands: []
};

for (const row of manifest) {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const moduleId = typeof row.moduleId === "string" ? row.moduleId.trim() : "";
  if (!name || !moduleId) {
    fail(`manifest row missing name/moduleId: ${JSON.stringify(row)}`);
  }
  const proc = spawnSync(process.execPath, [CLI, "run", name, "--schema-only", "{}"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (proc.status !== 0) {
    console.error(proc.stdout?.slice(0, 800));
    console.error(proc.stderr?.slice(0, 800));
    fail(`schema-only failed for ${name} (exit ${proc.status})`);
  }
  const raw = proc.stdout?.trim() ?? "";
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`invalid JSON for ${name}: ${e}`);
  }
  const file = `${name}.json`;
  const rel = `.ai/agent-cli-snippets/by-command/${file}`;
  fs.writeFileSync(path.join(OUT_CMD, file), `${JSON.stringify(json, null, 2)}\n`, "utf8");
  index.commands.push({ name, path: rel, moduleId });
}

index.commands.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(OUT_ROOT, "INDEX.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.error(
  `[generate-agent-cli-snippets] wrote ${index.commands.length} command JSON file(s) under .ai/agent-cli-snippets/by-command/`
);
