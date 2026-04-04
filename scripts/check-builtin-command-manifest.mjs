#!/usr/bin/env node
/**
 * Validate src/contracts/builtin-run-command-manifest.json:
 * - unique command names
 * - policySensitivity on every row (non-sensitive | sensitive | sensitive-with-dryrun) consistent with policyOperationId
 * - policyOperationId values match known PolicyOperationId module-run subset
 * - defaultResponseTemplateId values exist in builtin response-template registry
 * - instruction files exist on disk per module
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");

const KNOWN_POLICY_OPERATION_IDS = new Set([
  "doc.document-project",
  "doc.generate-document",
  "tasks.run-transition",
  "approvals.review-item",
  "improvement.generate-recommendations",
  "improvement.ingest-transcripts",
  "task-engine.backfill-task-feature-links",
  "task-engine.export-feature-taxonomy-json",
  "skills.apply-skill",
  "subagents.persist",
  "team-execution.persist"
]);

const ALLOWED_SENSITIVITY = new Set(["non-sensitive", "sensitive", "sensitive-with-dryrun"]);

function fail(message) {
  console.error(`[check-builtin-command-manifest] ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to parse JSON at ${filePath}: ${error.message}`);
  }
}

/** Keep aligned with `src/core/response-template-registry.ts` BUILTIN keys. */
const BUILTIN_RESPONSE_TEMPLATE_IDS = new Set(["default", "compact", "completed_task", "COMPLETED_TASK"]);

const manifest = loadJson(MANIFEST_PATH);
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail("Manifest must be a non-empty array.");
}

const seenNames = new Set();

for (const row of manifest) {
  if (!row.moduleId || !row.name || !row.file) {
    fail(`Invalid row (missing moduleId, name, or file): ${JSON.stringify(row)}`);
  }
  if (seenNames.has(row.name)) {
    fail(`Duplicate command name '${row.name}' in manifest.`);
  }
  seenNames.add(row.name);

  if (!row.policySensitivity || !ALLOWED_SENSITIVITY.has(row.policySensitivity)) {
    fail(
      `Command '${row.name}' must set policySensitivity to one of: non-sensitive, sensitive, sensitive-with-dryrun (declares shipped policy classification for CI + docs).`
    );
  }

  if (row.policySensitivity === "non-sensitive") {
    if (row.policyOperationId !== undefined) {
      fail(`Command '${row.name}': policySensitivity non-sensitive must not set policyOperationId.`);
    }
  } else {
    if (typeof row.policyOperationId !== "string" || !row.policyOperationId.trim()) {
      fail(`Command '${row.name}': sensitive rows must declare policyOperationId.`);
    }
  }

  if (row.policySensitivity === "sensitive-with-dryrun") {
    const id = row.policyOperationId;
    if (
      id !== "doc.document-project" &&
      id !== "doc.generate-document" &&
      id !== "skills.apply-skill"
    ) {
      fail(
        `Command '${row.name}': sensitive-with-dryrun is only valid for doc commands and skills.apply-skill (matches policy.ts dryRun exception).`
      );
    }
  }

  if (
    row.policySensitivity === "sensitive" &&
    (row.policyOperationId === "doc.document-project" || row.policyOperationId === "doc.generate-document")
  ) {
    fail(
      `Command '${row.name}': doc generation commands must use policySensitivity sensitive-with-dryrun (dryRun can waive sensitivity).`
    );
  }

  if (row.policyOperationId !== undefined) {
    if (typeof row.policyOperationId !== "string" || !KNOWN_POLICY_OPERATION_IDS.has(row.policyOperationId)) {
      fail(
        `Unknown policyOperationId '${row.policyOperationId}' for command '${row.name}' — add to src/core/policy.ts PolicyOperationId and KNOWN_POLICY_OPERATION_IDS in this script.`
      );
    }
  }

  if (row.defaultResponseTemplateId !== undefined) {
    const tid = row.defaultResponseTemplateId;
    if (typeof tid !== "string" || !tid.trim()) {
      fail(`Invalid defaultResponseTemplateId for '${row.name}'.`);
    }
    const lower = tid.toLowerCase();
    if (!BUILTIN_RESPONSE_TEMPLATE_IDS.has(tid) && !BUILTIN_RESPONSE_TEMPLATE_IDS.has(lower)) {
      fail(`Unknown defaultResponseTemplateId '${tid}' for command '${row.name}' (not in response-template-registry BUILTIN keys).`);
    }
  }

  const mdPath = path.join(ROOT, "src/modules", row.moduleId, "instructions", row.file);
  if (!fs.existsSync(mdPath)) {
    fail(`Missing instruction file for '${row.name}': ${path.relative(ROOT, mdPath)}`);
  }
}

console.log(`[check-builtin-command-manifest] OK: ${manifest.length} command rows validated.`);
