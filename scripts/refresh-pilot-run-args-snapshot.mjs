#!/usr/bin/env node
/**
 * Regenerate schemas/pilot-run-args.snapshot.json from task-engine-run-contracts.schema.json.
 * Run after changing pilot command arg contracts.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { extractCommandArgsSchema } from "./lib/extract-contract-args.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(ROOT, "schemas/task-engine-run-contracts.schema.json");
const OUT_PATH = path.join(ROOT, "schemas/pilot-run-args.snapshot.json");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const pkgVersion =
  typeof schema?.properties?.packageVersion?.const === "string"
    ? schema.properties.packageVersion.const
    : "unknown";

const required = schema?.properties?.commands?.required;
if (!Array.isArray(required) || required.length === 0) {
  throw new Error("task-engine-run-contracts.schema.json missing properties.commands.required[]");
}
const PILOT_COMMANDS = [...required].sort((a, b) => a.localeCompare(b));

/** @type {Record<string, unknown>} */
const commands = {};
for (const name of PILOT_COMMANDS) {
  commands[name] = extractCommandArgsSchema(schema, name);
}

const snapshot = {
  schemaVersion: 1,
  sourceSchemaPackageVersion: pkgVersion,
  pilotCommands: [...PILOT_COMMANDS],
  commands
};

fs.writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${PILOT_COMMANDS.length} commands, package ${pkgVersion}).`);
