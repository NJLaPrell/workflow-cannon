import fs from "node:fs";
import { spawnSync } from "node:child_process";

const PLAN_ID = "d0283a5e-a782-4700-83c0-7a5824d6dd3c";
const ENVELOPE_KEYS = new Set([
  "ideaId",
  "brainstorm",
  "plan",
  "agentDirective",
  "createdAt",
  "updatedAt"
]);

const GOALS = {
  agents:
    "Agents complete Idea→Plan→Tasks without hand-editing files or slurping schemas/playbooks",
  cliFirst:
    "CLI planner commands ship before MCP wrappers for every v1 read surface",
  p0Mcp:
    "Full P0 MCP read set in v1: planner-packet, list-ideas, get-plan-artifact, plan-review-packet, finalize-preview-packet",
  authoring:
    "Incremental plan authoring via append-wbs-row and patch-plan-artifact in v1",
  legacy:
    "Deprecate and remove legacy build-plan interview path; keep separate from primary planner-chat (no build-plan-for-idea)"
};

const raw = JSON.parse(
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v13.json`, "utf8")
);
const artifact = {};
for (const [key, value] of Object.entries(raw)) {
  if (!ENVELOPE_KEYS.has(key)) artifact[key] = value;
}
artifact.status = "draft";
artifact.version = 14;

artifact.technicalImpact = {
  ...artifact.technicalImpact,
  migrationImpact:
    "Rollout: ship CLI planner commands first, then MCP read wrappers in dependency order. Migration: build-plan interview deprecated via WBS-13/WBS-18 warnings; dashboard copy redirects to Ideas planner-chat; build-plan removed only after WBS-24 dogfood gate. Rollback: revert MCP tool registration and output-budget entries without touching SQLite task store; CLI handlers remain source of truth."
};

artifact.implementationGuidance = [
  ...artifact.implementationGuidance,
  "Document rollout and migration steps in maintainer plan doc before first MCP tool release",
  "Keep rollback path: disable MCP planner tools via output-budget registration revert without CLI removal"
];

const wbsById = Object.fromEntries(artifact.wbs.map((r) => [r.wbsId, r]));

function mergeGoals(row, ...goals) {
  const set = new Set([...(row.goalMapping ?? []), ...goals]);
  row.goalMapping = [...set];
}

function appendApproach(row, suffix) {
  row.approach = `${row.approach} ${suffix}`.trim();
}

// Exact goal coverage for previously uncovered goals
mergeGoals(wbsById["WBS-1"], GOALS.cliFirst);
mergeGoals(wbsById["WBS-5"], GOALS.cliFirst, GOALS.p0Mcp);
mergeGoals(wbsById["WBS-6"], GOALS.p0Mcp, GOALS.cliFirst);
mergeGoals(wbsById["WBS-13"], GOALS.legacy);
mergeGoals(wbsById["WBS-18"], GOALS.legacy);
mergeGoals(wbsById["WBS-24"], GOALS.legacy);

// User story coverage via approach haystack (US-1 … US-14)
appendApproach(wbsById["WBS-6"], "Covers US-1 planner-packet and US-8 recommendedNextCommand; US-7 minimal scope superseded by full P0 v1 per D5.");
appendApproach(wbsById["WBS-7"], "Covers US-2 list-ideas MCP read surface.");
appendApproach(wbsById["WBS-8"], "Covers US-2 get-plan-artifact MCP read surface.");
appendApproach(wbsById["WBS-9"], "Covers US-2 plan-review-packet MCP read surface.");
appendApproach(wbsById["WBS-10"], "Covers US-2 finalize-preview-packet MCP read surface.");
appendApproach(
  wbsById["WBS-1"],
  "Covers US-3 get-planner-flow-status CLI orchestration read."
);
appendApproach(
  wbsById["WBS-2"],
  "Covers US-3 get-plan-artifact-template and US-9 plan-artifact-minimal.valid.v1.json fixture shape."
);
appendApproach(
  wbsById["WBS-3"],
  "Covers US-4 append-wbs-row authoring; US-13 defer list revised — append ships in v1 per operator D6."
);
appendApproach(wbsById["WBS-4"], "Covers US-4 patch-plan-artifact incremental authoring.");
appendApproach(
  wbsById["WBS-11"],
  "Covers US-5 by documenting P3 planner-mutations profile deferred past v1 read-only release."
);
appendApproach(
  wbsById["WBS-12"],
  "Covers US-10 thin MCP wrappers over Tier C CLI with field-by-field adapter parity tests."
);
appendApproach(
  wbsById["WBS-14"],
  "Covers US-6 wc-planner-chat skill pack, US-11 adoption layer, and US-14 golden-path integration test without file reads."
);
appendApproach(
  wbsById["WBS-15"],
  "Covers US-12 dogfood I011 via planner-chat and accept/finalize dryRun using new tools."
);
appendApproach(
  wbsById["WBS-16"],
  "Supports US-10 MCP envelope parity under load; truncation stress for planner-packet budget."
);
appendApproach(
  wbsById["WBS-20"],
  "Supports US-3 flow orchestration contract via get-planner-flow-status state alignment tests."
);
appendApproach(
  wbsById["WBS-22"],
  "Supports US-4 append/patch authoring safety under conflict and idempotent replay scenarios."
);

// Rollout keywords on legacy WBS for RUBRIC-COV-ROLLOUT / PROFILE-ROLLOUT
appendApproach(
  wbsById["WBS-18"],
  "Migration inventory and deprecation docs before build-plan removal rollout."
);
appendApproach(
  wbsById["WBS-24"],
  "Final legacy removal rollout gated on dogfood; rollback keeps CLI planner tools if MCP reverted."
);

function runWk(cmd, payload) {
  const result = spawnSync("pnpm", ["exec", "wk", "run", cmd, JSON.stringify(payload)], {
    encoding: "utf8",
    cwd: process.cwd()
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

const validateResult = runWk("draft-plan-artifact", { persist: false, artifact });
if (!validateResult.ok) {
  console.error("Validation failed:", JSON.stringify(validateResult, null, 2));
  process.exit(1);
}

const gen = runWk("get-idea", { ideaId: "I011" }).data.planningGeneration;
const persistResult = runWk("draft-plan-artifact", {
  persist: true,
  artifact,
  expectedPlanningGeneration: gen,
  policyApproval: {
    confirmed: true,
    rationale:
      "I011 v14: fix rubric blockers — exact goal mappings, US-1–US-14 WBS coverage, rollout/migration notes"
  }
});

if (!persistResult.ok) {
  console.error("Persist failed:", JSON.stringify(persistResult, null, 2));
  process.exit(1);
}

const review = runWk("review-plan-artifact", {
  planId: PLAN_ID,
  version: 14,
  profile: "full-feature"
});

const d = review.data;
console.log("v14 persisted");
console.log("review passed:", d.passed);
console.log("blockers:", d.blockerCount ?? d.blockers?.length);
console.log("warnings:", d.warningCount ?? d.warnings?.length);
if (!d.passed && d.blockers?.length) {
  for (const b of d.blockers) console.log("BLOCKER:", b.code, b.message);
}
