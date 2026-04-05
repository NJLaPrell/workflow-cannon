#!/usr/bin/env node
/**
 * Ensures schemas/pilot-run-args.snapshot.json matches extracted args from
 * task-engine-run-contracts.schema.json (pilot allowlist).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { extractCommandArgsSchema } from "./lib/extract-contract-args.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(ROOT, "schemas/task-engine-run-contracts.schema.json");
const SNAP_PATH = path.join(ROOT, "schemas/pilot-run-args.snapshot.json");

function fail(msg) {
  console.error(`[check-pilot-run-args-snapshot] ${msg}`);
  process.exit(1);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const pkgVersion =
  typeof schema?.properties?.packageVersion?.const === "string"
    ? schema.properties.packageVersion.const
    : "unknown";

if (!fs.existsSync(SNAP_PATH)) {
  fail(`Missing ${path.relative(ROOT, SNAP_PATH)} — run: node scripts/refresh-pilot-run-args-snapshot.mjs`);
}

const snapshot = JSON.parse(fs.readFileSync(SNAP_PATH, "utf8"));
const expectedPilot = snapshot.pilotCommands;
if (!Array.isArray(expectedPilot) || expectedPilot.length === 0) {
  fail("Snapshot missing non-empty pilotCommands array.");
}

if (snapshot.sourceSchemaPackageVersion !== pkgVersion) {
  fail(
    `Snapshot sourceSchemaPackageVersion (${snapshot.sourceSchemaPackageVersion}) !== schema packageVersion (${pkgVersion}). Re-run: node scripts/refresh-pilot-run-args-snapshot.mjs`
  );
}

for (const name of expectedPilot) {
  const extracted = extractCommandArgsSchema(schema, name);
  const saved = snapshot.commands?.[name];
  if (!saved) {
    fail(`Snapshot missing commands.${name}`);
  }
  if (stableStringify(extracted) !== stableStringify(saved)) {
    fail(
      `Drift for command '${name}': extracted args JSON does not match snapshot.\n` +
        `Re-run: node scripts/refresh-pilot-run-args-snapshot.mjs\n` +
        `--- extracted ---\n${JSON.stringify(extracted, null, 2)}\n--- snapshot ---\n${JSON.stringify(saved, null, 2)}`
    );
  }
}

console.log(
  `[check-pilot-run-args-snapshot] OK: ${expectedPilot.length} pilot commands aligned (package ${pkgVersion}).`
);
