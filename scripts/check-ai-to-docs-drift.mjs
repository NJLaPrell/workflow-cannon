#!/usr/bin/env node
/**
 * Fail if docs/maintainers outputs for covered paths are not exact emits of .ai sources (Phase 56).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedDocOutput } from "./ai-docs-from-ai-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const covPath = path.join(root, "docs/maintainers/data/ai-to-docs-coverage.json");

function main() {
  const cov = JSON.parse(fs.readFileSync(covPath, "utf8"));
  const paths = cov.mappings.map((m) => m.output);
  let failed = false;
  for (const m of cov.mappings) {
    if (!m.source || !m.output) continue;
    const src = path.join(root, m.source);
    const out = path.join(root, m.output);
    if (!fs.existsSync(src)) {
      console.error(`check-ai-to-docs-drift: missing source ${m.source}`);
      failed = true;
      continue;
    }
    if (!fs.existsSync(out)) {
      console.error(`check-ai-to-docs-drift: missing output ${m.output} (run pnpm run generate-maintainer-docs-from-ai)`);
      failed = true;
      continue;
    }
    const body = fs.readFileSync(src, "utf8");
    const want = expectedDocOutput(m.source, body);
    const got = fs.readFileSync(out, "utf8");
    if (want !== got) {
      console.error(`check-ai-to-docs-drift: stale or hand-edited ${m.output}`);
      failed = true;
    }
  }
  if (failed) {
    console.error(
      "\ncheck-ai-to-docs-drift: fix by editing .ai sources, then: pnpm run generate-maintainer-docs-from-ai"
    );
    process.exit(1);
  }
  console.error(`check-ai-to-docs-drift: ok (${paths.length} path(s))`);
}

main();
