#!/usr/bin/env node
/**
 * Phase 70 CAE triage: update each T837–T869 (accuracy pass) then run-transition accept.
 * Requires: dist/cli.js built; tasks.persistence planningGeneration policy require.
 *
 * Usage: pnpm run build && node scripts/cae-phase70-triage-accept.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliJs = join(root, "dist", "cli.js");

const PHASE_LABEL = "Phase 70 - Context Activation Engine (CAE)";
const PHASE_KEY = "70";

const TRIAGE_DESC = `

## Phase 70 triage (2026-04-08)
- Bucketed under **${PHASE_LABEL}** (\`phaseKey\` **\`${PHASE_KEY}\`**); accuracy review applied to task fields + specs.
- **Ready** means triage accepted the *spec/plan* for implementation—not that CAE is shipped.
- Kit ops: pass **\`expectedPlanningGeneration\`** on **\`update-task\`** / **\`run-transition\`** when policy requires it.
- **\`run-transition\` \`accept\`** is Tier A: JSON **\`policyApproval\`** on the argv object (see \`.ai/POLICY-APPROVAL.md\`, \`.ai/AGENT-CLI-MAP.md\`).
`;

/** @param {string} text */
function parseCliJson(text) {
  const t = text.trim();
  const start = t.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(t.slice(start));
  } catch {
    return null;
  }
}

function run(cmd, argObj) {
  const r = spawnSync(process.execPath, [cliJs, "run", cmd, JSON.stringify(argObj)], {
    cwd: root,
    encoding: "utf8"
  });
  const j = parseCliJson(r.stdout) ?? parseCliJson(r.stdout + r.stderr);
  if (!j) {
    throw new Error(`${cmd} non-JSON stdout: ${(r.stdout + r.stderr).slice(0, 400)}`);
  }
  return j;
}

/** @type {Record<string, string[]>} */
const REVIEW_NOTES = {
  T837: [
    "ADR: default `.ai/adrs/` for machine canon; cross-link maintainer ADR only if required.",
    "Document CAE vs `ModuleActivationReport` naming collision in ADR table."
  ],
  T838: [
    "Edit `.ai/TERMS.md` first; sync `docs/maintainers/TERMS.md` only if maintainer twin policy requires same PR."
  ],
  T839: [
    "Spell out validator behavior for `cognitive-map` type (reject vs inert) — must match T856.",
    "Registry on disk: prefer PR-reviewable paths under repo root or `.ai/`, not opaque `.workspace-kit/` content."
  ],
  T840: [
    "Create `schemas/cae/` if missing; align `$id` / draft with existing kit schemas.",
    "Wire schema validation into CI when fixtures land (T858+)."
  ],
  T841: [
    "Lifecycle pre-filter order must match T843 evaluator narrative (no double interpretation)."
  ],
  T842: [
    "Avoid ad hoc SQLite reads in builder unless T837 ADR permits; prefer task-engine surfaces.",
    "Reserve nullable `mapSignals` (or chosen name) without implementing maps."
  ],
  T843: [
    "Document determinism proof obligation: same inputs → same bundle (+ trace event sequence).",
    "Policy-vs-policy conflict: choose explicit fail vs shadow — no silent pick."
  ],
  T844: [
    "Do not merge acknowledgement into `policyApproval` JSON; parallel requirements only.",
    "If `satisfy_required` is human-only, state machine-checkable subset for v1 (if any)."
  ],
  T845: [
    "Reconcile trace size / retention with T846 before final DDL; ephemeral v1 is valid with interface stub.",
    "Reuse planning SQLite migration style (`user_version`) if storing in same DB."
  ],
  T846: [
    "Define truncation and redaction before T862 ships; stable `eventType` enum.",
    "Explain API: document stability promise (stable vs best-effort fields)."
  ],
  T847: [
    "Record final `workspace-kit run` command names for `AGENT-CLI-MAP.md` + exclusions file if needed.",
    "Agents should rely on JSON output—document human table mode separately if any."
  ],
  T848: [
    "Shadow must never block commands or weaken code invariants; labels only until T866.",
    "Clarify default (shadow on vs opt-in) in ADR — avoid surprising operators."
  ],
  T849: [
    "Decide where `traceId` surfaces when stdout is JSON-only (nested field vs stderr) without breaking parsers.",
    "Single orchestrator module owns merge — grep guard prevents per-module CAE calls."
  ],
  T850: [
    "Prefer additive JSON (`cae` sibling) + `schemaVersion` bump if shape changes materially.",
    "Size cap: summary + trace ref, not full bundle, by default."
  ],
  T851: [
    "Enforcement = allowlist only; everything else advisory unless ADR expands later.",
    "Reference `.ai/POLICY-APPROVAL.md` for what CAE cannot replace."
  ],
  T852: [
    "Git-PR-only workflow + validate CLI is a valid v1 outcome — say so explicitly if chosen.",
    "Any write command needs policy tier + approval per policy registry."
  ],
  T853: [
    "Failure `code` strings should map to `cli-remediation` entries where practical.",
    "Never fail-open into bypassing code-level gates on CAE errors."
  ],
  T854: [
    "Golden tests: normalize paths for cross-OS stability; document snapshot policy.",
    "Block enforcement merge (T866) until determinism suite exists."
  ],
  T855: [
    "Follow `.cursor/rules/agent-doc-routing.mdc` — machine ops stay under `.ai/`."
  ],
  T856: [
    "Contract only — no code path may require map files in v1.",
    "Align reserved type behavior with T839 validator decision."
  ],
  T857: [
    "Seed path must be reviewable in PRs; sort keys for deterministic diffs.",
    "First tranche can omit docs/ if ADR defers — list omissions in inventory notes."
  ],
  T858: [
    "Emit stable error codes (table in `.ai/cae/error-codes.md` or ADR appendix).",
    "No evaluation side effects in loader (read/validate only)."
  ],
  T859: [
    "Implement degradation per T853 before shipping defaults; no silent invented fields."
  ],
  T860: [
    "Evaluator must be pure w.r.t. env (inject config in tests); deterministic ordering.",
    "Cover merge/shadow/fail paths from T843 examples in tests."
  ],
  T861: [
    "Read-only: no `policyApproval` unless policy registry classifies otherwise (unexpected).",
    "Register commands for agent-cli-map coverage check."
  ],
  T862: [
    "Until T867, traces may be ephemeral — flag in response (`data.trace.ephemeral`) if helpful.",
    "Round-trip evaluate → explain must be tested."
  ],
  T863: [
    "Shadow is labeling on shared evaluator path; do not add router blocks here."
  ],
  T864: [
    "Feature-flag hook; default off or shadow-only until operators enable.",
    "Measure or estimate perf impact; cache per T849 if needed."
  ],
  T865: [
    "Avoid breaking JSON consumers of agent-instruction-surface; version bumps if necessary.",
    "Doctor changes must stay non-fatal on CAE error."
  ],
  T866: [
    "Ship only with allowlist from T851 + separate config flag from shadow.",
    "Do not expand enforcement without ADR + policy review (PRINCIPLES R009)."
  ],
  T867: [
    "If persistence deferred, ship repository interface + no-op adapter with tests.",
    "Migration number must not collide with planning `user_version` semantics."
  ],
  T868: [
    "Validate-only CLI + PR workflow is acceptable closeout; document in governance doc.",
    "No agent self-service mutation in v1 regardless."
  ],
  T869: [
    "Must include regression test: CAE failure does not bypass code safety paths.",
    "Keep `pnpm run check` green including CLI map coverage."
  ]
};

const IDS = [];
for (let n = 837; n <= 869; n++) IDS.push(`T${n}`);

let pg = run("get-next-actions", {}).data.planningGeneration;
if (typeof pg !== "number") throw new Error("No planningGeneration");

const policyApproval = {
  confirmed: true,
  rationale:
    "Phase 70 CAE triage: spec accuracy reviewed; tasks promoted proposed→ready for execution queue. Chat is not approval — this JSON is the audit record."
};

for (const id of IDS) {
  const got = run("get-task", { taskId: id });
  if (!got.ok || !got.data?.task) {
    throw new Error(`get-task ${id}: ${got.message}`);
  }
  const task = got.data.task;
  if (task.status !== "proposed") {
    console.log(`${id}: skip (status=${task.status})`);
    if (typeof got.data?.planningGeneration === "number") pg = got.data.planningGeneration;
    continue;
  }

  const notes = REVIEW_NOTES[id] ?? [];
  const metadata = {
    ...(task.metadata && typeof task.metadata === "object" ? task.metadata : {}),
    phaseProgram: "phase-70-cae",
    phaseKey: PHASE_KEY,
    triageAcceptedAt: "2026-04-08T00:00:00.000Z",
    reviewNotes: notes
  };

  const descBase = task.description ?? "";
  const desc =
    descBase.includes("Phase 70 triage (2026-04-08)") ? descBase : descBase + TRIAGE_DESC;

  const acceptanceCriteria = [...(task.acceptanceCriteria ?? [])];
  if (!acceptanceCriteria.some((x) => x.includes("Phase 70"))) {
    acceptanceCriteria.push("Phase 70: task record and tasks/cae/specs/* triage notes applied; ready means plan accepted, not feature shipped.");
  }

  const technicalScope = [...(task.technicalScope ?? [])];
  if (!technicalScope.some((x) => x.includes("roadmap-phase-sections"))) {
    technicalScope.push("Roadmap phase block: src/modules/documentation/data/roadmap-phase-sections.md (Phase 70 - CAE).");
  }

  const upd = run("update-task", {
    taskId: id,
    expectedPlanningGeneration: pg,
    clientMutationId: `cae70-upd-${id}-20260408`,
    updates: {
      phase: PHASE_LABEL,
      phaseKey: PHASE_KEY,
      description: desc,
      metadata,
      acceptanceCriteria,
      technicalScope,
      risk: task.risk && String(task.risk).trim() ? task.risk : "medium"
    }
  });
  if (!upd.ok) {
    console.error(upd);
    throw new Error(`update-task ${id} failed: ${upd.code} ${upd.message}`);
  }
  pg = upd.data.planningGeneration;

  const tr = run("run-transition", {
    taskId: id,
    action: "accept",
    expectedPlanningGeneration: pg,
    policyApproval,
    clientMutationId: `cae70-acc-${id}-20260408`
  });
  if (!tr.ok) {
    console.error(tr);
    throw new Error(`run-transition ${id} failed: ${tr.code} ${tr.message}`);
  }
  pg = tr.data.planningGeneration;
  console.log(`${id}: ${tr.code} → ${tr.data?.evidence?.toState}`);
}

console.log("Done. planningGeneration=", pg);
