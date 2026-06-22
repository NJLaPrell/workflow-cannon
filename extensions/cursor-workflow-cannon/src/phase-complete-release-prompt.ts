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

function orchestrationStateCommand(phaseKey: string | undefined, scope: PhaseCompleteReleaseScope, branch: string): string {
  const pk = phaseKey?.trim() || "<N>";
  return `pnpm exec wk run phase-release-orchestration-state '${JSON.stringify({
    phaseKey: pk,
    scope,
    integrationBranch: branch,
    dashboardAuthorization: "complete-and-release"
  })}'`;
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
  const command = orchestrationStateCommand(pk, scope, branch);

  return [
    "## Context source",
    "Use Workflow Cannon MCP tools first for phase context, verdict, and refs when available; fall back to the CLI command when MCP is unavailable, stale, or missing the needed tool.",
    "",
    command,
    "",
    "When MCP is available: request phase context for `" + (pk ?? "{{phaseKey}}") + "`; read verdict and refs directly from the MCP response; skip the CLI command when MCP provides a fresh result.",
    "When MCP is unavailable or stale: run the CLI command above. Work from `data.verdict`, `refs.commands`, and `refs.instructions`; refresh only after material changes.",
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
    "Dashboard authorization covers closeout, release, and publish when gates allow. Tier A/B `wk run` mutations still require JSON `policyApproval`.",
    "",
    "* `@.ai/playbooks/phase-closeout-and-release.md`",
    "* `@.ai/playbooks/task-to-phase-branch.md`",
    "* `@.ai/runbooks/phase-closeout-ordering-recovery.md`",
    "* `@.ai/AGENT-CLI-MAP.md`",
    "Ask only for a real decision, failed gate, unsafe publish, missing access, or unresolved git/task-state conflict.",
    "",
    "## Operate from the verdict",
    "",
    "You are the orchestrator, not the default implementer.",
    "* `tasks-remaining` or `blocked`: drain the phase first. Register assignments, keep assignment/activity current, require structured handoff, reconcile, then continue.",
    "* `closeout-pending`: fix preflight or evidence findings before release work.",
    "* `ready-to-ship`, `release-running`, or `post-release`: follow the returned closeout/release refs directly.",
    "* No safe release path or no phase work: stop and report instead of improvising.",
    "",
    "Before finalizing execution tasks, if Phase 1 plan review warnings remain, refine/review the Phase 1 plan first.",
    "",
    "## Packet fallback",
    "",
    "Disable packet-first if the first command is unavailable, returns `ok: false`, omits `data.verdict`, `refs.commands`, or `refs.instructions`, or reports stale/mismatched phase, branch, planning, or task-state evidence.",
    "Also fall back if `phase-drain-delta` rejects, stales its cursor, overflows safe bounded evidence, or returns `refreshRecommendation.mode: \"full-refresh\"`.",
    `Fallback full refresh before acting: \`${command}\`, \`pnpm exec wk run phase-closeout-readiness '{"phaseKey":"${pk || "<N>"}"}'\`, then the closeout/preflight commands named by refs or the attached playbooks.`,
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
