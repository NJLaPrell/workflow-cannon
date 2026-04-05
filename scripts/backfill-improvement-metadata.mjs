#!/usr/bin/env node
/**
 * One-shot: align legacy improvement rows with metadata.issue + metadata.supportingReasoning
 * and ensure technicalScope / acceptanceCriteria satisfy task-engine validation.
 *
 * Usage: node scripts/backfill-improvement-metadata.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const repoRoot = new URL("..", import.meta.url).pathname;
const dryRun = process.argv.includes("--dry-run");

function wkRun(subcommand, argsObj) {
  const json = JSON.stringify(argsObj);
  const out = execFileSync("pnpm", ["exec", "wk", "run", subcommand, json], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(out);
}

function cleanTitle(title) {
  return String(title ?? "")
    .replace(/^\[improvement\]\s*/i, "")
    .trim();
}

function deriveIssue(task, meta) {
  if (typeof meta.issue === "string" && meta.issue.trim().length > 24) {
    return meta.issue.trim();
  }
  const title = cleanTitle(task.title) || task.id;
  const kind = meta.evidenceKind;
  if (kind === "transcript" && typeof meta.provenanceRefs?.transcriptPath === "string") {
    return `Agent-session friction surfaced in transcript **${meta.provenanceRefs.transcriptPath}**: ${title}.`;
  }
  if (kind === "policy_deny" && typeof meta.provenanceRefs?.operationId === "string") {
    return `Policy / approval friction on **${meta.provenanceRefs.operationId}** blocks or confuses operators (${title}).`;
  }
  if (kind === "config_mutation" && typeof meta.provenanceRefs?.key === "string") {
    return `Config mutation UX for key **${meta.provenanceRefs.key}** is unclear or fails without actionable guidance (${title}).`;
  }
  if (kind === "task_transition" && typeof meta.provenanceRefs?.taskId === "string") {
    return `High lifecycle churn on task **${meta.provenanceRefs.taskId}** suggests scope, policy, or docs confusion (${title}).`;
  }
  if (kind === "git_diff") {
    return `Release / migration hygiene risk across the tagged git range (${title}).`;
  }
  return `Improvement opportunity: ${title}. See approach and acceptance criteria for the intended outcome.`;
}

function formatProvenance(prov) {
  if (!prov || typeof prov !== "object") return "(none)";
  return Object.entries(prov)
    .map(([k, v]) => `${k}=${String(v).slice(0, 140)}`)
    .join("; ");
}

function deriveSupportingReasoning(task, meta, issue) {
  if (typeof meta.supportingReasoning === "string" && meta.supportingReasoning.trim().length > 60) {
    return meta.supportingReasoning.trim();
  }
  if (meta.evidenceKey && meta.evidenceKind) {
    const reasons = Array.isArray(meta.confidenceReasons)
      ? meta.confidenceReasons.join("; ")
      : "";
    return (
      `Admission rationale: ${reasons || "pipeline candidate"}. ` +
      `Evidence kind **${meta.evidenceKind}**; stable key \`${meta.evidenceKey}\`. ` +
      `Provenance: ${formatProvenance(meta.provenanceRefs)}. ` +
      `**metadata.issue** states the interpreted problem. ` +
      `Backfilled explicit supportingReasoning (2026-04) for triage and contract alignment.`
    );
  }
  const phase = task.phase ?? "n/a";
  return (
    `Maintainer/planner improvement (not pipeline-ingested). **Status:** ${task.status}; **phase:** ${phase}. ` +
    `**Problem summary:** ${issue.slice(0, 220)}${issue.length > 220 ? "…" : ""} ` +
    `**Backfill:** standardized metadata.issue / metadata.supportingReasoning (2026-04) to match current \`type: improvement\` expectations.`
  );
}

function nonEmptyStringArray(a) {
  return Array.isArray(a) && a.some((x) => typeof x === "string" && x.trim().length > 0);
}

function ensureTechnicalScope(task) {
  if (nonEmptyStringArray(task.technicalScope)) return task.technicalScope;
  const ac = task.acceptanceCriteria;
  if (nonEmptyStringArray(ac)) {
    return ac
      .filter((x) => typeof x === "string" && x.trim())
      .slice(0, 4)
      .map((x) => `Deliverable aligned with acceptance: ${x.trim().slice(0, 280)}`);
  }
  if (typeof task.approach === "string" && task.approach.trim()) {
    const chunks = task.approach
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (chunks.length) return chunks.map((c) => c.slice(0, 320));
  }
  return [`Address improvement: ${cleanTitle(task.title) || task.id}`];
}

function ensureAcceptanceCriteria(task) {
  if (nonEmptyStringArray(task.acceptanceCriteria)) return task.acceptanceCriteria;
  return [
    "Outcome resolves or documents the problem in metadata.issue.",
    "Closure includes maintainer-visible evidence (docs, code, or explicit rationale)."
  ];
}

const list = wkRun("list-tasks", { type: "improvement" });
if (!list.ok) {
  console.error(list);
  process.exit(1);
}
let gen = list.data.planningGeneration;
const ids = list.data.tasks.map((t) => t.id);
console.error(`Backfill ${ids.length} improvement task(s); dryRun=${dryRun}; start planningGeneration=${gen}`);

let ok = 0;
let skipped = 0;
let failed = 0;

for (const id of ids) {
  const got = wkRun("get-task", { taskId: id, expectedPlanningGeneration: gen });
  if (!got.ok) {
    console.error("get-task failed", id, got);
    failed += 1;
    continue;
  }
  gen = got.data.planningGeneration ?? gen;
  const task = got.data.task;
  const meta = task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata) ? { ...task.metadata } : {};

  const issue = deriveIssue(task, meta);
  const supportingReasoning = deriveSupportingReasoning(task, meta, issue);
  const technicalScope = ensureTechnicalScope(task);
  const acceptanceCriteria = ensureAcceptanceCriteria(task);

  const prevSr = typeof meta.supportingReasoning === "string" ? meta.supportingReasoning.trim() : "";
  const prevIssue = typeof meta.issue === "string" ? meta.issue.trim() : "";
  const same =
    prevSr === supportingReasoning &&
    prevIssue === issue &&
    JSON.stringify(task.technicalScope ?? []) === JSON.stringify(technicalScope) &&
    JSON.stringify(task.acceptanceCriteria ?? []) === JSON.stringify(acceptanceCriteria);

  if (same) {
    skipped += 1;
    continue;
  }

  const newMeta = { ...meta, issue, supportingReasoning };
  const updates = { metadata: newMeta };
  if (!nonEmptyStringArray(task.technicalScope)) updates.technicalScope = technicalScope;
  if (!nonEmptyStringArray(task.acceptanceCriteria)) updates.acceptanceCriteria = acceptanceCriteria;

  if (dryRun) {
    console.log(JSON.stringify({ id, updatesPreview: updates }, null, 2));
    ok += 1;
    continue;
  }

  const upd = wkRun("update-task", {
    taskId: id,
    updates,
    expectedPlanningGeneration: gen
  });
  if (!upd.ok) {
    console.error("update-task failed", id, upd.message, upd.code);
    failed += 1;
    continue;
  }
  gen = upd.data.planningGeneration ?? gen + 1;
  ok += 1;
}

console.error(`Done. updated/dry-printed=${ok} skipped=${skipped} failed=${failed} finalPlanningGeneration=${gen}`);
process.exit(failed > 0 ? 1 : 0);
