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
  "tasks.report-defect",
  "tasks.install-git-hooks",
  "tasks.uninstall-git-hooks",
  "tasks.sync-task-store-after-merge",
  "tasks.rebuild-task-state-cache",
  "tasks.apply-task-state-events",
  "tasks.repair-task-state-cache",
  "tasks.task-state-hydrate",
  "tasks.task-state-init",
  "tasks.task-state-publish",
  "tasks.task-state-snapshot",
  "tasks.task-state-migrate-baseline",
  "tasks.planning-state-migrate-baseline",
  "tasks.synthesize-transcript-churn",
  "approvals.review-item",
  "improvement.generate-recommendations",
  "improvement.ingest-transcripts",
  "task-engine.prepare-release-artifacts",
  "task-engine.backfill-task-feature-links",
  "task-engine.export-feature-taxonomy-json",
  "task-engine.agent-sessions.persist",
  "skills.apply-skill",
  "plugins.persist",
  "subagents.persist",
  "team-execution.persist",
  "ideas.persist",
  "checkpoints.persist",
  "checkpoints.rewind",
  "context-activation.cae-satisfy-ack",
  "context-activation.cae-import-json-registry",
  "context-activation.cae-record-shadow-feedback",
  "task-engine.workspace-edit-lease",
  "project-memory.write",
  "project-memory.approve",
  "project-memory.prune",
  "planning.draft-plan-artifact",
  "planning.review-plan-artifact",
  "planning.accept-plan-artifact",
  "planning.finalize-plan-to-phase",
  "planning.execute-plan-artifact",
  "planning.generate-plan-document"
]);

const ALLOWED_SENSITIVITY = new Set(["non-sensitive", "sensitive", "sensitive-with-dryrun"]);
const ALLOWED_EXECUTION_CLASSES = new Set(["read_hot", "read", "mutation", "operator", "debug"]);

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
      id !== "skills.apply-skill" &&
      id !== "planning.draft-plan-artifact" &&
      id !== "planning.review-plan-artifact" &&
      id !== "planning.finalize-plan-to-phase" &&
      id !== "planning.generate-plan-document" &&
      id !== "task-engine.prepare-release-artifacts"
    ) {
      fail(
        `Command '${row.name}': sensitive-with-dryrun is only valid for doc commands, skills.apply-skill, planning.draft-plan-artifact, planning.review-plan-artifact, planning.finalize-plan-to-phase, planning.generate-plan-document, and task-engine.prepare-release-artifacts (matches policy.ts dry-run / Tier C exceptions).`
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

  if (row.executionClass !== undefined) {
    if (!ALLOWED_EXECUTION_CLASSES.has(row.executionClass)) {
      fail(
        `Command '${row.name}': executionClass '${row.executionClass}' is invalid. Must be one of: ${[
          ...ALLOWED_EXECUTION_CLASSES
        ].join(", ")}`
      );
    }
    if (row.executionClass === "read_hot" || row.executionClass === "debug") {
      if (row.policySensitivity !== "non-sensitive") {
        fail(
          `Command '${row.name}': executionClass '${row.executionClass}' is not allowed for sensitive commands (sensitivity: ${row.policySensitivity}).`
        );
      }
    }
  }

  const mdPath = path.join(ROOT, "src/modules", row.moduleId, "instructions", row.file);
  if (!fs.existsSync(mdPath)) {
    fail(`Missing instruction file for '${row.name}': ${path.relative(ROOT, mdPath)}`);
  }
}

console.log(`[check-builtin-command-manifest] OK: ${manifest.length} command rows validated.`);
