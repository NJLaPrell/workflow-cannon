#!/usr/bin/env node
/**
 * CI gate for docs/maintainers/data/documentation-deletion-register.v1.json (T100200).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateDeletionRegister } from "./documentation-deletion-register-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const regPath = path.join(root, "docs", "maintainers", "data", "documentation-deletion-register.v1.json");

let raw;
try {
  raw = fs.readFileSync(regPath, "utf8");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[check:documentation-deletion-register] missing or unreadable: ${msg}`);
  process.exit(1);
}

let register;
try {
  register = JSON.parse(raw);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[check:documentation-deletion-register] invalid JSON: ${msg}`);
  process.exit(1);
}

const { errors, warnings } = validateDeletionRegister(register, root);
const report = {
  ok: errors.length === 0,
  code: errors.length === 0 ? "documentation-deletion-register-ok" : "documentation-deletion-register-failed",
  data: {
    registerPath: path.relative(root, regPath),
    entryCount: Array.isArray(register.entries) ? register.entries.length : 0,
    errorCount: errors.length,
    warningCount: warnings.length
  },
  errors,
  warnings
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

for (const w of warnings) {
  console.error(`[check:documentation-deletion-register] WARN ${w}`);
}
if (errors.length > 0) {
  for (const err of errors) {
    console.error(`[check:documentation-deletion-register] ${err}`);
  }
  process.exit(1);
}
