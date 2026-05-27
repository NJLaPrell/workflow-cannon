#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validatePlanArtifactDocument } from "../dist/core/planning/validate-plan-artifact.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");

const fixtureFiles = fs
  .readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

const failures = [];

for (const fixtureFile of fixtureFiles) {
  const fixturePath = path.join(fixturesDir, fixtureFile);
  const artifact = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const result = validatePlanArtifactDocument(artifact, { workspaceRoot: repoRoot });
  const expectInvalid = fixtureFile.includes(".invalid.");

  if (expectInvalid && result.ok) {
    failures.push(`${fixtureFile}: expected invalid fixture to fail validation`);
  }
  if (!expectInvalid && !result.ok) {
    const details = result.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ");
    failures.push(`${fixtureFile}: expected valid fixture to pass validation${details ? ` (${details})` : ""}`);
  }
}

if (failures.length > 0) {
  console.error(`PlanArtifact fixture gate failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PlanArtifact fixture gate passed (${fixtureFiles.length} fixture(s)).`);
