#!/usr/bin/env node
/**
 * Ensure each module instruction starts with a short agent capsule (Phase 76).
 * Use `--write` to insert missing capsules (idempotent when already present).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const GLOB_ROOT = path.join(ROOT, "src/modules");

const CAP_RE = /agentCapsule\|v=1\|/;

function listInstructionFiles() {
  const out = [];
  for (const ent of fs.readdirSync(GLOB_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const inst = path.join(GLOB_ROOT, ent.name, "instructions");
    if (!fs.existsSync(inst)) continue;
    for (const f of fs.readdirSync(inst)) {
      if (!f.endsWith(".md")) continue;
      out.push(path.join(inst, f));
    }
  }
  return out.sort();
}

function commandNameFromPath(f) {
  return path.basename(f, ".md");
}

function moduleIdFromPath(f) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const m = /^src\/modules\/([^/]+)\/instructions\//.exec(rel);
  return m ? m[1] : "unknown";
}

function capsuleBlock(command, moduleId) {
  return `<!--
agentCapsule|v=1|command=${command}|module=${moduleId}|schema_only=pnpm exec wk run ${command} --schema-only '{}'
-->

`;
}

function main() {
  const files = listInstructionFiles();
  let missing = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const head = raw.split("\n").slice(0, 30).join("\n");
    if (CAP_RE.test(head)) {
      continue;
    }
    missing++;
    if (WRITE) {
      const cmd = commandNameFromPath(file);
      const mod = moduleIdFromPath(file);
      const block = capsuleBlock(cmd, mod);
      const next = raw.startsWith("#") ? `${block}${raw}` : `${block}\n${raw}`;
      fs.writeFileSync(file, next, "utf8");
    }
  }

  if (missing > 0 && !WRITE) {
    console.error(
      `[check-instruction-agent-capsules] ${missing} file(s) missing agentCapsule|v=1 in first ~30 lines — run: node scripts/check-instruction-agent-capsules.mjs --write`
    );
    process.exit(1);
  }
  if (WRITE && missing > 0) {
    console.error(`[check-instruction-agent-capsules] inserted capsule into ${missing} file(s).`);
  }
  if (missing === 0) {
    console.error(`[check-instruction-agent-capsules] OK (${files.length} instruction file(s))`);
  }
}

main();
