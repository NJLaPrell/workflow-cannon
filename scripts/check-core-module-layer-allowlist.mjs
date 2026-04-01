#!/usr/bin/env node
/**
 * R102 enforcement: fail if src/core imports from src/modules outside
 * scripts/core-module-layer-allowlist.json (machine-readable allowlist).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_PATH = join(ROOT, "scripts/core-module-layer-allowlist.json");

const FROM_MODULES_RE = /\bfrom\s+["']((?:\.\.\/)+modules\/[^"']+)["']/g;

function walkTsFiles(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkTsFiles(p, acc);
    } else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

function normRel(p) {
  return relative(ROOT, p).split("\\").join("/");
}

function main() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.entries)) {
    console.error("check-core-module-layer-allowlist: invalid allowlist JSON");
    process.exit(1);
  }

  const allowed = new Set(raw.entries.map((e) => `${e.file}|${e.specifier}`));
  const seenAllowed = new Set();

  const coreDir = join(ROOT, "src", "core");
  const files = walkTsFiles(coreDir);
  const violations = [];

  for (const abs of files) {
    const rel = normRel(abs);
    const text = readFileSync(abs, "utf8");
    let m;
    FROM_MODULES_RE.lastIndex = 0;
    while ((m = FROM_MODULES_RE.exec(text)) !== null) {
      const specifier = m[1];
      const key = `${rel}|${specifier}`;
      if (allowed.has(key)) {
        seenAllowed.add(key);
      } else {
        violations.push(`${rel}: disallowed import from '${specifier}' (not in core-module-layer-allowlist.json)`);
      }
    }
  }

  const stale = [];
  for (const key of allowed) {
    if (!seenAllowed.has(key)) {
      stale.push(`${key} (allowlist entry never found in source — remove or fix path)`);
    }
  }

  if (violations.length || stale.length) {
    if (violations.length) {
      console.error("Core → modules import violations (R102):\n" + violations.join("\n"));
    }
    if (stale.length) {
      console.error("Stale allowlist entries:\n" + stale.join("\n"));
    }
    console.error(
      "\nEscalation: add `{ file, specifier, rationale }` to scripts/core-module-layer-allowlist.json, " +
        "document the facade in docs/maintainers/ARCHITECTURE.md (layering exceptions), and update src/README.md if needed."
    );
    process.exit(1);
  }

  console.log("check-core-module-layer-allowlist: ok (%d allowlisted edge(s))", allowed.size);
}

main();
