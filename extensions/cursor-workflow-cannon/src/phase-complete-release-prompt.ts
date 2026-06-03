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
    "Packet-first rollout is activation-gated: use it only for this dashboard-launched Complete & Release flow, or when an equivalent operator feature flag/rollout note explicitly enables `phase-release-orchestration-state` packets.",
    "If packet-first is not explicitly activated for the run, use the existing full-refresh/manual discovery path from the attached playbooks and command refs.",
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
    "## Packet fallback",
    "",
    "Disable packet-first for this run if `phase-release-orchestration-state` is unavailable, returns `ok: false`, omits `data.verdict`, `refs.commands`, or `refs.instructions`, reports a phase/branch mismatch you cannot reconcile, or carries stale planning/task-state evidence.",
    "Also disable packet-first if `phase-drain-delta` rejects, misses, or stales its cursor, overflows beyond safe bounded evidence, or returns `refreshRecommendation.mode: \"full-refresh\"`.",
    "Fallback means run full-refresh commands before acting: `pnpm exec wk run phase-release-orchestration-state '{}'`, `pnpm exec wk run phase-closeout-readiness '{\"phaseKey\":\"<N>\"}'`, and the closeout/preflight commands named by `.ai/playbooks/phase-closeout-and-release.md`.",
    "If command refs are missing or suspect, use `pnpm exec wk run --json` plus the attached instruction paths for manual discovery, then proceed only from fresh full-refresh evidence.",
    "",
    "## Worker starts",
    "",
    "Start every worker from `agent-execution-packet`, not from a broad task list. Use the assignment packet for owned/read-only/forbidden paths, approval boundaries, validation commands, handoff refs, and stop conditions.",
    "Do not batch unrelated work into one vague assignment.",
    "",
    "## Rollback",
    "",
    "If packet-first orchestration creates release risk, stop release work and roll back the activation by reverting this prompt's packet-first activation/fallback sections to the previous full-refresh/manual closeout seed.",
    "If command behavior caused the risk, disable or revert the packet commands that introduced it (`phase-release-orchestration-state`, `phase-drain-delta`, or `agent-execution-packet`) and rerun the closeout from the attached playbooks with full-refresh evidence.",
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
