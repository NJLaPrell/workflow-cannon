#!/usr/bin/env node
/**
 * REF-004: forbid direct `src/modules/*` → `src/modules/*` imports except explicit allowlist.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW = join(ROOT, "scripts/module-sibling-import-allowlist.json");
const MODULES = join(ROOT, "src", "modules");

const MODULE_TOP =
  /(skills|task-engine|planning|context-activation|documentation|improvement|team-execution|subagents|checkpoints|plugins|agent-behavior)/;
const FROM_SIBLING_RE = new RegExp(
  String.raw`from\s+["']\.\./\.\./${MODULE_TOP.source}/`,
  "g"
);

function walkTs(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

function main() {
  const allow = JSON.parse(readFileSync(ALLOW, "utf8"));
  if (allow.schemaVersion !== 1 || !Array.isArray(allow.entries)) {
    console.error("module-sibling-import-allowlist.json: invalid schema");
    process.exit(1);
  }
  const allowed = new Set(allow.entries.map((e) => `${e.file}|${e.line}|${e.importLine.trim()}`));

  const violations = [];
  for (const abs of walkTs(MODULES)) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((line, i) => {
      FROM_SIBLING_RE.lastIndex = 0;
      if (!FROM_SIBLING_RE.test(line)) return;
      const lineno = String(i + 1);
      const key = `${rel}|${lineno}|${line.trim()}`;
      if (!allowed.has(key)) {
        violations.push(`${rel}:${lineno}:${line.trim()}`);
      }
    });
  }

  if (violations.length) {
    console.error(
      "Disallowed sibling module imports (or missing allowlist entry):\n" + violations.join("\n")
    );
    console.error(
      "\nFix: use a core façade, relocate shared code, or add a rationale entry to scripts/module-sibling-import-allowlist.json"
    );
    process.exit(1);
  }

  console.log("check-module-sibling-imports: ok (%d allowlisted line(s))", allow.entries.length);
}

main();
