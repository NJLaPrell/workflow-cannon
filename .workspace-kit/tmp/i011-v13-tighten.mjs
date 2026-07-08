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
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v12.json`, "utf8")
);
const artifact = {};
for (const [key, value] of Object.entries(raw)) {
  if (!ENVELOPE_KEYS.has(key)) artifact[key] = value;
}
artifact.status = "draft";
artifact.version = 13;

const patches = {
  "WBS-1": {
    acceptanceCriteria: [
      "Tier C read-only command requires no policyApproval on the read path",
      "Unit and integration tests pass with agent-cli-snippets entry added",
      "Command merges and ships before WBS-6 planner-packet MCP tool lands"
    ],
    doneMeans:
      "Operators and agents discover golden-path stage, blockers, and recommended next CLI command without reading playbooks"
  },
  "WBS-2": {
    acceptanceCriteria: [
      "Tier C read-only command exposes fixture-shaped PlanArtifact skeleton JSON",
      "Returned template validates against plan-artifact.v1 JSON schema on every run",
      "Command merges and ships before WBS-6 planner-packet MCP tool lands"
    ],
    doneMeans:
      "Agents fetch a minimal valid PlanArtifact template without opening schema or fixture files on disk"
  },
  "WBS-3": {
    acceptanceCriteria: [
      "Tier B mutation requires policyApproval and expectedPlanningGeneration when policy is require",
      "Agents append single WBS rows without resubmitting the full artifact JSON body",
      "append-wbs-row.test.mjs covers happy path and schema validation failure cases"
    ],
    doneMeans:
      "Agents add WBS rows incrementally to unified IdeaPlan drafts with schema-valid persistence and generation checks"
  },
  "WBS-4": {
    acceptanceCriteria: [
      "Tier B mutation requires policyApproval for partial plan section update argv",
      "Patch identity, goals, or single WBS row by id without full artifact rebuild",
      "patch-plan-artifact.test.mjs covers valid patches and explicit rejection paths"
    ],
    doneMeans:
      "Agents patch named plan sections incrementally without hand-editing artifact JSON files on disk"
  },
  "WBS-5": {
    acceptanceCriteria: [
      "All v1 planner MCP read tools registered in output-budgets.ts budget map",
      "Truncation ladder documented in mcp-tool-version-policy with explicit field drop order"
    ],
    doneMeans:
      "MCP output budget contract is defined and documented before any planner read tool registration ships to production"
  },
  "WBS-6": {
    acceptanceCriteria: [
      "MCP wrapper ships only after get-planner-flow-status and template CLI handlers merge",
      "planner-packet JSON envelope stays within twenty kilobyte registered output budget",
      "Tool is read-only with no mutation argv passthrough per ADR adapter boundary"
    ],
    doneMeans:
      "Agents bootstrap planner-chat context via single MCP read without shelling multiple discovery commands first"
  },
  "WBS-7": {
    doneMeans:
      "Operators list Ideas rows via MCP read tool with sixteen kilobyte budget envelope and CLI parity"
  },
  "WBS-8": {
    acceptanceCriteria: [
      "get-plan-artifact MCP response stays within sixteen kilobyte registered output budget",
      "includeArtifact flag is optional and bounded when present in tool argv"
    ],
    doneMeans:
      "Agents read plan artifact summaries and bounded full payloads via MCP without direct filesystem access"
  },
  "WBS-9": {
    acceptanceCriteria: [
      "plan-review-packet MCP response stays within sixteen kilobyte registered output budget",
      "Rubric blockers and warnings preview uses read-only review-plan-artifact handler path"
    ],
    doneMeans:
      "Agents inspect plan rubric blockers and warnings via MCP without recording reviewed status on the artifact"
  },
  "WBS-10": {
    acceptanceCriteria: [
      "finalize-preview-packet MCP response stays within sixteen kilobyte registered output budget"
    ],
    doneMeans:
      "Agents preview finalize task drafts via MCP read wrapper without persisting phase tasks to the task store"
  },
  "WBS-11": {
    acceptanceCriteria: [
      "agent_start planner branch payload stays within six kilobyte routing metadata budget",
      "Routing branch lists all v1 planner MCP tool names without duplicating planner-packet fields"
    ],
    doneMeans:
      "Cold-start agent sessions route to planner MCP tools using lightweight routing metadata only per D2"
  },
  "WBS-12": {
    doneMeans:
      "Continuous integration gate proves MCP planner read tools match CLI handler JSON envelopes field by field"
  },
  "WBS-13": {
    acceptanceCriteria: [
      "WBS-18 consumer inventory document merged before deprecation warnings land in CLI",
      "CLI build-plan emits stderr deprecation warnings pointing to Ideas planner-chat primary path",
      "Repository contains no build-plan-for-idea bridge command or instruction stub after review",
      "planner-chat remains documented and tested as sole primary planning interview path"
    ],
    doneMeans:
      "Legacy build-plan interview path shows deprecation warnings while remaining callable until WBS-24 deletion gate passes"
  },
  "WBS-14": {
    doneMeans:
      "wc-planner-chat skill pack ships alongside golden-path integration test proving CLI and MCP fallback table per step"
  },
  "WBS-15": {
    acceptanceCriteria: [
      "I011 plan reaches accepted status via accept-plan-artifact with operator policy approval",
      "finalize-plan-to-phase dryRun returns task draft preview without persisting tasks to phase",
      "Dogfood evidence recorded in plan provenance notes or maintainer plan document appendix"
    ],
    testingVerification: [
      "test/planner-golden-path-agent.test.mjs covers I011 dogfood checklist assertions"
    ],
    doneMeans:
      "I011 IdeaPlan proves end-to-end planner toolset through accept and finalize dryRun using new v1 commands"
  },
  "WBS-16": {
    acceptanceCriteria: [
      "Stress fixtures with twenty plus WBS rows land under fixtures/planning directory",
      "Overflow tests prove D3 truncation ladder field drop order under oversized IdeaPlan payloads",
      "CI gate fails when planner-packet response exceeds twenty kilobyte registered budget"
    ],
    doneMeans:
      "R1 MCP budget overflow risk is mitigated with automated truncation stress evidence running in continuous integration"
  },
  "WBS-18": {
    acceptanceCriteria: [
      "Consumer inventory document lists all build-plan callers and dashboard touchpoints before deletion",
      "CLI build-plan emits deprecation warnings on every invocation after deprecation shim merges",
      "Dashboard copy points operators to Ideas row planner-chat as the primary planning path"
    ],
    doneMeans:
      "R3 first half complete with known consumers documented and deprecation shim shipped before any build-plan removal"
  },
  "WBS-20": {
    acceptanceCriteria: [
      "Integration tests cover IdeaPlan document, chat session, and Ideas row status surfaces",
      "update-idea-planning-session rejects illegal status transitions with explicit schema errors",
      "get-planner-flow-status reports mismatches between unified document and active session state"
    ],
    doneMeans:
      "Three planner state machines stay aligned with contract tests catching drift in continuous integration on every PR"
  },
  "WBS-22": {
    acceptanceCriteria: [
      "Tests cover plan-artifact-version-conflict when supplied artifact version is not next",
      "Tests cover planning-generation-mismatch when expectedPlanningGeneration token is stale",
      "Tests cover clientMutationId idempotent replay for append and patch mutation argv"
    ],
    doneMeans:
      "append-wbs-row and patch-plan-artifact cannot silently corrupt drafts under version conflict or idempotent replay scenarios"
  },
  "WBS-24": {
    acceptanceCriteria: [
      "WBS-15 I011 dogfood evidence complete before build-plan command deletion PR merges",
      "WBS-14 golden-path integration test passes in CI before removal PR merges to main",
      "build-plan command and instruction files removed from repository after both gates pass",
      "planner-chat remains documented and tested as sole primary planning interview path"
    ],
    doneMeans:
      "Legacy build-plan interview path is fully removed only after golden-path test and I011 dogfood evidence gates pass"
  }
};

for (const row of artifact.wbs) {
  const patch = patches[row.wbsId];
  if (!patch) continue;
  if (patch.acceptanceCriteria) row.acceptanceCriteria = patch.acceptanceCriteria;
  if (patch.doneMeans) row.doneMeans = patch.doneMeans;
  if (patch.testingVerification) row.testingVerification = patch.testingVerification;
}

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
    rationale: "I011 v13: tighten WBS acceptance criteria and doneMeans to reduce rubric warnings"
  }
});

if (!persistResult.ok) {
  console.error("Persist failed:", JSON.stringify(persistResult, null, 2));
  process.exit(1);
}

console.log("v13 persisted, version:", persistResult.data?.version);
