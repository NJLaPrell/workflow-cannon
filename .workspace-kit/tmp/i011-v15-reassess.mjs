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

const raw = JSON.parse(
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v14.json`, "utf8")
);
const artifact = {};
for (const [key, value] of Object.entries(raw)) {
  if (!ENVELOPE_KEYS.has(key)) artifact[key] = value;
}
artifact.status = "draft";
artifact.version = 15;

artifact.assumptions = [
  "Ideas module and unified IdeaPlan documents are enabled in target workspaces",
  "Existing review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase handlers remain canonical mutation paths",
  "MCP stays read-only for planner commands in v1 per ADR-mcp-adapter-boundary-v1 and operator decision D8",
  "CLI handlers are built and tested (`pnpm run build`) before MCP wrapper registration ships",
  "planningGeneration policy remains require on Tier B planner mutations; agents refresh token after long MCP read sessions",
  "Workflow Cannon MCP server is available in Cursor for dogfood of read tools; CLI fallback suffices when MCP is disabled",
  "No SQLite task-store schema changes are required for planner read packets or incremental authoring commands",
  "build-plan interview callers can tolerate deprecation warnings for at least one phase slice before WBS-24 removal",
  "Phase 143 maintainer capacity can absorb WBS-1 through WBS-12 plus risk harness rows; legacy deletion may complete in Phase 144"
];

artifact.riskAssessment = [
  {
    id: "R1",
    description: "MCP planner-packet or satellite read tools exceed registered output budgets on large IdeaPlans",
    severity: "low",
    mitigation:
      "D3 budgets (20KB planner-packet, 16KB satellites) plus WBS-16 truncation stress fixtures and CI overflow gate prove deterministic ladder before release"
  },
  {
    id: "R2",
    description: "agent_start planner routing branch duplicates packet payload and exceeds bootstrap budget",
    severity: "low",
    mitigation:
      "D2 routing-only branch per WBS-11; deep context via planner-packet; acceptance criteria enforce six kilobyte routing metadata budget"
  },
  {
    id: "R3",
    description: "build-plan legacy removal breaks dashboard or extension consumers before replacement tools are proven",
    severity: "medium",
    mitigation:
      "WBS-18 consumer inventory and deprecation shim before WBS-13 warnings; WBS-24 deletion gated on WBS-14 golden-path test and WBS-15 I011 dogfood"
  },
  {
    id: "R4",
    description: "IdeaPlan document status, planning chat session, and Ideas row status drift without operator visibility",
    severity: "low",
    mitigation:
      "WBS-20 three state-machine contract tests plus WBS-1 get-planner-flow-status mismatch reporting in continuous integration"
  },
  {
    id: "R5",
    description: "append-wbs-row or patch-plan-artifact corrupts draft or loses updates under version or generation conflicts",
    severity: "medium",
    mitigation:
      "WBS-22 conflict and idempotency test matrix covers plan-artifact-version-conflict, planning-generation-mismatch, and clientMutationId replay"
  },
  {
    id: "R6",
    description: "MCP planner read tools drift from CLI handler JSON envelopes after merge",
    severity: "low",
    mitigation:
      "WBS-12 field-by-field MCP/CLI parity suite runs in CI for all five v1 read tools before MCP registration merges"
  },
  {
    id: "R7",
    description: "Agents mutate with stale planningGeneration after MCP read-only session without refreshing flow-status",
    severity: "medium",
    mitigation:
      "planner-packet and get-planner-flow-status surface planningGeneration and recommendedNextCommand; Tier B commands reject mismatch with explicit error code"
  },
  {
    id: "R8",
    description: "Twenty-row WBS scope slips across phase boundary or blocks phase closeout",
    severity: "medium",
    mitigation:
      "Phase 143 delivers core CLI+MCP read stack (WBS-1–12, 16, 20, 22); Phase 144 owns legacy sunset, adoption, and dogfood (WBS-13–15, 18, 24) with explicit dependency gates"
  }
];

artifact.phaseRecommendations = [
  {
    phaseKey: "143",
    label: "Phase 143",
    rationale:
      "Primary delivery slice: CLI planner reads and authoring (WBS-1–5), full P0 MCP read wrappers and agent_start routing (WBS-6–11), MCP/CLI parity (WBS-12), and risk harness rows for budget overflow, flow contract, and append/patch conflicts (WBS-16, 20, 22). Aligns with current workspace kit phase 143.",
    isPrimary: true
  },
  {
    phaseKey: "144",
    label: "Phase 144",
    rationale:
      "Follow-on slice: legacy build-plan consumer inventory and deprecation (WBS-18, 13), wc-planner-chat adoption and golden-path test (WBS-14), I011 dogfood through accept and finalize dryRun (WBS-15), then build-plan removal after gates pass (WBS-24). Prevents legacy deletion from blocking core read-tool delivery in 143.",
    isPrimary: false
  }
];

artifact.valueAssessment = {
  ...artifact.valueAssessment,
  rationale:
    "Reassessed after v14 rubric pass: residual delivery risk concentrated in legacy sunset (R3) and authoring conflicts (R5); MCP budget and adapter drift lowered via dedicated WBS harness rows. Brainstorm synthesis value 8.0; planning confidence high with 20-row WBS and two-phase split."
};

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
      "I011 v15: reassess risks, phase recommendations (143 core / 144 legacy+dogfood), and assumptions after rubric-clean v14"
  }
});

if (!persistResult.ok) {
  console.error("Persist failed:", JSON.stringify(persistResult, null, 2));
  process.exit(1);
}

const review = runWk("review-plan-artifact", {
  planId: PLAN_ID,
  version: 15,
  profile: "full-feature"
});

const d = review.data;
console.log("v15 persisted");
console.log("review passed:", d.passed, "| blockers:", d.blockerCount, "| warnings:", d.warningCount);
