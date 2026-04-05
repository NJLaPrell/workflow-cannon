#!/usr/bin/env node
/**
 * Ensures every policy-sensitive manifest command is either in pilot-run-args.snapshot
 * (task-engine contracts) or explicitly waived (schemas/run-args-cli-validation-waivers.json).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "src", "contracts", "builtin-run-command-manifest.json");
const SNAP = path.join(ROOT, "schemas", "pilot-run-args.snapshot.json");
const WAIVERS = path.join(ROOT, "schemas", "run-args-cli-validation-waivers.json");

function fail(msg) {
  console.error(`[check-run-args-cli-validation-waivers] ${msg}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
if (!Array.isArray(manifest)) {
  fail("builtin-run-command-manifest.json must be an array.");
}
const snapshot = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const pilot = new Set(Array.isArray(snapshot.pilotCommands) ? snapshot.pilotCommands : []);
const waiverDoc = JSON.parse(fs.readFileSync(WAIVERS, "utf8"));
const waived = new Set(Array.isArray(waiverDoc.commands) ? waiverDoc.commands : []);

const sensitive = manifest.filter(
  (e) => e?.policySensitivity === "sensitive" || e?.policySensitivity === "sensitive-with-dryrun"
);
const missing = [];
for (const e of sensitive) {
  const name = e.name;
  if (typeof name !== "string" || !name) {
    fail("Manifest entry missing name.");
  }
  if (!pilot.has(name) && !waived.has(name)) {
    missing.push(name);
  }
}

if (missing.length > 0) {
  fail(
    `Sensitive commands missing pilot snapshot + waiver: ${missing.sort().join(", ")} — add AJV coverage or extend ${path.relative(ROOT, WAIVERS)}.`
  );
}

const orphanWaivers = [...waived].filter((n) => !sensitive.some((e) => e.name === n));
if (orphanWaivers.length > 0) {
  fail(`Waiver entries are not sensitive in manifest (remove or fix): ${orphanWaivers.sort().join(", ")}`);
}

console.log(
  `[check-run-args-cli-validation-waivers] OK: ${sensitive.length} sensitive commands covered (${pilot.size} pilot / task-engine, ${waived.size} waived).`
);
