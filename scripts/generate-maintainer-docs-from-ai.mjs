#!/usr/bin/env node
/**
 * Phase 56 — emit human-facing docs/maintainers/* from canonical .ai/ sources.
 * @see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedDocOutput } from "./ai-docs-from-ai-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const covPath = path.join(root, "docs/maintainers/data/ai-to-docs-coverage.json");

function main() {
  const cov = JSON.parse(fs.readFileSync(covPath, "utf8"));
  if (!Array.isArray(cov.mappings)) {
    console.error("generate-maintainer-docs-from-ai: invalid coverage (missing mappings)");
    process.exit(1);
  }
  let n = 0;
  for (const m of cov.mappings) {
    if (!m.source || !m.output) continue;
    const src = path.join(root, m.source);
    const out = path.join(root, m.output);
    if (!fs.existsSync(src)) {
      console.error(`generate-maintainer-docs-from-ai: missing source ${m.source}`);
      process.exit(1);
    }
    const body = fs.readFileSync(src, "utf8");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, expectedDocOutput(m.source, body), "utf8");
    n += 1;
  }
  console.error(`generate-maintainer-docs-from-ai: wrote ${n} file(s)`);
}

main();
