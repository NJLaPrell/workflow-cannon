#!/usr/bin/env node
/**
 * Generate tasks/planner-phase110-batch.json from PLANNER_TASKS.md WBS.
 * Run: node scripts/generate-planner-phase110-batch.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PHASE_KEY = "110";
const PHASE_LABEL = "Phase 110";
const PLAN_REF = "PLANNER_TASKS.md";
const START_ID = 100437;

/** @type {Array<{ wbsId: string, slice: string, title: string, approach: string, scope: string[], ac: string[], dependsOnWbs?: string[] }>} */
const ROWS = [
  { wbsId: "T-0.1", slice: "P0", title: "Inventory planning surface area (A-INV)", approach: "Recon planning module, build-plan session, persist/review drafts, dashboard planningSession; write gap table vs PLANNER.md.", scope: ["Grep src/modules/planning, src/core/planning, extension planning wizard", "Document paths and one-line roles in A-INV"], ac: ["A-INV table exists with path, role, gap note", "No new long-lived doc unless requested"] },
  { wbsId: "T-0.2", slice: "P0", title: "Baseline health for planner work", approach: "Run wk doctor, build, test; record baseline before planner implementation.", scope: ["pnpm run wk doctor", "pnpm run build", "pnpm run test"], ac: ["Baseline captured", "Pre-existing failures noted separately"] },

  { wbsId: "T-A.1", slice: "P0", title: "Write PLANNER_ARCHITECTURE.md (A-ARCH)", approach: "Architecture decision doc: modules, storage, command pipeline, task-engine reuse, dashboard read path.", scope: ["PLANNER_ARCHITECTURE.md with diagram", "Module ownership and persistence decision", "Integration with persist-planning-execution-drafts"], ac: ["A-ARCH ready for human review", "Open questions listed"], dependsOnWbs: ["T-0.1"] },
  { wbsId: "T-A.2", slice: "P0", title: "Write PLANNER_SCHEMA.md (A-SCHEMA)", approach: "PlanArtifact v1 schema spec: sections, WBS shape, approvalRecord, conditional profiles, examples.", scope: ["Required vs optional sections", "Minimal + full JSON examples", "Wishlist/session mapping notes"], ac: ["A-SCHEMA ready for human review"], dependsOnWbs: ["T-A.1"] },
  { wbsId: "T-A.3", slice: "P0", title: "Write PLANNER_COMMANDS.md (A-CONTRACTS, A-POLICY)", approach: "Unified contracts for draft/review/accept/finalize commands plus policy touchpoints.", scope: ["Request/response shapes and response codes", "Dry-run vs persist, idempotency, planning generation", "A-POLICY section for mutation commands"], ac: ["A-CONTRACTS and A-POLICY ready for review"], dependsOnWbs: ["T-A.1", "T-A.2"] },
  { wbsId: "T-A.4", slice: "P0", title: "Write plan review rubric (A-RUBRIC)", approach: "Blocker/warning rules, sizing, Gap 5 coverage, PLANNER Step 4 checks.", scope: ["PLANNER_REVIEW_RUBRIC.md or PLANNER_COMMANDS.md section", "Relationship to ux-cae-pre-persist-v1"], ac: ["A-RUBRIC ready for human review"], dependsOnWbs: ["T-A.2", "T-A.3"] },
  { wbsId: "T-A.5", slice: "P0", title: "Dashboard plan lifecycle mockups (A-UX)", approach: "Wireframes for draft, findings, WBS, accept, finalize preview/persist, errors per PLANNER Step 7.", scope: ["Mockups attached to PR or docs/maintainers/planner-ux/", "Accessibility notes"], ac: ["A-UX ready for human review"], dependsOnWbs: ["T-A.1", "T-A.3"] },
  { wbsId: "T-A.6", slice: "P0", title: "Write PLANNER_TEST_STRATEGY.md (A-TEST)", approach: "Test layers, fixtures, golden path, CI target for planner implementation.", scope: ["Unit/integration/extension/E2E scope", "Blocked-path cases"], ac: ["A-TEST ready for human review"], dependsOnWbs: ["T-A.3"] },
  { wbsId: "T-A.7", slice: "P0", title: "Compatibility note for build-plan (A-COMPAT)", approach: "Section in PLANNER_ARCHITECTURE.md: build-plan, wishlist, planningSession bridge.", scope: ["What stays vs bridges vs deprecates"], ac: ["A-COMPAT ready for human review"], dependsOnWbs: ["T-A.1"] },

  { wbsId: "T-1.1", slice: "P1", title: "PlanArtifact v1 TypeScript types", approach: "Implement src/core/planning/plan-artifact-v1.ts matching A-SCHEMA.", scope: ["Exported types for all PlanArtifact sections", "schemaVersion: 1"], ac: ["Types compile with JSDoc on non-obvious fields"], dependsOnWbs: ["T-A.2"] },
  { wbsId: "T-1.2", slice: "P1", title: "PlanArtifact v1 JSON Schema", approach: "schemas/planning/plan-artifact.v1.schema.json with WBS $ref.", scope: ["Validate minimal fixture", "Reject empty identity/goals"], ac: ["Schema tests pass"], dependsOnWbs: ["T-1.1"] },
  { wbsId: "T-1.3", slice: "P1", title: "WBS sub-schema and normalizer stub", approach: "normalizeWbsItemToTaskDraft() signature and shape guard stub.", scope: ["WBS item types + stub until WP-6"], ac: ["Shape guard tests pass"], dependsOnWbs: ["T-1.1"] },
  { wbsId: "T-1.4", slice: "P1", title: "Plan artifact storage layer", approach: "Versioned read/write per A-ARCH (filesystem or module-state SQLite).", scope: ["Round-trip persistence", "List summaries, bump version"], ac: ["Round-trip test passes", "Path documented"], dependsOnWbs: ["T-1.1", "T-A.1"] },
  { wbsId: "T-1.5", slice: "P1", title: "PlanArtifact markdown render view", approach: "renderPlanArtifactMarkdown() from structured data; omit empty optional sections.", scope: ["Pure render function", "Snapshot tests"], ac: ["Minimal + full fixture snapshots"], dependsOnWbs: ["T-1.1"] },

  { wbsId: "T-2.1", slice: "P2", title: "Author CAE planning lens artifacts (A-CAE)", approach: "CAE markdown lenses: completeness, architecture, risk, testing, UX, decomposition, anti-patterns, sizing.", scope: ["Register in artifacts.v1.json"], ac: ["A-CAE draft ready for human review"], dependsOnWbs: ["T-A.1"] },
  { wbsId: "T-2.2", slice: "P2", title: "Register CAE planning activations", approach: "activations.v1.json for plan commands; bundles per PLANNER Step 2.", scope: ["cae-registry-validate passes"], ac: ["Planning activations registered"], dependsOnWbs: ["T-2.1"] },
  { wbsId: "T-2.3", slice: "P2", title: "Planning session CAE scope hook", approach: "Surface planning bundles on draft-plan-artifact via existing scope kinds.", scope: ["Integration test for activation fire"], ac: ["Test proves activation on draft command"], dependsOnWbs: ["T-2.2"] },
  { wbsId: "T-2.4", slice: "P2", title: "Plan-artifact machine runbook", approach: ".ai/runbooks/plan-artifact-workflow.md + CLI map snippets.", scope: ["Link from planning README or runbooks HUB"], ac: ["Runbook discoverable by agents"], dependsOnWbs: ["T-2.2", "T-A.3"] },

  { wbsId: "T-3.1", slice: "P3", title: "draft-plan-artifact instruction doc", approach: "Instruction file per A-CONTRACTS with --schema-only.", scope: ["src/modules/planning/instructions/draft-plan-artifact.md"], ac: ["Schema-only works", "Command listed in wk run"], dependsOnWbs: ["T-A.3", "T-1.2"] },
  { wbsId: "T-3.2", slice: "P3", title: "draft-plan-artifact validation", approach: "JSON schema validate, normalize, path-level errors.", scope: ["Validator module", "Tests for valid/minimal and invalid rows"], ac: ["Validation tests pass"], dependsOnWbs: ["T-3.1"] },
  { wbsId: "T-3.3", slice: "P3", title: "draft-plan-artifact persist handler", approach: "Wire onCommand; storage via WP-1; trace metadata.", scope: ["Returns planId, version, planRef"], ac: ["CLI round-trip saves draft"], dependsOnWbs: ["T-3.2", "T-1.4"] },
  { wbsId: "T-3.4", slice: "P3", title: "draft-plan-artifact tests and fixtures", approach: "fixtures/planning + test/plan-artifact-draft.test.mjs.", scope: ["CI green"], ac: ["Fixtures cover minimal feature plan"], dependsOnWbs: ["T-3.3"] },

  { wbsId: "T-4.1", slice: "P3", title: "review-plan-artifact instruction doc", approach: "Instruction per A-CONTRACTS and A-RUBRIC summary.", scope: ["--schema-only registration"], ac: ["Schema-only works"], dependsOnWbs: ["T-A.3", "T-A.4"] },
  { wbsId: "T-4.2", slice: "P3", title: "reviewPlanArtifact engine", approach: "Pure review engine per A-RUBRIC with findings.", scope: ["Unit tests per rubric rule"], ac: ["Review engine tests pass"], dependsOnWbs: ["T-4.1"] },
  { wbsId: "T-4.3", slice: "P3", title: "Plan review WBS sizing checks", approach: "Oversized rows, vague AC, missing verification slices.", scope: ["Sizing rule tests"], ac: ["Bad fixtures caught"], dependsOnWbs: ["T-4.2"] },
  { wbsId: "T-4.4", slice: "P3", title: "Plan review WBS coverage map", approach: "Goals/stories to WBS mapping; Gap 5 architecture/UI/test/rollout slices.", scope: ["Coverage map in response", "Waiver support"], ac: ["Uncovered objectives produce blockers"], dependsOnWbs: ["T-4.2"] },
  { wbsId: "T-4.5", slice: "P3", title: "review-plan-artifact command wiring", approach: "CLI command; response codes per A-CONTRACTS; no mutation.", scope: ["review-plan-artifact handler"], ac: ["CLI returns findings"], dependsOnWbs: ["T-4.3", "T-4.4"] },
  { wbsId: "T-4.6", slice: "P3", title: "review-plan-artifact tests and fixtures", approach: "Pass/fail/coverage-gap fixtures.", scope: ["test coverage"], ac: ["CI green"], dependsOnWbs: ["T-4.5"] },

  { wbsId: "T-5.1", slice: "P4", title: "accept-plan-artifact instruction doc", approach: "approvalRecord shape per A-SCHEMA and A-CONTRACTS.", scope: ["Example JSON in instruction"], ac: ["Schema-only works"], dependsOnWbs: ["T-A.3", "T-4.5"] },
  { wbsId: "T-5.2", slice: "P4", title: "accept-plan-artifact command", approach: "Require confirmed:true; version pin; optional strict review pass.", scope: ["plan-artifact-accepted response"], ac: ["Accept persists approval block"], dependsOnWbs: ["T-5.1", "T-4.5"] },
  { wbsId: "T-5.3", slice: "P4", title: "accept-plan-artifact guardrails and tests", approach: "Block accept on review blockers; version mismatch; idempotent re-accept.", scope: ["Test suite"], ac: ["CI green"], dependsOnWbs: ["T-5.2"] },

  { wbsId: "T-6.1", slice: "P4", title: "finalize-plan-to-phase instruction doc", approach: "Contract for dry-run vs persist and acceptance requirement.", scope: ["Preview + persist examples"], ac: ["Schema-only works"], dependsOnWbs: ["T-A.3", "T-5.2"] },
  { wbsId: "T-6.2", slice: "P4", title: "Phase proposal resolver", approach: "Resolve phase key, collision detection, short description validation.", scope: ["Pure resolver + unit tests"], ac: ["Deterministic resolver tests pass"], dependsOnWbs: ["T-A.1", "T-6.1"] },
  { wbsId: "T-6.3", slice: "P4", title: "WBS to task draft normalizer", approach: "normalizeWbsItemToTaskDraft to persist-planning-execution-drafts shape + provenance.", scope: ["metadata.planRef, wbsPath"], ac: ["Normalizer tests pass"], dependsOnWbs: ["T-1.3", "T-6.1"] },
  { wbsId: "T-6.4", slice: "P4", title: "finalize-plan-to-phase dry-run path", approach: "Verify acceptance, phase, normalize, review-planning-execution-drafts equivalent; no writes.", scope: ["Preview command handler"], ac: ["Preview test passes", "Missing acceptance blocks"], dependsOnWbs: ["T-6.2", "T-6.3", "T-5.2"] },
  { wbsId: "T-6.5", slice: "P4", title: "finalize-plan-to-phase persist path", approach: "Policy + planning generation; delegate to persist-planning-execution-drafts.", scope: ["Transactional persist", "Idempotency test"], ac: ["Persist test passes"], dependsOnWbs: ["T-6.4"] },
  { wbsId: "T-6.6", slice: "P4", title: "finalize-plan-to-phase docs and CLI map", approach: "AGENT-CLI-MAP, snippets, planning README.", scope: ["Agent discoverability"], ac: ["Docs registered"], dependsOnWbs: ["T-6.4"] },

  { wbsId: "T-7.1", slice: "P5", title: "dashboard-summary planArtifact contract", approach: "Extend contract per A-ARCH and A-UX data needs.", scope: ["schemas/task-engine-run-contracts.schema.json", "dashboard-summary.md"], ac: ["Schema validates", "Null when no plan"], dependsOnWbs: ["T-A.5", "T-3.3", "T-4.5"] },
  { wbsId: "T-7.2", slice: "P5", title: "Dashboard plan draft panel", approach: "Read-only plan sections; open questions prominent; webview styleguide.", scope: ["render-dashboard.ts", "Renderer tests"], ac: ["Fixture render test passes"], dependsOnWbs: ["T-7.1"] },
  { wbsId: "T-7.3", slice: "P5", title: "Dashboard review findings and WBS preview", approach: "Findings, sizing findings, WBS table per A-UX.", scope: ["Extension renderer tests"], ac: ["Pass/fail render tests"], dependsOnWbs: ["T-7.1"] },
  { wbsId: "T-7.4", slice: "P5", title: "Dashboard plan accept action", approach: "accept-plan-artifact + policy lane per A-UX.", scope: ["Host action wiring"], ac: ["Accept disabled until review pass"], dependsOnWbs: ["T-7.3", "T-5.2"] },
  { wbsId: "T-7.5", slice: "P5", title: "Dashboard finalize and open phase action", approach: "Task creation preview dry-run + persist; refresh queue.", scope: ["Extension action wiring"], ac: ["Tasks appear in Queue after persist"], dependsOnWbs: ["T-7.4", "T-6.4", "T-6.5"] },
  { wbsId: "T-7.6", slice: "P5", title: "Dashboard plan lifecycle tests", approach: "Extension tests; CAE dashboard fixtures if needed.", scope: ["Extension + kit tests green"], ac: ["Lifecycle states covered"], dependsOnWbs: ["T-7.5"] },

  { wbsId: "T-8.1", slice: "P6", title: "build-plan compatibility shim", approach: "Implement A-COMPAT decisions; keep build-plan tests passing.", scope: ["Bridge or deprecation docs in README"], ac: ["build-plan tests pass"], dependsOnWbs: ["T-A.7", "T-6.5"] },
  { wbsId: "T-8.2", slice: "P6", title: "Planner E2E CLI golden path test", approach: "draft to review to accept to finalize; draft A-E2E checklist.", scope: ["test file happy + blocked path"], ac: ["E2E test passes", "A-E2E checklist drafted"], dependsOnWbs: ["T-6.5", "T-A.6"] },
  { wbsId: "T-8.3", slice: "P6", title: "Plan/task drift report (stretch)", approach: "Optional read-only divergence report stub.", scope: ["Follow-up if not implemented"], ac: ["Documented deferral or stub"], dependsOnWbs: ["T-6.5"] },
  { wbsId: "T-8.4", slice: "P6", title: "Planner release CI gate", approach: "Fixture-based check per A-TEST.", scope: ["CI target documented"], ac: ["CI gate runs plan-artifact fixtures"], dependsOnWbs: ["T-8.2"] },

  { wbsId: "T-9.1", slice: "P6", title: "Planner traceability matrix closeout", approach: "Map PLANNER.md success loop and A-* artifacts to evidence.", scope: ["PR or task notes matrix"], ac: ["Traceability complete"], dependsOnWbs: ["T-8.2"] },
  { wbsId: "T-9.2", slice: "P6", title: "Planner full test sweep closeout", approach: "pnpm run test, extension tests, wk doctor.", scope: ["All green"], ac: ["Test sweep evidence recorded"], dependsOnWbs: ["T-9.1", "T-7.6", "T-8.4"] },
  { wbsId: "T-9.3", slice: "P6", title: "Planner delivery meta (optional)", approach: "Optional ops note; this batch satisfies registration.", scope: ["N/A"], ac: ["Skipped or marked complete"], dependsOnWbs: ["T-9.2"] }
];

const wbsToId = new Map();
ROWS.forEach((row, i) => {
  wbsToId.set(row.wbsId, `T${START_ID + i}`);
});

const tasks = ROWS.map((row) => {
  const id = wbsToId.get(row.wbsId);
  const dependsOn = (row.dependsOnWbs ?? [])
    .map((w) => wbsToId.get(w))
    .filter(Boolean);

  return {
    id,
    title: row.title,
    type: "workspace-kit",
    priority: row.slice === "P0" ? "P1" : row.slice.startsWith("P3") || row.slice.startsWith("P4") ? "P1" : "P2",
    status: row.wbsId === "T-0.1" || row.wbsId === "T-0.2" ? "ready" : "proposed",
    phaseKey: PHASE_KEY,
    phase: PHASE_LABEL,
    approach: row.approach,
    summary: row.approach,
    technicalScope: row.scope,
    acceptanceCriteria: row.ac,
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
    metadata: {
      planner: {
        wbsId: row.wbsId,
        slice: row.slice,
        specPath: PLAN_REF
      },
      planningProvenance: {
        source: "persist-planning-execution-drafts",
        planningType: "new-feature",
        planRef: PLAN_REF
      }
    }
  };
});

const out = {
  phaseKey: PHASE_KEY,
  phaseLabel: PHASE_LABEL,
  shortDescription: "Planner",
  planRef: PLAN_REF,
  planningType: "new-feature",
  targetPhaseKey: PHASE_KEY,
  targetPhase: PHASE_LABEL,
  desiredStatus: "proposed",
  clientMutationId: "planner-phase110-batch-v1",
  taskCount: tasks.length,
  idRange: { first: tasks[0].id, last: tasks[tasks.length - 1].id },
  tasks
};

const outPath = join(process.cwd(), "tasks/planner-phase110-batch.json");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${outPath} (${tasks.length} tasks, ${tasks[0].id}–${tasks[tasks.length - 1].id})`);
