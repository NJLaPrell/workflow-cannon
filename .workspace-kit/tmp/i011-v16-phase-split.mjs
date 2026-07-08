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

/** Subagent model hint — cite canon maps + recommend-model CLI. */
function dispatchHint({
  tier = "cheap_fast",
  slug = "composer-2.5",
  subagentType = "generalPurpose",
  complexity = "low",
  risk = "low",
  scopeBreadth = "low",
  extra = ""
}) {
  const base = `Subagent dispatch: pnpm exec wk run recommend-model '{"subagentType":"${subagentType}","complexity":"${complexity}","risk":"${risk}","scopeBreadth":"${scopeBreadth}"}' — expect ${slug} (${tier}) per .ai/cursor-model-selection-map.v1.json tierDefaults / .ai/model-selection-map.json budget tier`;
  return extra ? `${base}. ${extra}` : base;
}

const raw = JSON.parse(
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v15.json`, "utf8")
);
const artifact = {};
for (const [key, value] of Object.entries(raw)) {
  if (!ENVELOPE_KEYS.has(key)) artifact[key] = value;
}
artifact.status = "draft";
artifact.version = 16;

const wbs = artifact.wbs;
const byId = Object.fromEntries(wbs.map((r) => [r.wbsId, r]));

function patchRow(id, patch) {
  const { generatedTaskPayload, ...rest } = patch;
  Object.assign(byId[id], rest);
  if (generatedTaskPayload) {
    byId[id].generatedTaskPayload = {
      ...byId[id].generatedTaskPayload,
      ...generatedTaskPayload
    };
  }
}

function makeParityRow({ wbsId, path, mcpWbs, toolName, testFile }) {
  return {
    wbsId,
    path,
    title: `MCP/CLI parity test — ${toolName}`,
    goalMapping: [...byId[mcpWbs].goalMapping],
    suggestedTaskTitle: `Add MCP/CLI parity test for ${toolName}`,
    approach: `Single-tool field-by-field envelope parity between MCP ${toolName} and its CLI handler; one test file only. Covers US-10 thin MCP wrapper parity. ${dispatchHint({ tier: "cheap_fast", complexity: "low", risk: "low", scopeBreadth: "low", extra: "One test file; ideal isolated subagent task" })}`,
    technicalScope: [testFile, "src/mcp/server.ts"],
    acceptanceCriteria: [
      `Parity test ${testFile} asserts MCP ${toolName} matches CLI JSON envelope`,
      "Test runs in pnpm test CI without importing playbook or schema files from disk",
      `Depends only on ${mcpWbs} handler landing before parity PR merges`
    ],
    testingVerification: [testFile],
    dependsOn: [mcpWbs],
    recommendedPhase: "143",
    recommendedOrder: path * 10,
    sizingConfidence: "high",
    riskNotes: dispatchHint({ subagentType: "generalPurpose", complexity: "low", risk: "low", scopeBreadth: "low" }),
    doneMeans: `Continuous integration proves ${toolName} MCP adapter matches CLI handler field by field in isolation`,
    generatedTaskPayload: {
      title: `Parity test for ${toolName}`,
      approach: "Single-tool MCP/CLI envelope parity",
      technicalScope: [testFile],
      acceptanceCriteria: [`${testFile} passes in CI`],
      phaseKey: "143"
    }
  };
}

// --- Replace monolithic WBS-12 with per-tool parity rows ---
const wbs12Index = wbs.findIndex((r) => r.wbsId === "WBS-12");
const parityRows = [
  makeParityRow({
    wbsId: "WBS-12",
    path: "12",
    mcpWbs: "WBS-6",
    toolName: "workflow-cannon.planner-packet",
    testFile: "test/mcp-planner-packet-parity.test.mjs"
  }),
  makeParityRow({
    wbsId: "WBS-26",
    path: "26",
    mcpWbs: "WBS-7",
    toolName: "workflow-cannon.list-ideas",
    testFile: "test/mcp-list-ideas-parity.test.mjs"
  }),
  makeParityRow({
    wbsId: "WBS-27",
    path: "27",
    mcpWbs: "WBS-8",
    toolName: "workflow-cannon.get-plan-artifact",
    testFile: "test/mcp-get-plan-artifact-parity.test.mjs"
  }),
  makeParityRow({
    wbsId: "WBS-28",
    path: "28",
    mcpWbs: "WBS-9",
    toolName: "workflow-cannon.plan-review-packet",
    testFile: "test/mcp-plan-review-packet-parity.test.mjs"
  }),
  makeParityRow({
    wbsId: "WBS-29",
    path: "29",
    mcpWbs: "WBS-10",
    toolName: "workflow-cannon.finalize-preview-packet",
    testFile: "test/mcp-finalize-preview-packet-parity.test.mjs"
  })
];

const wbs30 = {
  wbsId: "WBS-30",
  path: "30",
  title: "Planner MCP parity CI gate wiring",
  goalMapping: [...byId["WBS-6"].goalMapping],
  suggestedTaskTitle: "Wire planner MCP parity tests into CI pre-merge-gates",
  approach: `Import or register WBS-12 and WBS-26–29 parity tests in shared harness; fail closed on adapter drift. ${dispatchHint({ tier: "cheap_fast", complexity: "low", risk: "low", scopeBreadth: "low" })}`,
  technicalScope: ["test/mcp-planner-parity.test.mjs", "package.json", ".github/workflows"],
  acceptanceCriteria: [
    "pre-merge-gates or pnpm test fails when any planner MCP parity test regresses",
    "Shared harness re-exports or aggregates WBS-12 and WBS-26 through WBS-29 test modules",
    "CI documentation notes parity suite is required before MCP planner tools release tag"
  ],
  testingVerification: ["test/mcp-planner-parity.test.mjs"],
  dependsOn: ["WBS-12", "WBS-26", "WBS-27", "WBS-28", "WBS-29"],
  recommendedPhase: "143",
  recommendedOrder: 130,
  sizingConfidence: "high",
  riskNotes: dispatchHint({ complexity: "low", risk: "low", scopeBreadth: "low" }),
  doneMeans: "All five planner MCP read tools have a single CI gate that blocks merge on CLI adapter envelope drift",
  generatedTaskPayload: {
    title: "Wire planner MCP parity CI gate",
    approach: "Aggregate per-tool parity tests into pre-merge-gates",
    technicalScope: ["test/", "package.json"],
    acceptanceCriteria: ["CI parity gate blocks adapter drift"],
    phaseKey: "143"
  }
};

wbs.splice(wbs12Index, 1, ...parityRows, wbs30);

// --- Split WBS-14 skill pack vs golden-path ---
patchRow("WBS-14", {
  title: "wc-planner-chat skill pack (adoption docs only)",
  suggestedTaskTitle: "Ship wc-planner-chat skill pack",
  approach: `Markdown skill pack only: v1 MCP tool names, CLI fallback table, planningGeneration hygiene. No runtime code. Covers US-6 and US-11. ${dispatchHint({ subagentType: "explore", tier: "cheap_fast", complexity: "low", risk: "low", scopeBreadth: "low", extra: "Docs-only; no TypeScript changes" })}`,
  technicalScope: [".cursor/skills/wc-planner-chat/SKILL.md", ".ai/backlogs/skill-pack-first-party-v1.md"],
  acceptanceCriteria: [
    "Skill pack documents all five v1 MCP read tools and matching CLI fallbacks",
    "Each planner-chat step lists recommend-model hint for cheap_fast subagent dispatch",
    "Skill pack lands without modifying src/ runtime modules"
  ],
  testingVerification: ["Skill pack review checklist section includes verify steps for each tool"],
  dependsOn: ["WBS-11"],
  recommendedPhase: "144",
  recommendedOrder: 40,
  riskNotes: dispatchHint({ subagentType: "explore", complexity: "low", risk: "low", scopeBreadth: "low" }),
  doneMeans: "Agents adopt planner-chat flow via skill pack without reading playbooks or schema files on disk",
  generatedTaskPayload: {
    title: "wc-planner-chat skill pack",
    approach: "Adoption docs only",
    technicalScope: [".cursor/skills"],
    acceptanceCriteria: ["Skill pack covers v1 tool set"],
    phaseKey: "144"
  }
});

const wbs25 = {
  wbsId: "WBS-25",
  path: "25",
  title: "Planner golden-path agent integration test",
  goalMapping: [...byId["WBS-14"].goalMapping],
  suggestedTaskTitle: "Add planner golden-path integration test without file reads",
  approach: `Integration test: create-idea through finalize dryRun using CLI/MCP stubs; no playbook slurping. Covers US-14. ${dispatchHint({ tier: "balanced", slug: "gpt-5.3-codex", complexity: "medium", risk: "medium", scopeBreadth: "medium", extra: "Multi-step harness; escalate only if test design ambiguous" })}`,
  technicalScope: ["test/planner-golden-path-agent.test.mjs"],
  acceptanceCriteria: [
    "Golden-path test exercises CLI planner commands without reading schemas or playbooks from disk",
    "Test runs in pnpm test CI and fails when recommendedNextCommand chain breaks",
    "Test imports only public CLI/MCP handler entrypoints under test/"
  ],
  testingVerification: ["test/planner-golden-path-agent.test.mjs"],
  dependsOn: ["WBS-30", "WBS-14"],
  recommendedPhase: "144",
  recommendedOrder: 50,
  sizingConfidence: "medium",
  riskNotes: dispatchHint({ tier: "balanced", slug: "gpt-5.3-codex", complexity: "medium", risk: "medium", scopeBreadth: "medium" }),
  doneMeans: "Regression harness proves Idea through finalize dryRun golden path without maintainer playbook file reads",
  generatedTaskPayload: {
    title: "Planner golden-path integration test",
    approach: "End-to-end CLI path without file reads",
    technicalScope: ["test/planner-golden-path-agent.test.mjs"],
    acceptanceCriteria: ["Golden-path CI test passes"],
    phaseKey: "144"
  }
};

// --- Split WBS-18 inventory vs shim ---
patchRow("WBS-18", {
  title: "Legacy build-plan consumer inventory (audit doc only)",
  suggestedTaskTitle: "Document build-plan consumer inventory before deprecation",
  approach: `Grep and dashboard audit only; output inventory markdown under docs/maintainers or .ai/. No code deletion. ${dispatchHint({ subagentType: "explore", tier: "cheap_fast", complexity: "low", risk: "low", scopeBreadth: "low" })}`,
  technicalScope: [
    "src/modules/planning/build-plan*",
    "extensions/cursor-workflow-cannon",
    ".ai/runbooks/planning-workflow.md"
  ],
  acceptanceCriteria: [
    "Consumer inventory document lists all build-plan callers and dashboard touchpoints",
    "Inventory reviewed before any deprecation warning code merges to main branch",
    "Document links replacement path to Ideas row planner-chat primary flow"
  ],
  testingVerification: ["test/build-plan-inventory-checklist.test.mjs verifies inventory doc paths exist"],
  dependsOn: ["WBS-6"],
  recommendedPhase: "144",
  recommendedOrder: 10,
  riskNotes: dispatchHint({ subagentType: "explore", complexity: "low", risk: "low", scopeBreadth: "low" }),
  doneMeans: "Maintainers have a complete build-plan consumer inventory before deprecation shim or removal work begins",
  generatedTaskPayload: {
    title: "build-plan consumer inventory",
    approach: "Audit doc only",
    technicalScope: ["extensions/cursor-workflow-cannon"],
    acceptanceCriteria: ["Inventory document merged"],
    phaseKey: "144"
  }
});

const wbs31 = {
  wbsId: "WBS-31",
  path: "31",
  title: "build-plan deprecation shim (warnings + dashboard copy)",
  goalMapping: [...byId["WBS-18"].goalMapping],
  suggestedTaskTitle: "Ship build-plan deprecation warnings and dashboard redirect copy",
  approach: `Implement stderr warnings on build-plan CLI and dashboard copy pointing to Ideas/planner-chat after WBS-18 inventory merges. ${dispatchHint({ tier: "balanced", complexity: "medium", risk: "medium", scopeBreadth: "medium" })}`,
  technicalScope: [
    "src/modules/planning/build-plan*",
    "extensions/cursor-workflow-cannon"
  ],
  acceptanceCriteria: [
    "CLI build-plan emits stderr deprecation warnings on every invocation after shim merges",
    "Dashboard copy points operators to Ideas row planner-chat as primary planning path",
    "No build-plan command deletion in this row — removal stays gated on WBS-24"
  ],
  testingVerification: ["test/build-plan-deprecation-shim.test.mjs"],
  dependsOn: ["WBS-18"],
  recommendedPhase: "144",
  recommendedOrder: 20,
  sizingConfidence: "medium",
  riskNotes: dispatchHint({ tier: "balanced", complexity: "medium", risk: "medium", scopeBreadth: "medium" }),
  doneMeans: "Operators see deprecation warnings and dashboard redirect before build-plan command is deleted in WBS-24",
  generatedTaskPayload: {
    title: "build-plan deprecation shim",
    approach: "Warnings and dashboard copy",
    technicalScope: ["src/modules/planning"],
    acceptanceCriteria: ["Deprecation warnings ship"],
    phaseKey: "144"
  }
};

// Insert new rows after WBS-24 (end of list)
wbs.push(wbs25, wbs31);

// --- Phase 143 core rows: recommendedPhase, order, dispatch hints ---
const phase143 = {
  "WBS-1": { order: 10, complexity: "low", risk: "low", scope: "low" },
  "WBS-2": { order: 11, complexity: "low", risk: "low", scope: "low" },
  "WBS-20": { order: 12, complexity: "medium", risk: "low", scope: "medium", tier: "balanced", slug: "gpt-5.3-codex" },
  "WBS-5": { order: 20, complexity: "low", risk: "low", scope: "low" },
  "WBS-3": { order: 30, complexity: "medium", risk: "medium", scope: "medium", tier: "balanced", slug: "gpt-5.3-codex" },
  "WBS-4": { order: 31, complexity: "medium", risk: "medium", scope: "medium", tier: "balanced", slug: "gpt-5.3-codex" },
  "WBS-22": { order: 35, complexity: "medium", risk: "medium", scope: "medium", tier: "balanced", slug: "gpt-5.3-codex" },
  "WBS-6": { order: 40, complexity: "low", risk: "low", scope: "low" },
  "WBS-7": { order: 41, complexity: "low", risk: "low", scope: "low" },
  "WBS-8": { order: 42, complexity: "low", risk: "low", scope: "low" },
  "WBS-9": { order: 43, complexity: "low", risk: "low", scope: "low" },
  "WBS-10": { order: 44, complexity: "low", risk: "low", scope: "low" },
  "WBS-11": { order: 50, complexity: "low", risk: "low", scope: "low" },
  "WBS-16": { order: 140, complexity: "medium", risk: "low", scope: "medium", tier: "balanced", slug: "gpt-5.3-codex" }
};

for (const [id, cfg] of Object.entries(phase143)) {
  if (!byId[id]) continue;
  patchRow(id, {
    recommendedPhase: "143",
    recommendedOrder: cfg.order,
    riskNotes: dispatchHint({
      tier: cfg.tier || "cheap_fast",
      slug: cfg.slug || "composer-2.5",
      complexity: cfg.complexity,
      risk: cfg.risk,
      scopeBreadth: cfg.scope
    }),
    generatedTaskPayload: { phaseKey: "143" }
  });
}

// Phase 144 remaining
for (const [id, order, cfg] of [
  ["WBS-13", 30, { tier: "balanced", complexity: "medium", risk: "medium", scope: "medium" }],
  ["WBS-15", 60, { tier: "balanced", complexity: "medium", risk: "medium", scope: "medium" }],
  ["WBS-24", 70, { tier: "balanced", complexity: "medium", risk: "high", scope: "medium", slug: "gpt-5.3-codex" }]
]) {
  patchRow(id, {
    recommendedPhase: "144",
    recommendedOrder: order,
    riskNotes: dispatchHint({
      tier: cfg.tier,
      slug: cfg.slug || "composer-2.5",
      complexity: cfg.complexity,
      risk: cfg.risk,
      scopeBreadth: cfg.scope
    }),
    generatedTaskPayload: { phaseKey: "144" }
  });
}

// Dependency fixes after splits
patchRow("WBS-13", { dependsOn: ["WBS-6", "WBS-31"] });
patchRow("WBS-15", {
  dependsOn: ["WBS-3", "WBS-4", "WBS-25", "WBS-14"],
  approach: `${byId["WBS-15"].approach.split(" Covers")[0]} Covers US-12 dogfood I011 via planner-chat and accept/finalize dryRun using new tools.`
});
patchRow("WBS-24", {
  dependsOn: ["WBS-13", "WBS-25", "WBS-15"],
  acceptanceCriteria: [
    "WBS-15 I011 dogfood evidence complete before build-plan command deletion PR merges",
    "WBS-25 golden-path integration test passes in CI before removal PR merges to main",
    "build-plan command and instruction files removed from repository after both gates pass",
    "planner-chat remains documented and tested as sole primary planning interview path"
  ]
});

// Update risks R6 R8
const r6 = artifact.riskAssessment.find((r) => r.id === "R6");
if (r6) {
  r6.mitigation =
    "Per-tool parity rows WBS-12 and WBS-26–29 plus WBS-30 CI gate; each row sized for cheap_fast subagent (composer-2.5)";
}
const r8 = artifact.riskAssessment.find((r) => r.id === "R8");
if (r8) {
  r8.description = "Twenty-six-row WBS scope slips or overloads subagents without model-tier discipline";
  r8.mitigation =
    "Phase 143 ships core stack in parallel waves (CLI reads → authoring → MCP wrappers → per-tool parity); Phase 144 owns legacy and dogfood; each WBS carries recommend-model dispatch hints";
}

artifact.phaseRecommendations = [
  {
    phaseKey: "143",
    label: "Phase 143 — core planner read stack",
    rationale:
      "Subagent-sized delivery waves: (A) parallel cheap_fast CLI reads WBS-1/2/20; (B) budgets + Tier B authoring WBS-5/3/4/22; (C) parallel MCP thin wrappers WBS-6–11 (composer-2.5 each); (D) per-tool parity WBS-12/26–29 + WBS-30 CI gate; (E) truncation stress WBS-16. Orchestrator runs recommend-model before each Task spawn; default cheap_fast (~$1.50/M composer-2.5 per .ai/model-selection-map.json).",
    isPrimary: true
  },
  {
    phaseKey: "144",
    label: "Phase 144 — legacy sunset + adoption proof",
    rationale:
      "Lower-risk follow-on: explore-tier inventory WBS-18; deprecation shim WBS-31 + WBS-13; docs-only skill pack WBS-14; golden-path test WBS-25 (balanced tier); operator dogfood WBS-15; build-plan deletion WBS-24 only after gates. Keeps legacy and integration proof from blocking 143 MCP delivery.",
    isPrimary: false
  }
];

artifact.assumptions = [
  ...artifact.assumptions.filter((a) => !a.includes("Phase 143 maintainer capacity")),
  "Orchestrator agents call recommend-model before Cursor Task subagent spawn using scope signals from each WBS riskNotes",
  "Default subagent model is composer-2.5 (cheap_fast) per .ai/cursor-model-selection-map.v1.json; balanced tier (gpt-5.3-codex) only for Tier B authoring, golden-path harness, and legacy shim rows",
  "Each WBS row is scoped for one subagent session (typically one test file or one CLI command module) unless explicitly marked as orchestrator-only",
  "Phase 143 parallel waves complete before Phase 144 dogfood; WBS-24 removal never starts in 143"
];

artifact.implementationGuidance = [
  ...artifact.implementationGuidance,
  "Before spawning a subagent for any WBS row, run recommend-model with the row riskNotes signals; prefer cheap_fast when complexity/risk/scopeBreadth are low",
  "Dispatch MCP wrapper rows (WBS-6–10) as parallel subagents after WBS-5 lands — each touches only src/mcp/server.ts adapter slice plus one test file",
  "Do not combine per-tool parity rows; merge WBS-12/26–29 only at WBS-30 CI wiring"
];

// wbs row count is implicit in wbs array length at finalize

function runWk(cmd, payload) {
  const result = spawnSync("pnpm", ["exec", "wk", "run", cmd, JSON.stringify(payload)], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    console.error(`wk run ${cmd} failed status=${result.status}`);
    console.error("stderr:", result.stderr?.slice(0, 4000));
    console.error("stdout:", result.stdout?.slice(0, 4000));
    process.exit(result.status ?? 1);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (e) {
    console.error(`wk run ${cmd} JSON parse failed:`, e.message);
    console.error("stdout head:", result.stdout?.slice(0, 500));
    process.exit(1);
  }
}

try {
  const validateResult = runWk("draft-plan-artifact", { persist: false, artifact });
if (!validateResult.ok) {
  console.error("Validation failed:", JSON.stringify(validateResult, null, 2).slice(0, 8000));
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
      "I011 v16: subagent-sized WBS splits, recommend-model dispatch hints, refined 143/144 phase waves"
  }
});

if (!persistResult.ok) {
  console.error("Persist failed:", JSON.stringify(persistResult, null, 2));
  process.exit(1);
}

const review = runWk("review-plan-artifact", {
  planId: PLAN_ID,
  version: 16,
  profile: "full-feature"
});

const d = review.data;
console.log("v16 persisted | wbs:", wbs.length);
console.log("review passed:", d.passed, "| blockers:", d.blockerCount, "| warnings:", d.warningCount);
if (!d.passed) {
  for (const b of d.blockers || []) console.log("BLOCKER:", b.code, b.message);
  for (const w of d.warnings || []) console.log("WARN:", w.wbsId, w.message);
}
} catch (err) {
  console.error("FATAL:", err);
  process.exit(1);
}
