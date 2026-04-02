#!/usr/bin/env node
/**
 * Phase 43 doc guard: forbid stale task-store primary narrative and broken pnpm wk invocation.
 * @see docs/maintainers/runbooks/task-persistence-operator.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  ".workspace-kit",
  "artifacts",
  "mcps"
]);

/** Lines matching these are allowed even if they contain a forbidden substring (documenting the anti-pattern). */
function lineIsExplicitAntiPatternDoc(line) {
  return (
    /avoid\s+[`']?pnpm run wk -- run/i.test(line) ||
    /\bdo not\b.*pnpm run wk -- run/i.test(line) ||
    /forbidden/i.test(line) ||
    /erroneous/i.test(line) ||
    /invalid[`']?\)?/i.test(line)
  );
}

const FORBIDDEN_SUBSTRINGS = [
  {
    needle: "pnpm run wk -- run",
    hint: "Use `pnpm run wk run <cmd> '<json>'` (no `--` between wk and run). See docs/maintainers/CHANGELOG.md clone flow note."
  },
  {
    needle: "Canonical queue in `.workspace-kit/tasks/state.json`",
    hint: "Default execution store is SQLite at `.workspace-kit/tasks/workspace-kit.db`; JSON at `.workspace-kit/tasks/state.json` is opt-out / legacy import only — see task-persistence-operator.md."
  }
];

function walkFiles(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue;
      walkFiles(p, acc);
    } else if (ent.isFile()) {
      const low = ent.name.toLowerCase();
      if (low.endsWith(".md") || low.endsWith(".mdc")) {
        acc.push(p);
      }
    }
  }
  return acc;
}

function main() {
  const files = walkFiles(ROOT);
  const violations = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (rel.startsWith("extensions/cursor-workflow-cannon/node_modules/")) continue;
    if (rel === "docs/maintainers/CHANGELOG.md") continue;

    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { needle, hint } of FORBIDDEN_SUBSTRINGS) {
        if (!line.includes(needle)) continue;
        if (lineIsExplicitAntiPatternDoc(line)) continue;
        violations.push(`${rel}:${i + 1}: ${needle}\n  → ${hint}`);
      }
    }
  }

  if (violations.length) {
    console.error("check-maintainer-doc-canonicals: forbidden phrasing or invocation:\n\n" + violations.join("\n\n"));
    process.exit(1);
  }
  console.error("check-maintainer-doc-canonicals: ok");
}

main();
