#!/usr/bin/env node
/**
 * One-off: file three improvement tasks describing gaps in the CAE -> defect-filing
 * pipeline (no activation wiring for improvement-discovery; no convenience report-defect
 * command; no agent-failure signal in CAE evaluation context).
 *
 * Run with the same Node 22 runtime that loads better-sqlite3:
 *   PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH" node scripts/_oneoff-cae-defect-pipeline-tasks.mjs
 *
 * Idempotency: skips creation if a task with the same title already exists.
 */
import { spawnSync } from "node:child_process";

function wkRun(command, args) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wk", "run", command, JSON.stringify(args)],
    { encoding: "utf8" }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function readPlanningGeneration() {
  const r = wkRun("get-next-actions", {});
  if (r.status !== 0) {
    console.error("get-next-actions failed:", r.stdout, r.stderr);
    return null;
  }
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed?.planningGeneration ?? parsed?.data?.planningGeneration ?? null;
  } catch {
    return null;
  }
}

function findExistingByTitle(title) {
  const r = wkRun("list-tasks", { type: "improvement", limit: 500 });
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    const rows = parsed?.data?.tasks ?? parsed?.data?.items ?? parsed?.data ?? [];
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find((t) => t?.title === title);
    return hit?.taskId ?? hit?.id ?? null;
  } catch {
    return null;
  }
}

const tasks = [
  {
    title:
      "CAE: wire improvement-discovery playbook into activation registry",
    summary:
      "The cae.playbook.improvement-discovery artifact exists in .ai/cae/registry/artifacts.v1.json but no row in activations.v1.json references it, so CAE evaluation never surfaces the playbook to agents.",
    technicalScope: [
      "Add an activation in .ai/cae/registry/activations.v1.json that references artifactId cae.playbook.improvement-discovery (family: review or do).",
      "Choose an initial scope (e.g. always-on advisory, or scoped to commandName prefix run-transition) and document the choice in .ai/cae/README.md.",
      "Reseed the SQLite CAE registry via cae-import-json-registry and verify with cae-registry-validate.",
      "Add a smoke test that cae-evaluate returns the artifact in the bundle for the chosen scope.",
    ],
    acceptanceCriteria: [
      "grep -c improvement-discovery .ai/cae/registry/activations.v1.json returns >= 1.",
      "cae-evaluate for the chosen scope includes the improvement-discovery artifact in bundle.activations.",
      "cae-registry-validate passes after reseed.",
      "Brief note added to .ai/cae/README.md explaining when the playbook surfaces.",
    ],
    metadata: {
      issue:
        "Agents never see the improvement-discovery playbook surfaced via CAE because no activation row references the artifact, so the documented 'log defects in the task store' habit has no in-loop nudge.",
      supportingReasoning:
        "Verified by grep -c improvement-discovery .ai/cae/registry/activations.v1.json -> 0, while .ai/cae/registry/artifacts.v1.json line 7 declares cae.playbook.improvement-discovery. The artifact-vs-activation gap means improvement-task-discovery.md is only discoverable via human doc reading, not via CAE bundles surfaced to agents during command evaluation.",
      proposedSolutions: [
        "Add a low-priority always-on advisory activation referencing the artifact.",
        "Alternatively scope to commandName prefix run-transition so it surfaces at delivery checkpoints.",
        "Pair with a recommend-strength acknowledgement so dashboards highlight it.",
      ],
    },
  },
  {
    title:
      "Add wk run report-defect convenience command for in-loop agent bug filing",
    summary:
      "create-task for type: improvement requires a brittle JSON shape (technicalScope, acceptanceCriteria, metadata.issue, metadata.supportingReasoning). Long inline JSON in shells is easy to mangle, which discourages agents from filing defects when they hit one.",
    technicalScope: [
      "Add a new task-engine module command report-defect that accepts { title, summary, evidence?, severity?, features?, relatedTaskId? }.",
      "Internally synthesize a valid type: improvement, status: proposed task with sane defaults: technicalScope = ['Investigate symptom', 'Reproduce', 'Propose fix'], acceptanceCriteria = ['Root cause documented', 'Fix landed or follow-up tasks filed'].",
      "Set metadata.issue from summary; require evidence string and put it in metadata.supportingReasoning.",
      "Document under src/modules/task-engine/instructions/report-defect.md and link from .ai/AGENT-CLI-MAP.md as Tier A.",
      "Add to dashboard quick-actions and Cursor command surface.",
    ],
    acceptanceCriteria: [
      "wk run report-defect '{\"title\":\"x\",\"summary\":\"y\",\"evidence\":\"z\"}' creates a valid improvement task with status proposed.",
      "Task passes the same validation as a hand-rolled create-task (technicalScope, acceptanceCriteria, metadata.issue, metadata.supportingReasoning all populated).",
      "Instruction doc exists; AGENT-CLI-MAP entry added.",
      "Unit test covers default population and rejection on missing summary/evidence.",
    ],
    metadata: {
      issue:
        "Agents face high-friction defect filing: the create-task JSON shape is large enough that a single typo aborts the call, and persistent terminals routinely mangle multi-line embedded JSON. Result: bugs are reported in chat instead of being persisted.",
      supportingReasoning:
        "Recent observed failure: create-task invocation for an agent-latency improvement died with exit 2 due to embedded-quote corruption (see terminal history). This matches the recorded user memory note 'Long inline shell commands with embedded JSON/Node code can be mangled in persistent terminals; prefer a temp script file for complex task mutations.' A narrow convenience command removes the brittle path entirely.",
      proposedSolutions: [
        "Implement report-defect as a thin wrapper over create-task that fills required improvement fields.",
        "Optionally accept --evidence-file path to read evidence from disk to avoid shell quoting altogether.",
        "Surface as the recommended action in CAE failure-recovery guidance.",
      ],
    },
  },
  {
    title:
      "CAE: add agent failure signals to evaluation context and an activation kind that consumes them",
    summary:
      "CAE activation conditions today are limited to always, phaseKey, commandName, and taskTag. There is no signal for 'agent just hit an error' or 'consecutive retries', so no activation can fire when agents actually need defect-filing guidance.",
    technicalScope: [
      "Extend schemas/cae/evaluation-context.v1.json with an optional agentSignals block: { recentToolFailures?: number, lastErrorCode?: string, consecutiveRetries?: number, lastFailureKind?: string }.",
      "Update src/core/cae/cae-evaluate.ts and the evaluation-context type to thread the new field through.",
      "Add a new activation condition kind agentFailureSignal in schemas/cae/activation-definition.schema.json with operators (>=, ==, in).",
      "Implement matcher logic in cae-evaluate condition evaluation.",
      "Add an activation row that uses agentFailureSignal -> cae.playbook.improvement-discovery (and/or a new report-defect runbook artifact).",
      "Document the contract in .ai/cae/evaluation-context.md and add a smoke test.",
    ],
    acceptanceCriteria: [
      "evaluation-context schema accepts agentSignals and old payloads still validate.",
      "activation-definition schema accepts conditions[].kind = agentFailureSignal.",
      "cae-evaluate fires the new activation when agentSignals.recentToolFailures >= threshold.",
      "Activation referencing improvement-discovery (or report-defect) fires under the failure scope and the artifact appears in the returned bundle.",
      "Smoke test added under test/cae/ exercising the failure-signal matcher.",
    ],
    metadata: {
      issue:
        "Even if the improvement-discovery playbook is wired into the registry, CAE has no way to surface it in response to actual agent friction - the evaluation context carries no error/failure/retry signal, and no condition kind exists to match such a signal.",
      supportingReasoning:
        "Reviewed schemas/cae/* and .ai/cae/registry/activations.v1.json: condition kinds are limited to always, phaseKey, commandName, and taskTag. No field on evaluationContext represents tool failures or retries. This blocks the goal of 'when an agent encounters issues, surface defect-filing guidance' from being implementable as a CAE activation.",
      proposedSolutions: [
        "Add agentSignals to the evaluation context as an optional, additive change (no consumer migration required).",
        "Introduce agentFailureSignal condition kind with simple comparison operators.",
        "Pair with a follow-up that has the runtime populate agentSignals from a session-local counter (out of scope for this task but tracked under dependsOn/unblocks).",
      ],
    },
  },
];

let created = 0;
let skipped = 0;
for (const t of tasks) {
  const existing = findExistingByTitle(t.title);
  if (existing) {
    console.log(`SKIP  ${existing}  ${t.title}`);
    skipped++;
    continue;
  }
  const args = {
    allocateId: true,
    title: t.title,
    type: "improvement",
    status: "proposed",
    priority: "P2",
    summary: t.summary,
    technicalScope: t.technicalScope,
    acceptanceCriteria: t.acceptanceCriteria,
    metadata: t.metadata,
  };
  const gen = readPlanningGeneration();
  if (gen != null) args.expectedPlanningGeneration = gen;
  const r = wkRun("create-task", args);
  if (r.status !== 0) {
    console.error(`FAIL  ${t.title}`);
    console.error(r.stdout);
    console.error(r.stderr);
    process.exitCode = 1;
    continue;
  }
  try {
    const parsed = JSON.parse(r.stdout);
    const id = parsed?.data?.task?.taskId ?? parsed?.data?.taskId ?? "?";
    console.log(`OK    ${id}  ${t.title}`);
  } catch {
    console.log(`OK    (unparsed stdout)  ${t.title}`);
  }
  created++;
}

console.log(`\nDone. created=${created} skipped=${skipped}`);
