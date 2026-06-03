/**
 * Composer seed for phase closeout + release (dashboard Complete & Release).
 * Machine canon: `.ai/playbooks/phase-closeout-and-release.md`, `task-to-phase-branch.md`.
 */

export type PhaseCompleteReleaseScope = "current" | "bucket";

export type PhaseCompleteReleasePromptOptions = {
  /** Stable phase key (e.g. `"64"`). Names `release/phase-<key>`. */
  phaseKey?: string;
  phaseLabel?: string;
  currentKitPhase?: string;
  nextKitPhase?: string;
  scope?: PhaseCompleteReleaseScope;
};

function branchRef(phaseKey: string | undefined): string {
  const pk = phaseKey?.trim();
  return pk ? `release/phase-${pk}` : "release/phase-<N>";
}

export function buildPhaseCompleteReleaseChatPrompt(
  phaseLabelOrPhrase: string,
  options?: PhaseCompleteReleasePromptOptions
): string {
  const pk = options?.phaseKey?.trim();
  const label = options?.phaseLabel?.trim() ?? phaseLabelOrPhrase.trim();
  const cur = options?.currentKitPhase?.trim() ?? "";
  const next = options?.nextKitPhase?.trim() ?? "";
  const scope = options?.scope ?? (pk && cur && pk === cur ? "current" : "bucket");
  const branch = branchRef(pk);

  return [
    "phase-release-orchestration-state",
    "",
    "Run this first. Work from its verdict, refs.commands, and refs.instructions instead of broad re-discovery.",
    "",
    "## Context",
    `* target phaseKey: \`${pk ?? "{{phaseKey}}"}\``,
    `* label: \`${label || "{{phaseLabel}}"}\``,
    `* workspace current / next: \`${cur || "{{currentKitPhase}}"}\` / \`${next || "{{nextKitPhase}}"}\``,
    `* scope: \`${scope}\``,
    `* integration branch: \`${branch}\``,
    "* dashboard authorization: complete-and-release",
    "",
    "## Authority",
    "Follow the attached machine guidance. Do not restate routine mechanics.",
    "",
    "* `@.ai/playbooks/phase-closeout-and-release.md`",
    "* `@.ai/playbooks/task-to-phase-branch.md`",
    "* `@.ai/runbooks/phase-closeout-ordering-recovery.md`",
    "* `@.ai/AGENT-CLI-MAP.md`",
    "",
    "## Authorization and policy",
    "",
    "Treat this dashboard launch as operator authorization to orchestrate closeout, release, and publish for the target phase when the attached gates allow it.",
    "Tier A/B `wk run` mutations still require JSON `policyApproval`; the dashboard launch does not bypass policy.",
    "Do not ask for routine confirmation. Ask only for a real decision, a failed gate, unsafe publish, missing access, or an unresolved git/task-state conflict.",
    "",
    "## Operate from the verdict",
    "",
    "You are the orchestrator, not the default implementer.",
    "Use Workflow Cannon state as the source of truth. Refresh only after material changes.",
    "* `tasks-remaining` or `blocked`: drain the phase first. Register assignments, keep assignment/activity current, require structured handoff, reconcile, then continue.",
    "* `closeout-pending`: fix preflight or evidence findings before release work.",
    "* `ready-to-ship`, `release-running`, or `post-release`: follow the returned closeout/release refs directly.",
    "* No safe release path or no phase work: stop and report instead of improvising.",
    "",
    "Before finalizing execution tasks, if Phase 1 plan review warnings remain, refine/review the Phase 1 plan first.",
    "",
    "## Worker starts",
    "",
    "Start every worker from `agent-execution-packet`, not from a broad task list. Use the assignment packet for owned/read-only/forbidden paths, approval boundaries, validation commands, handoff refs, and stop conditions.",
    "Do not batch unrelated work into one vague assignment.",
    "",
    "## Final response",
    "",
    "```text",
    "Phase:",
    "Verdict:",
    "Path taken:",
    "Released version:",
    "Published package:",
    "Branches / PRs:",
    "Tag:",
    "Tasks completed during orchestration:",
    "Team Assignments used:",
    "Validation evidence:",
    "Release evidence:",
    "Remaining follow-ups:",
    "```",
    "",
    "If blocked, report:",
    "",
    "```text",
    "Phase:",
    "Verdict:",
    "Path taken:",
    "Blocked reason:",
    "Remaining task ids:",
    "Blocked task ids:",
    "Assignment ids:",
    "Branches / PRs:",
    "Last relevant evidence:",
    "Decision needed:",
    "Recommended next step:",
    "```",
    "",
    "Use concrete IDs and evidence. Do not use placeholders."
  ].join("\n");
}
