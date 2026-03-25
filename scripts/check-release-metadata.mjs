#!/usr/bin/env node

/**
 * Fail-closed release metadata validator.
 * Exits non-zero if any required package.json field is missing or invalid.
 * Intended to run in CI before publish to catch broken metadata early.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_FIELDS = [
  { path: "name", validate: (v) => typeof v === "string" && v.length > 0 && v.startsWith("@") },
  { path: "version", validate: (v) => typeof v === "string" && /^\d+\.\d+\.\d+/.test(v) },
  { path: "license", validate: (v) => typeof v === "string" && v.length > 0 },
  { path: "repository.url", validate: (v) => typeof v === "string" && v.includes("github.com") },
  { path: "publishConfig.access", validate: (v) => v === "public" },
  { path: "publishConfig.registry", validate: (v) => typeof v === "string" && v.includes("registry.npmjs.org") },
  { path: "main", validate: (v) => typeof v === "string" && v.length > 0 },
  { path: "type", validate: (v) => v === "module" },
  { path: "files", validate: (v) => Array.isArray(v) && v.length > 0 },
];

const REQUIRED_SCRIPTS = ["build", "check", "test", "pack:dry-run"];

function getNestedValue(obj, dotPath) {
  return dotPath.split(".").reduce((acc, key) => acc?.[key], obj);
}

async function main() {
  const pkgPath = resolve(process.cwd(), "package.json");
  let pkg;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  } catch {
    console.error(`FAIL: Cannot read ${pkgPath}`);
    process.exit(1);
  }

  const failures = [];

  for (const field of REQUIRED_FIELDS) {
    const value = getNestedValue(pkg, field.path);
    if (!field.validate(value)) {
      failures.push(`  ${field.path}: got ${JSON.stringify(value)}`);
    }
  }

  for (const script of REQUIRED_SCRIPTS) {
    if (typeof pkg.scripts?.[script] !== "string" || pkg.scripts[script].length === 0) {
      failures.push(`  scripts.${script}: missing or empty`);
    }
  }

  if (pkg.private === true) {
    failures.push("  private: must not be true for publishable packages");
  }

  if (failures.length > 0) {
    console.error("Release metadata check FAILED:");
    for (const f of failures) console.error(f);
    process.exit(1);
  }

  console.log("Release metadata check passed.");
  process.exit(0);
}

main();
