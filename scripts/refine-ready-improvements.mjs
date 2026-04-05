#!/usr/bin/env node
/**
 * Rewrites `ready` improvement tasks from trace-shaped stubs into bug-report / improvement-request form.
 * Run from repo root: node scripts/refine-ready-improvements.mjs
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = new URL("..", import.meta.url).pathname;

function wk(sub, args) {
  const out = execFileSync("pnpm", ["exec", "wk", "run", sub, JSON.stringify(args)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(out);
}

function mergeMeta(existing, patch) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  return { ...base, ...patch };
}

/** @param {string} s @param {number} n */
function trunc(s, n) {
  const t = String(s ?? "").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/** Hand-tuned upgrades keyed by ready-task id */
const SPECIAL = {
  "imp-0279f1d002276f": {
    title: "Relational SQLite task rows: Phase 41 program (verify closure vs transcript ask)",
    approach: [
      "Transcript **agent-transcripts/c3fc971e-81a8-4466-882f-13e3ff80a466/** records a maintainer ask to replace the **task_store_json** blob with a column-first **tasks** table (TaskEntity scalars + JSON for arrays).",
      "Phase **41** execution work (**T540–T545**: ADR, DDL, row persistence, migration, doctor, CI parity) is **already completed** in this store.",
      "**Definitive work for this improvement row:** verify no remaining gap between that delivery and the session intent; if satisfied, **complete** this improvement citing **T540–T545** + merged code paths; if a delta remains, open a **narrow T###** and link it here, then **cancel** this improvement with rationale."
    ].join("\n\n"),
    technicalScope: [
      "Compare transcript requirements to shipped relational persistence + `migrate-task-persistence` / `doctor` surfaces.",
      "Confirm maintainer docs (ADR, task-persistence-operator, AGENT-CLI-MAP) state the new model without contradicting the session.",
      "Close this improvement with explicit references—no further raw-transcript archaeology."
    ],
    acceptanceCriteria: [
      "Closure note cites **T540–T545** or lists a new **T###** for any uncovered delta.",
      "Title and body no longer read as generic “reduce transcript friction.”",
      "Task reaches **completed** or **cancelled** with maintainer-visible rationale."
    ],
    metaPatch: {
      issue:
        "Maintainer requested hardened SQLite: real columns per task field instead of a monolithic JSON blob; must be reconciled with shipped Phase 41 relational work.",
      supportingReasoning:
        "Evidence: transcript **c3fc971e** + completed Phase 41 tasks **T540–T545**. Original ingest title was a heuristic friction hit on assistant prose, not a distinct new feature request."
    }
  },
  "imp-883b6d911d1783": {
    title: "Improvement request: normalize ready improvements (phase + scoped body) before execution",
    approach: [
      "Transcript **agent-transcripts/e74c4ba0-83e7-41d8-9e5d-3620929354a6/**: operator asked to convert a vague **ready** improvement into a concrete item; **update-task** added **phaseKey**, **approach**, **technicalScope**, and **acceptanceCriteria** (pattern around **imp-26728163c01804**).",
      "**Work:** encode that pattern in maintainer guidance (**improvement-triage-top-three** / **improvement-task-discovery** or a short runbook): every **ready** improvement should have phase bucketing + non-generic scope before **start**.",
      "Optional: extension or **get-next-actions** copy nudging unphased **ready** improvements."
    ].join("\n\n"),
    technicalScope: [
      "Patch **docs/maintainers/playbooks/** (or linked runbook) with a “normalize before start” checklist tied to **update-task**.",
      "Reference transcript path above as the worked example.",
      "Avoid scope creep into new CLI commands unless split to a **T###**."
    ],
    acceptanceCriteria: [
      "Merged doc links from triage playbook to the checklist.",
      "Describes **phaseKey** + structured body expectation for **ready** improvements.",
      "This improvement **completed** or **cancelled** with PR / note link."
    ],
    metaPatch: {
      issue:
        "Ready improvements sometimes ship without phase assignment or structured scope, forcing ad-hoc rescue in chat.",
      supportingReasoning:
        "Session **e74c4ba0** demonstrates successful **update-task** normalization; this row tracks turning that into repeatable maintainer process."
    }
  },
  "imp-cca71e81623109": {
    title:
      "Operator footguns: clean JSON from CLI, concurrent task writers, relational `approach` column shape",
    approach: [
      "Transcript **agent-transcripts/58bf4b13-f34c-40ce-a58e-f9df524876d0/** captures three maintainability problems:",
      "(1) **pnpm** / npm wrappers can prepend noise to stdout and break JSON consumers—document **node dist/cli.js run …** (or noise-free invocation) in **AGENT-CLI-MAP**.",
      "(2) Parallel **mutating** `workspace-kit run` calls can **lose updates** (read–modify–write). **planningGeneration** + **expectedPlanningGeneration** (Phase 44+) mitigates when policy is **require**—document the expectation for agents and humans.",
      "(3) Relational SQLite persists **approach** as a single **TEXT** column; passing **string[]** through **update-task** caused **better-sqlite3** “Too many parameter values”—document scalar-vs-array rules; optional follow-up **T###** for stricter validation.",
      "**Expected outcome:** maintainer docs close each footgun with copy-paste-safe examples; optional code validation is a separate execution task if needed."
    ].join("\n\n"),
    technicalScope: [
      "**AGENT-CLI-MAP.md** — JSON stdout, pnpm banner hazard, canonical invocation examples.",
      "**task-persistence-operator.md** (or adjacent) — concurrent writers + generation / retry story.",
      "Relational field guide: **approach**/**summary**/**description** are strings; use **technicalScope** arrays or **description** for bullet lists."
    ],
    acceptanceCriteria: [
      "Each of the three themes has an anchor heading + at least one copy-paste command block.",
      "Transcript path cited for provenance.",
      "Improvement **completed** with merged docs or split to a **T###** for validation code with this id **cancelled** + link."
    ],
    metaPatch: {
      issue:
        "Operators hit JSON parsing failures, unsafe parallel writes to SQLite task state, and SQL bind errors when arrays are sent into scalar TEXT columns.",
      supportingReasoning:
        "Grounded in **58bf4b13** session (wishlist intake, concurrency ADR, Phase 44 tasks, relational **update-task** failure analysis). Replaces raw JSONL-in-title artifact."
    }
  }
};

function underlyingImpFromRetrospective(title) {
  const m = /improvement (imp-[a-f0-9]+)/i.exec(String(title ?? ""));
  return m ? m[1] : null;
}

function buildChurnPayload(readyId, target) {
  const tid = target.id;
  const ttitle = target.title || tid;
  const tst = target.status;
  const short = trunc(ttitle, 88);
  const underlying = underlyingImpFromRetrospective(ttitle);
  const titleLine = underlying
    ? `Lifecycle churn: explain transition burst (${underlying} via retrospective ${tid})`
    : `Lifecycle churn review: ${short}`;

  return {
    title: trunc(titleLine, 200),
    approach: [
      `Queue-health recorded **4** transition events on improvement **${tid}** (“${ttitle}”, current status **${tst}**).`,
      "**Definitive work:** (1) Run **`workspace-kit run get-task-history`** with **`taskId`:** `" +
        tid +
        "` and enough **`limit`** to see the full burst. (2) Summarize the pattern (policy retries, scope thrash, duplicate accepts, tests, benign experimentation).",
      "(3) **If** discoverability (**policyApproval**, CLI tier, improvement vs execution confusion): ship a **minimal** doc patch under **docs/maintainers/** with anchors. **If** benign: **complete** or **reject** this improvement with cited history. **If** product defect: open a **T###** and link it, then close this meta-item."
    ].join("\n\n"),
    technicalScope: [
      `Pull and cite **get-task-history** for **${tid}**.`,
      "Classify root cause before writing prose.",
      "Keep code changes out unless a **T###** is opened for them."
    ],
    acceptanceCriteria: [
      "Root cause stated with evidence (history excerpt, PR, or maintainer note).",
      "Explicit outcome: merged doc fix, evidence-only closure, or linked **T###**.",
      `Improvement **${readyId}** reaches a terminal status with rationale.`
    ],
    metaPatch: {
      issue: `Four lifecycle transitions on **${tid}** while handling “${short}” produced a noisy signal; we need a deliberate explanation to trust queue-health churn heuristics.`,
      supportingReasoning: `Derived from **task_transition** evidence (target **${tid}**, status **${tst}**). Rewritten from auto-title into an actionable maintainer review request.`
    }
  };
}

const list = wk("list-tasks", { type: "improvement", status: "ready" });
if (!list.ok) {
  console.error(list);
  process.exit(1);
}
let gen = list.data.planningGeneration;
const ready = list.data.tasks;
console.error(`Refining ${ready.length} ready improvement(s); start planningGeneration=${gen}`);

let ok = 0;
let fail = 0;

for (const row of ready) {
  const id = row.id;
  let payload;

  if (SPECIAL[id]) {
    payload = SPECIAL[id];
  } else if (row.metadata?.evidenceKind === "task_transition" && row.metadata?.provenanceRefs?.taskId) {
    const tid = row.metadata.provenanceRefs.taskId;
    const gt = wk("get-task", { taskId: tid, expectedPlanningGeneration: gen });
    gen = gt.data?.planningGeneration ?? gen;
    if (!gt.ok) {
      console.error("get-task failed for target", tid, gt);
      fail += 1;
      continue;
    }
    payload = buildChurnPayload(id, gt.data.task);
  } else {
    console.error("skip unknown shape", id);
    fail += 1;
    continue;
  }

  const full = wk("get-task", { taskId: id, expectedPlanningGeneration: gen });
  gen = full.data?.planningGeneration ?? gen;
  if (!full.ok) {
    console.error("get-task failed for self", id, full);
    fail += 1;
    continue;
  }
  const task = full.data.task;
  const metadata = mergeMeta(task.metadata, payload.metaPatch);
  if (Array.isArray(task.metadata?.proposedSolutions) && !metadata.proposedSolutions) {
    metadata.proposedSolutions = task.metadata.proposedSolutions;
  }

  const updates = {
    title: trunc(payload.title, 200),
    approach: payload.approach,
    technicalScope: payload.technicalScope,
    acceptanceCriteria: payload.acceptanceCriteria,
    metadata
  };

  const upd = wk("update-task", {
    taskId: id,
    updates,
    expectedPlanningGeneration: gen
  });
  if (!upd.ok) {
    console.error("update failed", id, upd.message, upd.code);
    fail += 1;
    continue;
  }
  gen = upd.data.planningGeneration ?? gen + 1;
  ok += 1;
  console.error("updated", id);
}

console.error(`Done. ok=${ok} fail=${fail} planningGeneration=${gen}`);
process.exit(fail ? 1 : 0);
