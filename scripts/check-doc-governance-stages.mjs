#!/usr/bin/env node
/**
 * Ensures documentation governance check stages stay registered in
 * scripts/run-check-stages.mjs (T100201).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_DOC_GOVERNANCE_STAGE_IDS } from "./doc-governance-stage-ids.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagesPath = path.join(root, "scripts", "run-check-stages.mjs");
const text = fs.readFileSync(stagesPath, "utf8");

const errors = [];
for (const id of REQUIRED_DOC_GOVERNANCE_STAGE_IDS) {
  const needle = `id: "${id}"`;
  if (!text.includes(needle)) {
    errors.push(`run-check-stages.mjs is missing stage ${needle}`);
  }
}

const runbook = path.join(root, ".ai", "runbooks", "documentation-governance-checks.md");
if (!fs.existsSync(runbook)) {
  errors.push("missing .ai/runbooks/documentation-governance-checks.md");
}

const report = {
  ok: errors.length === 0,
  code: errors.length === 0 ? "doc-governance-stages-ok" : "doc-governance-stages-failed",
  data: {
    requiredStageCount: REQUIRED_DOC_GOVERNANCE_STAGE_IDS.length,
    errorCount: errors.length
  },
  errors
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[check:doc-governance-stages] ${e}`);
  }
  process.exit(1);
}
