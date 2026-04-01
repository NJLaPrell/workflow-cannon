#!/usr/bin/env node
/**
 * One-shot: refresh active improvement tasks with human-readable issue + proposals,
 * then demote ready → proposed (requires run-transition policyApproval).
 * Usage: node scripts/rewrite-active-improvements.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

const POLICY = {
  policyApproval: {
    confirmed: true,
    rationale: "Batch demote reviewed auto-generated improvements to proposed after editorial pass"
  }
};

function runJson(sub, payload) {
  const out = execFileSync(process.execPath, [CLI, "run", sub, JSON.stringify(payload)], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const j = JSON.parse(out);
  if (!j.ok) {
    console.error(sub, j);
    throw new Error(j.message || j.code || "CLI failed");
  }
  return j;
}

function getTask(taskId) {
  return runJson("get-task", { taskId }).data.task;
}

/** @param {string} linkedImp */
function churnBundle(linkedImp) {
  return {
    title: `Stabilize lifecycle for ${linkedImp} (transition churn flagged)`,
    approach: `Issue: Recommendation pipeline detected many status transitions on improvement task ${linkedImp} (task-friction heuristic). That usually means unclear scope, policy or CLI confusion, pause/complete loops, or one-off testing—not a calm execution path.

Proposed solutions: (1) Inspect transition history for ${linkedImp} and write a one-paragraph root cause (operator error vs product gap). (2) If policy-related, tighten AGENT-CLI-MAP / POLICY-APPROVAL pointers or CLI error text. (3) If the underlying improvement was vague, rewrite its title/acceptance criteria or split work. (4) If this was noise (fixtures, manual churn), reject this meta-item and consider tuning churn detection.`,
    technicalScope: [
      "Task engine transition evidence / get-task-history",
      "Maintainer docs and CLI surfaces for lifecycle clarity",
      "Optional: queue-health or generator threshold tuning"
    ],
    acceptanceCriteria: [
      "Linked task churn is explained (doc note, PR comment, or explicit reject rationale).",
      "Either a shipped doc/CLI/UX fix addresses the cause, or both this item and the false-positive rationale are recorded.",
      "No recurring unexplained churn on the same linked improvement after follow-up."
    ]
  };
}

const TRANSCRIPT_SPECS = [
  {
    id: "imp-c5c3e9a0f121ff",
    transcript: "51c5244d-18b2-4718-a0a1-e37290d78b68",
    title: "Fix AGENTS.md list numbering / discoverability friction (transcript-derived)",
    approach: `Issue: Session transcript for ${"51c5244d-18b2-4718-a0a1-e37290d78b68"} surfaced duplicate "5." numbering in AGENTS.md and related navigation friction while the agent was reconciling maintainer docs.

Proposed solutions: (1) Audit AGENTS.md ordered sections and renumber so anchors are unique and stable. (2) Add a lightweight check (existing governance script pattern) or doctor hint if duplicate ordered-list markers recur. (3) Cross-link canonical vs mirror tiers once so agents hit the right file first.`,
    technicalScope: [
      "docs/maintainers/AGENTS.md and mirror .ai/AGENTS.md alignment",
      "Optional: scripts/check-* guard for duplicate section numbers"
    ],
    acceptanceCriteria: [
      "AGENTS.md (and mirrored .ai copy if applicable) have consistent, non-duplicated numbering for navigated sections.",
      "No false duplicate warnings from any new check, or documented waiver.",
      "Transcript theme recorded as addressed or explicitly declined with reason."
    ]
  },
  {
    id: "imp-0869d684fd5964",
    transcript: "f7814075-3f12-4d31-8e35-61c4cf83de0d",
    title: "Clarify Workflow Cannon vs workspace-kit naming in onboarding paths (transcript-derived)",
    approach: `Issue: Transcript ${"f7814075-3f12-4d31-8e35-61c4cf83de0d"} shows the assistant summarizing product context; friction score suggests possible confusion between repo/product naming and the \`workspace-kit\` CLI surface for new contributors.

Proposed solutions: (1) Add a short "Names you will see" callout (README + AGENTS) mapping Workflow Cannon, package name, and \`wk\`/\`workspace-kit\` binaries. (2) Ensure first-run doctor / help text uses the same vocabulary. (3) Decline if audit shows no actual confusion beyond generic onboarding.`,
    technicalScope: [
      "README.md maintainer/contributor path",
      "docs/maintainers/AGENTS.md tier-0 orientation",
      "CLI top-level help copy in src/cli.ts if needed"
    ],
    acceptanceCriteria: [
      "One canonical paragraph exists that disambiguates product vs CLI names; linked from README or AGENTS.",
      "Spot-check: new contributor path (≤5 hops) mentions the same terms as doctor output.",
      "False positive documented if no change is warranted."
    ]
  }
];

const CHURN_LINKED = [
  ["imp-04ccc2dbb50f00", "imp-df7ebd9967433c"],
  ["imp-448d97ea7ced70", "imp-d8ed5fa0b6c093"],
  ["imp-498bf46e454d41", "imp-a7dcdec79a791b"],
  ["imp-5150ddb0f43d69", "imp-5ba2f6a0c3bd4a"],
  ["imp-708959f1fca355", "imp-3bf93773a8c983"],
  ["imp-9b16db156c6f40", "imp-f39584e6613337"],
  ["imp-be8131b288ead5", "imp-d3d2643f55fd43"],
  ["imp-c1492401b261ab", "imp-5dc1ffa28ccdc3"],
  ["imp-dcc0e15118b0fe", "imp-c584f0e206c404"],
  ["imp-df5d8dd545edc9", "imp-6a07b608c1b752"],
  ["imp-f164c9c96da7f1", "imp-4cf9c424e5bfb2"],
  ["imp-f56f4f5903b9ae", "imp-190189d4b01bc1"]
];

function main() {
  const updates = [];

  for (const [id, linked] of CHURN_LINKED) {
    const t = getTask(id);
    const b = churnBundle(linked);
    updates.push({
      taskId: id,
      updates: {
        title: b.title,
        approach: b.approach,
        technicalScope: b.technicalScope,
        acceptanceCriteria: b.acceptanceCriteria,
        metadata: {
          ...(t.metadata && typeof t.metadata === "object" ? t.metadata : {}),
          issue: `High transition churn detected on ${linked}.`,
          proposedSolutions: [
            "Analyze transition log for linked improvement",
            "Fix docs/CLI/policy confusion if root cause",
            "Refine or split vague underlying improvement",
            "Reject meta-item if test noise"
          ]
        }
      }
    });
  }

  for (const spec of TRANSCRIPT_SPECS) {
    const t = getTask(spec.id);
    updates.push({
      taskId: spec.id,
      updates: {
        title: spec.title,
        approach: spec.approach,
        technicalScope: spec.technicalScope,
        acceptanceCriteria: spec.acceptanceCriteria,
        metadata: {
          ...(t.metadata && typeof t.metadata === "object" ? t.metadata : {}),
          issue: `Transcript friction heuristic on session ${spec.transcript}.`,
          proposedSolutions: [
            "Read transcript and extract concrete operator pain",
            "Ship doc or CLI copy change",
            "Add guardrail test if recurring",
            "Decline if false positive"
          ]
        }
      }
    });
  }

  for (const { taskId, updates: u } of updates) {
    console.error("update-task", taskId);
    runJson("update-task", { taskId, updates: u, actor: "maintainer-script" });
  }

  for (const { taskId } of updates) {
    console.error("run-transition demote", taskId);
    runJson("run-transition", {
      taskId,
      action: "demote",
      actor: "maintainer-script",
      ...POLICY
    });
  }

  console.log(JSON.stringify({ ok: true, updatedAndDemoted: updates.length }, null, 2));
}

main();
