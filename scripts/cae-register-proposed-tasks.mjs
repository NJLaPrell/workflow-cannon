#!/usr/bin/env node
/**
 * Registers CAE program tasks T837–T869 as status "proposed" in the task engine.
 * Idempotent per task via clientMutationId (replay if payload unchanged).
 *
 * Usage (repo root): node scripts/cae-register-proposed-tasks.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliJs = join(root, "dist", "cli.js");

/** @typedef {{ id: string, title: string, dependsOn: string[], features: string[], summary: string, description: string, approach: string, technicalScope: string[], acceptanceCriteria: string[], metadata: Record<string, unknown> }} CaeTask */

/** @type {CaeTask[]} */
const CAE_TASKS = [
  {
    id: "T837",
    title: "CAE architecture & boundaries ADR",
    dependsOn: [],
    features: ["module-platform", "policy-registry", "playbooks"],
    summary: "ADR: code vs CAE vs docs; safety ordering; naming vs ModuleActivationReport.",
    description:
      "Author merged ADR only. Full spec: tasks/cae/specs/T837.md. Program: tasks/cae/CAE-PROGRAM-CONTEXT.md.",
    approach:
      "Read integration anchors in spec; produce boundary tables; no evaluator or CLI code.",
    technicalScope: ["ADR file", "Reviewer sign-off", "Explicit v1 non-goals"],
    acceptanceCriteria: [
      "ADR merged with CAE may/must-not table",
      "Pointers to PRINCIPLES and POLICY-APPROVAL for ack vs approval"
    ],
    metadata: { cae: true, specPath: "tasks/cae/specs/T837.md", caePhase: "design" }
  },
  {
    id: "T838",
    title: "CAE glossary & TERMS alignment",
    dependsOn: ["T837"],
    features: ["playbooks", "instructions"],
    summary: "Add TERMS rows for CAE vocabulary; disambiguate module activation vs CAE.",
    description: "Spec: tasks/cae/specs/T838.md. Edit .ai/TERMS.md only unless twin sync required.",
    approach: "Derive term list from ADR; avoid duplicate primary definitions.",
    technicalScope: [".ai/TERMS.md patches", "Cross-ref to T837 ADR path"],
    acceptanceCriteria: ["No contradictory defs vs ADR", "Activation disambiguation present"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T838.md", caePhase: "design" }
  },
  {
    id: "T839",
    title: "CAE artifact registry model & ID conventions ADR",
    dependsOn: ["T837"],
    features: ["module-platform", "instructions"],
    summary: "Stable artifact IDs, types, layout; cognitive-map reserved; validation rules.",
    description: "Spec: tasks/cae/specs/T839.md. Evolve stub-registry-entry.schema.json to normative.",
    approach: "ADR + schema path under schemas/cae/ + valid/invalid fixtures list.",
    technicalScope: ["ADR", "Registry schema v1", "Examples"],
    acceptanceCriteria: ["cognitive-map behavior explicit", "Implementer can validate IDs without code"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T839.md", caePhase: "design" }
  },
  {
    id: "T840",
    title: "CAE activation definition schema v1",
    dependsOn: ["T839"],
    features: ["module-platform", "ci-guards"],
    summary: "Normative activation JSON Schema; no code/NL conditions/macros.",
    description: "Spec: tasks/cae/specs/T840.md. Check in schemas/cae/activation-definition.",
    approach: "Schema-first + fixtures + trace event mapping table to T846.",
    technicalScope: ["JSON Schema", "fixtures/cae/activations", "CI validation hook later"],
    acceptanceCriteria: ["Schema forbids executable fields", "Per-family minimal examples"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T840.md", caePhase: "design" }
  },
  {
    id: "T841",
    title: "CAE activation lifecycle & versioning semantics",
    dependsOn: ["T840"],
    features: ["module-platform", "task-schema"],
    summary: "States, transitions, evaluation gating for retired/disabled/draft.",
    description: "Spec: tasks/cae/specs/T841.md. Align pre-filter order with T843.",
    approach: "State table + evaluator pre-filter spec section.",
    technicalScope: ["Lifecycle doc", "Transition table"],
    acceptanceCriteria: ["Retired/disabled unambiguous", "T860 can filter without guesswork"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T841.md", caePhase: "design" }
  },
  {
    id: "T842",
    title: "CAE evaluation context contract v1",
    dependsOn: ["T837"],
    features: ["task-schema", "next-actions", "module-platform"],
    summary: "Typed bounded context slices; no opaque blob; future map fields null.",
    description: "Spec: tasks/cae/specs/T842.md. TS or JSON Schema as normative.",
    approach: "Source-of-truth table per field + redaction + canonical serialization.",
    technicalScope: ["Contract doc", "schemas/cae/evaluation-context or TS types"],
    acceptanceCriteria: ["All fields sourced", "mapSignals reserved documented"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T842.md", caePhase: "design" }
  },
  {
    id: "T843",
    title: "CAE precedence, merge & effective bundle semantics",
    dependsOn: ["T840", "T842"],
    features: ["policy-registry", "module-platform"],
    summary: "Deterministic merge; policy vs advisory; specificity; conflict outcomes.",
    description: "Spec: tasks/cae/specs/T843.md. Finalize stub-effective-activation-bundle schema.",
    approach: "Normative doc + 5+ worked examples + bundle JSON Schema v1.",
    technicalScope: [".ai/cae/precedence-merge.md", "schemas/cae/effective-activation-bundle.v1.json"],
    acceptanceCriteria: ["Examples cover shadow/fail/merge", "Trace step mapping to T846"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T843.md", caePhase: "design" }
  },
  {
    id: "T844",
    title: "CAE acknowledgement model specification",
    dependsOn: ["T837", "T843"],
    features: ["approvals", "policy-registry"],
    summary: "Ack strengths vs policyApproval; bundle pending acks; blocking rules TBD.",
    description: "Spec: tasks/cae/specs/T844.md. Keep approval JSON path unchanged.",
    approach: "Spec + bundle fragment schema + comparison table ack vs approval vs code.",
    technicalScope: [".ai/cae/acknowledgement-model.md"],
    acceptanceCriteria: ["Each strength has example", "No replacement of policyApproval"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T844.md", caePhase: "design" }
  },
  {
    id: "T845",
    title: "CAE persistence & migration design ADR",
    dependsOn: ["T837"],
    features: ["task-persistence", "store-migrations"],
    summary: "What to persist, where, retention; align with planning SQLite user_version.",
    description: "Spec: tasks/cae/specs/T845.md. May allow ephemeral v1 with explicit interface.",
    approach: "ADR + DDL sketch or file-only decision + threat notes.",
    technicalScope: ["ADR", "Retention policy", "Optional tables list"],
    acceptanceCriteria: ["T867 unambiguous or explicit deferral", "Doctor health expectations"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T845.md", caePhase: "design" }
  },
  {
    id: "T846",
    title: "CAE trace & explanation surface specification",
    dependsOn: ["T842", "T843"],
    features: ["policy-traces", "instructions"],
    summary: "traceId, event taxonomy, explain payload, redaction, truncation.",
    description: "Spec: tasks/cae/specs/T846.md. Evolve stub-trace-event schema.",
    approach: "Normative trace schema + explain-response schema + event table.",
    technicalScope: ["schemas/cae/trace.v1.json", "schemas/cae/explain-response.v1.json"],
    acceptanceCriteria: ["T843 steps map to events", "Redaction rules for paths"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T846.md", caePhase: "design" }
  },
  {
    id: "T847",
    title: "CAE read-only CLI command contract",
    dependsOn: ["T843", "T846"],
    features: ["instructions", "module-platform", "ci-guards"],
    summary: "Normative wk run command names, args, JSON envelopes; AGENT-CLI-MAP checklist.",
    description: "Spec: tasks/cae/specs/T847.md. Replace stub-read-only-cli-contract.md.",
    approach: "Contract doc + per-command data schemas + coverage checklist.",
    technicalScope: ["tasks/cae/artifacts/cae-read-only-cli-contract.v1.md or .ai/cae/cli-read-only.md"],
    acceptanceCriteria: ["Copy-paste JSON for each command", "Tier C no policyApproval"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T847.md", caePhase: "design" }
  },
  {
    id: "T848",
    title: "CAE shadow mode semantics & observability",
    dependsOn: ["T844", "T847"],
    features: ["policy-traces", "policy-registry"],
    summary: "Shadow vs live labels; would activate/require/enforce; usefulness signal hooks.",
    description: "Spec: tasks/cae/specs/T848.md. Extend bundle/envelope schema.",
    approach: "Design doc + JSON examples + mode matrix.",
    technicalScope: [".ai/cae/shadow-mode.md"],
    acceptanceCriteria: ["Shadow cannot weaken code safety", "T863 can implement labels only"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T848.md", caePhase: "design" }
  },
  {
    id: "T849",
    title: "CAE runtime integration point (CLI/router design)",
    dependsOn: ["T842", "T848"],
    features: ["module-platform", "task-lifecycle"],
    summary: "Where to run CAE; task+cmd merge; cache; ordering vs policy checks.",
    description: "Spec: tasks/cae/specs/T849.md. Single orchestrator; no per-module scatter.",
    approach: "Sequence diagram + file pointers + degradation matrix link T853.",
    technicalScope: ["Design doc", "Cache key spec"],
    acceptanceCriteria: ["Clear hook commands list", "Performance guardrails"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T849.md", caePhase: "design" }
  },
  {
    id: "T850",
    title: "CAE advisory activation surfacing design",
    dependsOn: ["T847", "T849"],
    features: ["instructions", "doctor-diagnostics"],
    summary: "Doctor and/or agent-instruction-surface payload; size limits; naming.",
    description: "Spec: tasks/cae/specs/T850.md. Compare activationReport vs CAE fields.",
    approach: "Before/after JSON + backward compatibility strategy.",
    technicalScope: ["Design doc", "AGENT-CLI-MAP row delta plan"],
    acceptanceCriteria: ["Advisory vs enforcement explicit", "Size budget"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T850.md", caePhase: "design" }
  },
  {
    id: "T851",
    title: "CAE narrow policy enforcement lane design",
    dependsOn: ["T837", "T843", "T844"],
    features: ["policy-registry", "task-guards"],
    summary: "Allowlist of CAE block/require outcomes; exit codes; post-shadow gate.",
    description: "Spec: tasks/cae/specs/T851.md. Subordinate to code invariants.",
    approach: "Allowlist table + forbiddens + remediation catalog plan.",
    technicalScope: [".ai/cae/enforcement-lane.md"],
    acceptanceCriteria: ["Fail-closed only for enumerated cases", "T866 maps to this doc"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T851.md", caePhase: "design" }
  },
  {
    id: "T852",
    title: "CAE activation CRUD mutation governance",
    dependsOn: ["T841", "T845"],
    features: ["approvals", "policy-registry"],
    summary: "Who mutates registry/activations; audit; git-only vs CLI; no agent self-service v1.",
    description: "Spec: tasks/cae/specs/T852.md. Threat model short section.",
    approach: "Governance doc + PR workflow or future kit command requirements.",
    technicalScope: [".ai/cae/mutation-governance.md"],
    acceptanceCriteria: ["T868 scope clear", "Align PRINCIPLES R009"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T852.md", caePhase: "design" }
  },
  {
    id: "T853",
    title: "CAE failure, degradation & recovery model",
    dependsOn: ["T845", "T849"],
    features: ["doctor-diagnostics", "module-platform"],
    summary: "Error taxonomy; advisory fail-open vs enforcement; doctor lines; recovery.",
    description: "Spec: tasks/cae/specs/T853.md. Never bypass code safety on CAE error.",
    approach: "Failure matrix + stable code strings + remediation hooks plan.",
    technicalScope: [".ai/cae/failure-recovery.md"],
    acceptanceCriteria: ["Matrix covers registry/context/eval/storage", "Stable error codes listed"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T853.md", caePhase: "design" }
  },
  {
    id: "T854",
    title: "CAE test strategy & coverage plan",
    dependsOn: ["T840", "T842", "T843", "T846"],
    features: ["ci-guards", "consumer-parity"],
    summary: "Golden vectors, CLI integration, determinism, enforcement gate tests.",
    description: "Spec: tasks/cae/specs/T854.md. Directory layout and risk map.",
    approach: ".ai/cae/test-plan.md + golden catalog + CI gate list.",
    technicalScope: ["Test plan doc", "Fixture layout"],
    acceptanceCriteria: ["T860/T861/T862/T869 can execute plan", "Determinism before T866"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T854.md", caePhase: "design" }
  },
  {
    id: "T855",
    title: "CAE operator documentation workflow (.ai-first)",
    dependsOn: ["T847", "T848"],
    features: ["playbooks", "instructions"],
    summary: ".ai entrypoints for operators; debug flowchart; routing-compliant.",
    description: "Spec: tasks/cae/specs/T855.md. Use operator-doc-outline stub.",
    approach: "Stub to real .ai/cae/*.md; minimal AGENTS cross-link.",
    technicalScope: [".ai/cae/README.md or runbook", "tasks/cae/artifacts/operator-doc-outline.md"],
    acceptanceCriteria: ["Agents find CAE without docs/maintainers routine read", "Debug path documented"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T855.md", caePhase: "design" }
  },
  {
    id: "T856",
    title: "Future cognitive-map integration contract",
    dependsOn: ["T839", "T840", "T842"],
    features: ["playbooks", "module-platform"],
    summary: "Reserved type and context fields; no v1 dependency; validator rules.",
    description: "Spec: tasks/cae/specs/T856.md. Docs only.",
    approach: "Short ADR appendix + nullable examples + schemaVersion bump plan.",
    technicalScope: [".ai/cae/future-cognitive-maps.md"],
    acceptanceCriteria: ["v1 implementable without maps", "cognitive-map aligns T839"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T856.md", caePhase: "design" }
  },
  {
    id: "T857",
    title: "CAE bootstrap artifact inventory & registry seed",
    dependsOn: ["T839"],
    features: ["playbooks", "instructions"],
    summary: "Curated registry JSON for real .ai playbooks and key docs; validate paths.",
    description: "Spec: tasks/cae/specs/T857.md. First tranche not exhaustive.",
    approach: "registry/cae/artifacts.v1.json + inventory-notes.md + PR checklist.",
    technicalScope: ["Seed registry file", "Inventory notes"],
    acceptanceCriteria: ["All paths exist", "Valid vs normative registry schema"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T857.md", caePhase: "data" }
  },
  {
    id: "T858",
    title: "Implement CAE registry loader & validation",
    dependsOn: ["T839", "T840", "T857"],
    features: ["module-platform", "ci-guards"],
    summary: "Load registry + activations; validate; stable error codes; no evaluate.",
    description: "Spec: tasks/cae/specs/T858.md. Unit tests for fixtures.",
    approach: "Core package + error code table .ai/cae/error-codes.md.",
    technicalScope: ["src module or core/cae", "test/cae/fixtures"],
    acceptanceCriteria: ["Invalid registry fails with stable code", "T857 seed loads"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T858.md", caePhase: "implement" }
  },
  {
    id: "T859",
    title: "Implement CAE context builder",
    dependsOn: ["T842"],
    features: ["task-schema", "next-actions", "module-platform"],
    summary: "Build EvaluationContext from task/command/workspace/governance per contract.",
    description: "Spec: tasks/cae/specs/T859.md. Golden context JSON tests.",
    approach: "Adapter per field + T853 degradation behavior.",
    technicalScope: ["Context builder API", "Unit tests"],
    acceptanceCriteria: ["No extra fields vs contract", "Missing task behavior defined"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T859.md", caePhase: "implement" }
  },
  {
    id: "T860",
    title: "Implement CAE evaluation engine (bundle + conflicts)",
    dependsOn: ["T841", "T843", "T844", "T858", "T859"],
    features: ["policy-registry", "module-platform", "ci-guards"],
    summary: "Pure evaluate -> bundle + trace; merge/shadow/fail per T843.",
    description: "Spec: tasks/cae/specs/T860.md. Golden tests from T854.",
    approach: "Single evaluator entry; inject mode for shadow labels later.",
    technicalScope: ["Evaluator core", "test/cae/golden"],
    acceptanceCriteria: ["T843 examples automated", "Deterministic hash or JSON compare"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T860.md", caePhase: "implement" }
  },
  {
    id: "T861",
    title: "Read-only CAE CLI: list/get artifacts & activations",
    dependsOn: ["T847", "T857", "T858"],
    features: ["instructions", "module-platform", "ci-guards"],
    summary: "First wk run commands for registry inspection; AGENT-CLI-MAP coverage.",
    description: "Spec: tasks/cae/specs/T861.md. No policyApproval.",
    approach: "Module + instructions/*.md + router registration + tests.",
    technicalScope: ["CLI handlers", "Instruction files"],
    acceptanceCriteria: ["pnpm run check green", "JSON response contract"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T861.md", caePhase: "implement" }
  },
  {
    id: "T862",
    title: "Read-only CAE CLI: evaluate, explain, health, conflicts, trace",
    dependsOn: ["T846", "T847", "T859", "T860"],
    features: ["instructions", "policy-traces", "doctor-diagnostics"],
    summary: "Wire evaluator to run commands; explain; health; ephemeral trace ok pre-T867.",
    description: "Spec: tasks/cae/specs/T862.md.",
    approach: "Handlers + round-trip test evaluate to explain.",
    technicalScope: ["CLI handlers", "Tests"],
    acceptanceCriteria: ["schemaVersion in data", "Truncation per T846"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T862.md", caePhase: "implement" }
  },
  {
    id: "T863",
    title: "CAE shadow mode in evaluate/explain pipeline",
    dependsOn: ["T848", "T860", "T862"],
    features: ["policy-traces", "policy-registry"],
    summary: "Mode flag for shadow labels on same evaluator path; update contract doc.",
    description: "Spec: tasks/cae/specs/T863.md.",
    approach: "Extend response envelope; tests shadow vs live classification.",
    technicalScope: ["Evaluator/CLI changes"],
    acceptanceCriteria: ["No mutation of store/registry", "T847 canonical updated"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T863.md", caePhase: "implement" }
  },
  {
    id: "T864",
    title: "Integrate shadow CAE into pre-command runtime",
    dependsOn: ["T849", "T863", "T859"],
    features: ["module-platform", "task-lifecycle"],
    summary: "Router/CLI hook; task+cmd merge; cache; non-blocking shadow only.",
    description: "Spec: tasks/cae/specs/T864.md.",
    approach: "Single orchestrator call site; feature flag; E2E test.",
    technicalScope: ["module-command-router.ts / cli.ts", "Tests"],
    acceptanceCriteria: ["No per-module CAE scatter", "CAE failure degrades per T853"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T864.md", caePhase: "implement" }
  },
  {
    id: "T865",
    title: "Advisory CAE payload surfacing (doctor / instruction surface)",
    dependsOn: ["T850", "T864"],
    features: ["doctor-diagnostics", "instructions"],
    summary: "Expose bounded CAE summary to agent surfaces; backward compatible.",
    description: "Spec: tasks/cae/specs/T865.md.",
    approach: "Extend agent-instruction-surface + optional doctor; snapshot tests.",
    technicalScope: ["agent-instruction-surface.ts", "cli.ts doctor", "tests"],
    acceptanceCriteria: ["Size bound enforced", "CAE off leaves prior behavior"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T865.md", caePhase: "implement" }
  },
  {
    id: "T866",
    title: "Narrow CAE policy enforcement lane",
    dependsOn: ["T851", "T860", "T862"],
    features: ["policy-registry", "task-guards", "approvals"],
    summary: "Allowlisted blocks only; separate flag from shadow; post-bake gate.",
    description: "Spec: tasks/cae/specs/T866.md. Coordinate stdout/JSON consumers.",
    approach: "Constant allowlist module + router hook + remediation codes.",
    technicalScope: ["Router enforcement", "Tests per allowlist row"],
    acceptanceCriteria: ["Drift from T851 fails CI or test", "Code gates unchanged"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T866.md", caePhase: "implement" }
  },
  {
    id: "T867",
    title: "CAE persistence: traces, retention, migrations",
    dependsOn: ["T845", "T846", "T862"],
    features: ["task-persistence", "store-migrations"],
    summary: "Implement T845 storage or no-op interface; wire trace command to DB.",
    description: "Spec: tasks/cae/specs/T867.md.",
    approach: "Migrations + repo + doctor health + integration tests.",
    technicalScope: ["SQLite DDL", "cae repository"],
    acceptanceCriteria: ["Trace round-trip if persisting", "Or explicit no-op with interface"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T867.md", caePhase: "implement" }
  },
  {
    id: "T868",
    title: "Governed CAE activation & registry mutations",
    dependsOn: ["T852", "T867"],
    features: ["approvals", "task-mutations", "policy-registry"],
    summary: "Governed writes or validate-only + PR workflow per T852 decision.",
    description: "Spec: tasks/cae/specs/T868.md.",
    approach: "Implement commands with policyApproval OR document deferral + validate CLI.",
    technicalScope: ["Kit commands or doc-only closeout"],
    acceptanceCriteria: ["No silent agent mutation", "Maintainer workflow single page"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T868.md", caePhase: "implement" }
  },
  {
    id: "T869",
    title: "CAE integration test hardening",
    dependsOn: ["T854", "T861", "T862", "T864"],
    features: ["ci-guards", "consumer-parity"],
    summary: "Execute T854 plan: E2E, router hook, failure safety, map coverage.",
    description: "Spec: tasks/cae/specs/T869.md.",
    approach: "Close checklist from T854; add regression tests for schema bumps.",
    technicalScope: ["test suite expansion", "optional CI job"],
    acceptanceCriteria: ["CAE failure never bypasses code safety test", "check green"],
    metadata: { cae: true, specPath: "tasks/cae/specs/T869.md", caePhase: "hardening" }
  }
];

function runCliJson(cmd, argsJson) {
  const args = [cliJs, "run", cmd, argsJson];
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function readPlanningGeneration() {
  const { stdout } = runCliJson("get-next-actions", "{}");
  const j = parseCliJson(stdout);
  if (!j?.ok || typeof j.data?.planningGeneration !== "number") {
    throw new Error("Could not read planningGeneration from get-next-actions");
  }
  return j.data.planningGeneration;
}

function runCreateTask(payload) {
  const args = [cliJs, "run", "create-task", JSON.stringify(payload)];
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** @param {string} text */
function parseCliJson(text) {
  const combined = text.trim();
  const lines = combined.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(line);
      } catch {
        /* continue */
      }
    }
  }
  try {
    return JSON.parse(combined);
  } catch {
    return null;
  }
}

let failed = 0;
let planningGeneration = readPlanningGeneration();
for (const t of CAE_TASKS) {
  const payload = {
    id: t.id,
    title: t.title,
    status: "proposed",
    dependsOn: t.dependsOn,
    features: t.features,
    summary: t.summary,
    description: t.description,
    approach: t.approach,
    technicalScope: t.technicalScope,
    acceptanceCriteria: t.acceptanceCriteria,
    metadata: {
      ...t.metadata,
      programContextPath: "tasks/cae/CAE-PROGRAM-CONTEXT.md",
      artifactStubs: [
        "tasks/cae/artifacts/stub-effective-activation-bundle.schema.json",
        "tasks/cae/artifacts/stub-trace-event.schema.json",
        "tasks/cae/artifacts/stub-registry-entry.schema.json",
        "tasks/cae/artifacts/stub-read-only-cli-contract.md"
      ]
    },
    expectedPlanningGeneration: planningGeneration,
    clientMutationId: `cae-proposed-register-${t.id}-2026-04-08`
  };
  let { status, stdout, stderr } = runCreateTask(payload);
  let out = stdout + stderr;
  let j = parseCliJson(stdout) ?? parseCliJson(out);
  if (j?.code === "planning-generation-mismatch") {
    planningGeneration = readPlanningGeneration();
    payload.expectedPlanningGeneration = planningGeneration;
    ({ status, stdout, stderr } = runCreateTask(payload));
    out = stdout + stderr;
    j = parseCliJson(stdout) ?? parseCliJson(out);
  }
  if (!j) {
    console.error(`${t.id}: non-JSON output`, out.slice(0, 800));
    failed++;
  } else if (j.ok === false && j.code !== "task-create-idempotent-replay") {
    console.error(`${t.id} failed:`, j.code, j.message, j.details ?? "");
    failed++;
  } else {
    console.log(`${t.id}:`, j.code ?? (status === 0 ? "ok" : "unknown"));
    if (typeof j.data?.planningGeneration === "number") {
      planningGeneration = j.data.planningGeneration;
    }
  }
}

process.exitCode = failed > 0 ? 1 : 0;
