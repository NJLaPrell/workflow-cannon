#!/usr/bin/env node
/**
 * One-off: file three improvement tasks describing why agents are not leaving
 * phase notes (CAE phase-journal activations are pinned to phaseKey "79"; the
 * delivery playbooks never instruct agents to capture notes; AGENTS.md has no
 * directive making note-capture an expected default; dashboards do not surface
 * silence).
 *
 * Run with the same Node 22 runtime that loads better-sqlite3:
 *   PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH" node scripts/_oneoff-phase-journal-adoption-tasks.mjs
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
      "CAE: generalize phase-journal activations off the hard-coded phaseKey 79 scope",
    summary:
      "All three phase-journal CAE activations in .ai/cae/registry/activations.v1.json are scoped to { kind: phaseKey, value: 79 }. Current and future phases never trigger them, so the phase-journal-operator runbook is invisible in cae-evaluate bundles outside phase 79.",
    technicalScope: [
      "Open .ai/cae/registry/activations.v1.json and edit the three activations cae.activation.think.phase79-phase-journal-run-transition, cae.activation.think.phase79-phase-journal-get-context, and cae.activation.do.phase79-phase-journal-add-note.",
      "Replace the phaseKey: 79 scoping with kind: always (or a tag-based scope) so the activations fire on the relevant commandName regardless of phase.",
      "Rename the activation IDs to drop the phase79 prefix (e.g. cae.activation.think.phase-journal-run-transition).",
      "Reseed via cae-import-json-registry and verify with cae-registry-validate.",
      "Add a smoke test confirming that cae-evaluate for { commandName: add-phase-note } returns the phase-journal-operator artifact regardless of phaseKey.",
    ],
    acceptanceCriteria: [
      "grep \"phaseKey\\\":\\\"?79\" .ai/cae/registry/activations.v1.json returns no matches in the phase-journal activation blocks.",
      "cae-evaluate for the three target commandNames returns the phase-journal-operator artifact when phaseKey is set to the current workspace phase (not 79).",
      "cae-registry-validate passes after reseed.",
      "Smoke test added under test/cae/ exercising the new scope.",
    ],
    metadata: {
      issue:
        "Phase-journal guidance is gated behind phaseKey 79 and therefore never surfaces in the current workspace (phase 95). Agents do not see the phase-journal-operator runbook in any bundle, so the documented add-phase-note / phaseNotes habit has zero in-loop nudge.",
      supportingReasoning:
        "Verified by inspecting .ai/cae/registry/activations.v1.json lines 154-194: each of the three phase-journal activations carries { kind: phaseKey, value: 79 } as a required condition. Empirical: SELECT COUNT(*) FROM phase_notes returns 0 in this workspace's task store, and get-next-actions reports phaseContext.relevantNotes = []. The hard-coded phase scope is the most direct CAE-side cause of zero adoption.",
      proposedSolutions: [
        "Switch the scope to kind: always with priority demoted to advisory, keeping the commandName condition as the trigger.",
        "Alternatively introduce a tag-based scope (e.g. taskTag includes phase-journal) and tag in-flight tasks accordingly.",
        "Pair with a follow-up that adds an activation surfacing the runbook on run-transition regardless of command, so notes are captured at start/complete checkpoints.",
      ],
    },
  },
  {
    title:
      "Playbooks: add explicit add-phase-note / phaseNotes step to delivery checklists",
    summary:
      ".ai/playbooks/task-to-phase-branch.md and .ai/playbooks/phase-closeout-and-release.md never reference add-phase-note, phaseNotes, or the phase-journal commands. Agents follow these playbooks for every task and therefore never capture findings, gotchas, or decisions in the journal.",
    technicalScope: [
      "Edit .ai/playbooks/task-to-phase-branch.md to add a step at task start (capture inherited context as a finding/decision note) and at task complete (capture gotcha/follow-up notes).",
      "Recommend the phaseNotes[] rider on the run-transition call so capture is one round-trip, not two CLI invocations.",
      "Edit .ai/playbooks/phase-closeout-and-release.md to add a step that lists outstanding notes via list-phase-notes and converts actionable ones via convert-phase-note-to-task before closeout.",
      "Cross-link to src/modules/task-engine/instructions/add-phase-note.md and run-transition.md.",
      "Update .ai/AGENTS.md with a new rule entry making note-capture the default expectation when a finding/decision/gotcha is observed.",
    ],
    acceptanceCriteria: [
      "Both delivery playbooks contain at least one explicit reference each to add-phase-note or phaseNotes with concrete trigger conditions.",
      ".ai/AGENTS.md gains a rule directive (e.g. attach_phase_notes_on_run_transition_when_finding_decision_or_gotcha_was_observed).",
      "Phase closeout playbook includes a list-phase-notes review step before release.",
      "Spot-check: a fresh agent run on a sample task produces at least one phase note in phase_notes.",
    ],
    metadata: {
      issue:
        "Delivery playbooks - the surface agents actually read on every task - contain zero operational guidance for the phase journal. Without a step in the checklist, note capture never happens even though the feature is fully implemented.",
      supportingReasoning:
        "grep on .ai/playbooks/task-to-phase-branch.md and .ai/playbooks/phase-closeout-and-release.md for add-phase-note / phaseNotes / phase-journal returns 0 actionable matches (the single hit is the noun 'phase notes' used to mean ROADMAP prose). Combined with empirical SELECT COUNT(*) FROM phase_notes = 0, this confirms the playbook gap is a primary cause of non-adoption.",
      proposedSolutions: [
        "Add concrete CLI snippets (using the JSON shape required by add-phase-note) directly in the playbook step for low-friction copy-paste.",
        "Require phaseNotes on run-transition complete when the agent reports any blocker, finding, or follow-up in chat.",
        "Add a phase-closeout gate that fails review if zero notes exist for a phase that consumed > N tasks.",
      ],
    },
  },
  {
    title:
      "Dashboard: surface phase-journal silence and a one-click add-phase-note action",
    summary:
      "Operators have no visible signal when a phase has accumulated zero notes. The dashboard and Cursor extension should surface a 'phase notes added this phase: N' counter and offer a one-click add-phase-note quick action so silence becomes obvious and capture becomes frictionless.",
    technicalScope: [
      "Extend the dashboard data source to include phase-note counts per phase (group by phase_key with totals and recency).",
      "Add a panel or badge to the dashboard summary view showing 'Notes captured this phase: N' with a warning treatment when N == 0 after K completed tasks.",
      "Add a 'Add phase note' quick action to extensions/cursor-workflow-cannon/ that opens a small form (noteType, summary, optional details) and calls wk run add-phase-note.",
      "Wire the same surface into dashboard quick-actions if present.",
      "Add docs under docs/maintainers/ describing the new signal and recommended thresholds.",
    ],
    acceptanceCriteria: [
      "Dashboard payload includes per-phase note counts (verifiable via JSON output).",
      "UI shows the counter and applies a warning style when notes == 0.",
      "Cursor extension exposes an Add phase note command that creates a valid phase_notes row.",
      "Maintainer doc updated.",
    ],
    metadata: {
      issue:
        "Zero-note phases are invisible. There is no projection, no dashboard counter, no nudge. By the time anyone notices, the operational context that could have been captured is gone.",
      supportingReasoning:
        "SELECT phase_key, COUNT(*) FROM phase_notes GROUP BY phase_key returns no rows in this workspace, and nothing in the dashboard summary or Cursor extension currently exposes that fact. Adding a counter is the cheapest behavioral nudge: operators will start asking 'why is the journal empty for this phase?' and that pressure propagates back to agents.",
      proposedSolutions: [
        "Add a SQL projection get-phase-journal-stats and a dashboard tile fed by it.",
        "Add the Cursor command and bind it to a keybinding for low-friction capture.",
        "Optionally add an end-of-phase report that lists capture rate alongside throughput.",
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
