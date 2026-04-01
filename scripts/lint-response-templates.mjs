#!/usr/bin/env node
/**
 * Opt-in strict response-template checks (reuses phase6b tests). Slow path; not part of default pnpm test.
 *
 *   WORKSPACE_KIT_LINT_RESPONSE_TEMPLATES=1 pnpm run lint-response-templates
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.WORKSPACE_KIT_LINT_RESPONSE_TEMPLATES !== "1") {
  console.error("Set WORKSPACE_KIT_LINT_RESPONSE_TEMPLATES=1 to run this script (opt-in).");
  process.exit(0);
}

const r = spawnSync(process.execPath, ["--test", "test/phase6b-response-templates.test.mjs"], {
  cwd: ROOT,
  stdio: "inherit"
});
process.exit(r.status ?? 1);
