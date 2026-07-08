import fs from "node:fs";
import { spawnSync } from "node:child_process";

const PLAN_ID = "d0283a5e-a782-4700-83c0-7a5824d6dd3c";
const v11Path = `.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v11.json`;
const raw = JSON.parse(fs.readFileSync(v11Path, "utf8"));

const ENVELOPE_KEYS = new Set([
  "ideaId",
  "brainstorm",
  "plan",
  "agentDirective",
  "createdAt",
  "updatedAt"
]);

const artifact = {};
for (const [key, value] of Object.entries(raw)) {
  if (!ENVELOPE_KEYS.has(key)) {
    artifact[key] = value;
  }
}
artifact.status = "draft";
artifact.version = 12;

const wbs13 = artifact.wbs.find((r) => r.wbsId === "WBS-13");
wbs13.title = "Deprecate build-plan legacy path (warnings only)";
wbs13.suggestedTaskTitle = "Deprecate build-plan interview legacy path";
wbs13.approach =
  "Consumer inventory (WBS-18) first; ship deprecation notices and dashboard copy pointing to Ideas/planner-chat; build-plan remains callable with warnings — no deletion in this row";
wbs13.acceptanceCriteria = [
  "WBS-18 consumer inventory complete",
  "Deprecation warnings shipped",
  "build-plan still callable with warn",
  "No build-plan-for-idea bridge",
  "planner-chat remains sole primary path"
];
wbs13.dependsOn = ["WBS-6", "WBS-18"];
wbs13.doneMeans = "Legacy path deprecated; removal gated on WBS-24";
wbs13.generatedTaskPayload = {
  title: "Deprecate build-plan legacy interview path",
  approach: "Warnings and dashboard copy only; defer deletion to WBS-24",
  technicalScope: ["src/modules/planning/build-plan*", "extensions/cursor-workflow-cannon"],
  acceptanceCriteria: ["Deprecation shipped; build-plan not deleted yet"]
};

const newRows = [
  {
    wbsId: "WBS-16",
    path: "16",
    title: "MCP truncation stress fixtures + overflow tests",
    goalMapping: ["Full P0 MCP read set in v1"],
    suggestedTaskTitle: "Add MCP planner truncation stress fixtures and overflow tests",
    approach:
      "Fixture IdeaPlan with 20+ WBS rows, long ideation notes, 2 brainstorm sessions; assert planner-packet stays <=20KB and truncation ladder drops fields in D3 order",
    technicalScope: ["fixtures/planning/", "test/mcp-planner-truncation-stress.test.mjs"],
    acceptanceCriteria: ["Stress fixtures land", "Overflow tests prove D3 ladder", "CI gate for R1"],
    testingVerification: ["test/mcp-planner-truncation-stress.test.mjs"],
    dependsOn: ["WBS-5", "WBS-6"],
    sizingConfidence: "medium",
    doneMeans: "R1 budget overflow mitigated with evidence",
    generatedTaskPayload: {
      title: "MCP planner truncation stress tests",
      approach: "Large fixtures + budget overflow assertions",
      technicalScope: ["test/", "fixtures/planning/"],
      acceptanceCriteria: ["Truncation ladder proven under load"]
    }
  },
  {
    wbsId: "WBS-18",
    path: "18",
    title: "Legacy build-plan consumer inventory + deprecation shim",
    goalMapping: [
      "Deprecate and remove legacy build-plan interview path; keep separate from primary planner-chat"
    ],
    suggestedTaskTitle: "Inventory build-plan consumers and ship deprecation shim",
    approach:
      "Grep/dashboard audit for build-plan, planningSession, build-plan-session; document consumers; ship deprecation warnings before WBS-13/WBS-24",
    technicalScope: [
      "src/modules/planning/build-plan*",
      "extensions/cursor-workflow-cannon",
      ".ai/runbooks/planning-workflow.md"
    ],
    acceptanceCriteria: [
      "Consumer inventory documented",
      "Deprecation warnings shipped",
      "Dashboard copy points to Ideas/planner-chat"
    ],
    testingVerification: ["test/build-plan-deprecation-shim.test.mjs"],
    dependsOn: ["WBS-6"],
    sizingConfidence: "medium",
    doneMeans: "R3 first half closed — consumers known before removal",
    generatedTaskPayload: {
      title: "build-plan consumer inventory and deprecation shim",
      approach: "Audit + warn before delete",
      technicalScope: ["src/modules/planning", "extensions/cursor-workflow-cannon"],
      acceptanceCriteria: ["Inventory doc + deprecation warnings"]
    }
  },
  {
    wbsId: "WBS-20",
    path: "20",
    title: "Planner flow contract tests (three state machines)",
    goalMapping: ["Agents complete Idea→Plan→Tasks without hand-editing files or slurping schemas/playbooks"],
    suggestedTaskTitle: "Add planner flow contract integration tests",
    approach:
      "Integration tests: draft_ready != completed; brainstorming vs planning; update-idea-planning-session rejects illegal transitions; get-planner-flow-status reports mismatches",
    technicalScope: ["test/planner-flow-contract.test.mjs", "src/modules/ideas"],
    acceptanceCriteria: [
      "Three state surfaces tested",
      "Illegal transitions rejected",
      "flow-status surfaces mismatches"
    ],
    testingVerification: ["test/planner-flow-contract.test.mjs"],
    dependsOn: ["WBS-1"],
    sizingConfidence: "medium",
    doneMeans: "IdeaPlan vs chat session vs Ideas row drift caught in CI",
    generatedTaskPayload: {
      title: "Planner flow contract tests",
      approach: "Three state machine integration coverage",
      technicalScope: ["test/", "src/modules/ideas"],
      acceptanceCriteria: ["Contract tests pass in CI"]
    }
  },
  {
    wbsId: "WBS-22",
    path: "22",
    title: "append/patch conflict + idempotency test matrix",
    goalMapping: ["Incremental plan authoring via append-wbs-row and patch-plan-artifact in v1"],
    suggestedTaskTitle: "Add append/patch conflict and idempotency test matrix",
    approach:
      "Tests for plan-artifact-version-conflict, planning-generation-mismatch, invalid partial patch paths, clientMutationId replay",
    technicalScope: ["test/append-patch-conflict-matrix.test.mjs", "src/modules/planning"],
    acceptanceCriteria: [
      "Version conflict cases covered",
      "planningGeneration mismatch covered",
      "Idempotent replay covered"
    ],
    testingVerification: ["test/append-patch-conflict-matrix.test.mjs"],
    dependsOn: ["WBS-3", "WBS-4"],
    sizingConfidence: "medium",
    doneMeans: "WBS-3/4 authoring cannot silently corrupt drafts",
    generatedTaskPayload: {
      title: "append/patch conflict test matrix",
      approach: "Conflict, generation, idempotency coverage",
      technicalScope: ["test/", "src/modules/planning"],
      acceptanceCriteria: ["Matrix tests pass"]
    }
  },
  {
    wbsId: "WBS-24",
    path: "24",
    title: "Remove build-plan after golden-path + dogfood gate",
    goalMapping: [
      "Deprecate and remove legacy build-plan interview path; keep separate from primary planner-chat"
    ],
    suggestedTaskTitle: "Remove build-plan after v1 golden-path and dogfood evidence",
    approach:
      "Delete build-plan command and runbook references only after WBS-13 deprecation, WBS-14 golden-path test, and WBS-15 dogfood — do not merge into planner-chat",
    technicalScope: [
      "src/modules/planning/build-plan*",
      ".ai/runbooks/planning-workflow.md",
      "extensions/cursor-workflow-cannon"
    ],
    acceptanceCriteria: [
      "WBS-15 dogfood complete",
      "WBS-14 golden-path test green",
      "build-plan removed",
      "planner-chat remains sole primary path"
    ],
    testingVerification: ["test/build-plan-removal.test.mjs"],
    dependsOn: ["WBS-13", "WBS-14", "WBS-15"],
    sizingConfidence: "medium",
    doneMeans: "Legacy interview path removed after v1 proven",
    generatedTaskPayload: {
      title: "Remove build-plan legacy path post-dogfood",
      approach: "Deletion gated on golden-path + I011 dogfood",
      technicalScope: ["src/modules/planning"],
      acceptanceCriteria: ["build-plan removed after WBS-15"]
    }
  }
];

artifact.wbs.push(...newRows);

const validatePayload = { persist: false, artifact };
const validate = spawnSync("pnpm", ["exec", "wk", "run", "draft-plan-artifact", JSON.stringify(validatePayload)], {
  encoding: "utf8",
  cwd: process.cwd()
});
console.log("VALIDATE STDOUT:", validate.stdout);
if (validate.status !== 0) {
  console.error("VALIDATE STDERR:", validate.stderr);
  process.exit(validate.status ?? 1);
}
const validateResult = JSON.parse(validate.stdout);
if (!validateResult.ok) {
  console.error("Validation failed:", JSON.stringify(validateResult, null, 2));
  process.exit(1);
}

const genOut = spawnSync("pnpm", ["exec", "wk", "run", "get-idea", '{"ideaId":"I011"}'], {
  encoding: "utf8",
  cwd: process.cwd()
});
const gen = JSON.parse(genOut.stdout).data.planningGeneration;

const persistPayload = {
  persist: true,
  artifact,
  expectedPlanningGeneration: gen,
  policyApproval: {
    confirmed: true,
    rationale: "I011 v12: add minimal 5 risk-mitigation WBS rows; split build-plan deprecate vs remove"
  }
};

const persist = spawnSync("pnpm", ["exec", "wk", "run", "draft-plan-artifact", JSON.stringify(persistPayload)], {
  encoding: "utf8",
  cwd: process.cwd()
});
console.log("PERSIST STDOUT:", persist.stdout);
if (persist.status !== 0) {
  console.error("PERSIST STDERR:", persist.stderr);
  process.exit(persist.status ?? 1);
}
const persistResult = JSON.parse(persist.stdout);
if (!persistResult.ok) {
  console.error("Persist failed:", JSON.stringify(persistResult, null, 2));
  process.exit(1);
}
console.log("SUCCESS version", persistResult.data?.version ?? persistResult.version);
