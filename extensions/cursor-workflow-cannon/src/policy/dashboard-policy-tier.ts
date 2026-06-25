/**
 * Dashboard → workspace-kit policy UX tier contract (Phase 107).
 * Drawer wiring lives in later tasks; this module is lookup + rationale shape only.
 */

export type PolicyUxTier = "routine" | "elevated";

export type DashboardPolicyTierRow = {
  workflowId: string;
  /** Disambiguates multiple kit commands or modes under one drawer workflow. */
  action: string;
  command: string;
  tier: PolicyUxTier;
  notes?: string;
};

/** Stable matrix: Dashboard workflowId + action → wk run command → routine | elevated. */
export const DASHBOARD_POLICY_TIER_MATRIX: readonly DashboardPolicyTierRow[] = [
  { workflowId: "accept-proposed", action: "accept-single", command: "run-transition", tier: "routine" },
  { workflowId: "accept-proposed", action: "accept-batch", command: "run-transition", tier: "routine" },
  { workflowId: "plan-artifact", action: "accept", command: "accept-plan-artifact", tier: "routine" },
  { workflowId: "plan-artifact", action: "finalize", command: "finalize-plan-to-phase", tier: "routine" },
  { workflowId: "review-approval-item", action: "accept", command: "review-item", tier: "routine" },
  { workflowId: "review-approval-item", action: "decline", command: "review-item", tier: "routine" },
  { workflowId: "review-approval-item", action: "accept_edited", command: "review-item", tier: "routine" },
  { workflowId: "dismiss-phase-note", action: "critical", command: "dismiss-phase-note", tier: "elevated" },
  { workflowId: "dismiss-phase-note", action: "normal", command: "dismiss-phase-note", tier: "routine" },
  { workflowId: "assign-task-phase", action: "assign", command: "assign-task-phase", tier: "routine" },
  { workflowId: "convert-phase-note", action: "convert", command: "convert-phase-note-to-task", tier: "routine" },
  { workflowId: "persist-phase-note-proposals", action: "propose", command: "propose-tasks-from-phase-notes", tier: "routine" },
  { workflowId: "register-team-assignment", action: "register", command: "register-assignment", tier: "routine" },
  { workflowId: "submit-team-handoff", action: "handoff", command: "submit-assignment-handoff", tier: "routine" },
  { workflowId: "reconcile-team-assignment", action: "reconcile", command: "reconcile-assignment", tier: "routine" },
  { workflowId: "block-team-assignment", action: "block", command: "block-assignment", tier: "elevated" },
  { workflowId: "cancel-team-assignment", action: "cancel", command: "cancel-assignment", tier: "elevated" },
  { workflowId: "register-subagent", action: "register", command: "register-subagent", tier: "elevated" },
  { workflowId: "spawn-subagent", action: "spawn", command: "spawn-subagent", tier: "routine" },
  { workflowId: "close-subagent-session", action: "close", command: "close-subagent-session", tier: "routine" },
  { workflowId: "retire-subagent", action: "retire", command: "retire-subagent", tier: "routine" },
  { workflowId: "create-checkpoint", action: "create", command: "create-checkpoint", tier: "routine" },
  { workflowId: "rewind-to-checkpoint", action: "rewind", command: "rewind-to-checkpoint", tier: "elevated" },
  { workflowId: "register-phase-catalog", action: "upsert", command: "upsert-phase-catalog-entry", tier: "routine" },
  { workflowId: "add-phase-note", action: "add", command: "add-phase-note", tier: "routine" },
  { workflowId: "edit-phase-note", action: "update", command: "update-phase-note", tier: "routine" },
  { workflowId: "ideas", action: "create", command: "create-idea", tier: "routine" },
  { workflowId: "ideas", action: "update", command: "update-idea", tier: "routine" },
  { workflowId: "ideas", action: "plan", command: "update-idea", tier: "routine" },
  { workflowId: "ideas", action: "delete", command: "delete-idea", tier: "routine" },
  { workflowId: "ideas", action: "reorder", command: "reorder-ideas", tier: "routine" },
  { workflowId: "palette-run-transition", action: "start", command: "run-transition", tier: "routine" },
  { workflowId: "palette-run-transition", action: "complete", command: "run-transition", tier: "routine" },
  { workflowId: "palette-run-transition", action: "accept", command: "run-transition", tier: "routine" },
  { workflowId: "palette-run-transition", action: "reject", command: "run-transition", tier: "routine" },
  { workflowId: "palette-run-transition", action: "decline", command: "run-transition", tier: "routine" }
] as const;

export function resolveDashboardPolicyTierRow(
  workflowId: string,
  action: string
): DashboardPolicyTierRow | undefined {
  const wf = workflowId.trim();
  const act = action.trim();
  return DASHBOARD_POLICY_TIER_MATRIX.find((r) => r.workflowId === wf && r.action === act);
}

export function listDashboardPolicyTierRows(): DashboardPolicyTierRow[] {
  return [...DASHBOARD_POLICY_TIER_MATRIX];
}

/** Generic footer for elevated drawer descriptionHtml. */
export const ELEVATED_POLICY_EXPLAINER_HTML =
  "<p><b>Elevated policy path.</b> This action is outside the routine Dashboard tier. " +
  "Enter a specific, auditable rationale below — routine actions auto-fill policy traces; " +
  "terminal <code>wk run</code> from agents still requires explicit JSON " +
  "<code>policyApproval</code>.</p>";

/** Per-path lead-in (workflowId:action → HTML fragment). */
export const ELEVATED_POLICY_EXPLAINER_LEAD_BY_PATH: Readonly<Record<string, string>> = {
  "accept-proposed:accept-batch":
    "<p><b>Batch accept.</b> You are promoting multiple proposed tasks in one submit. " +
    "One shared rationale is recorded for every <code>run-transition</code> <code>accept</code>.</p>",
  "dismiss-phase-note:critical":
    "<p><b>Critical phase note.</b> Dismissing an active critical note is policy-gated; " +
    "kit requires <code>policyApproval</code> in addition to your dismiss reason.</p>",
  "rewind-to-checkpoint:rewind":
    "<p><b>Destructive rewind.</b> May run <code>git reset --hard</code> or <code>git stash apply</code>. " +
    "Force on a dirty worktree can lose uncommitted work.</p>",
  "block-team-assignment:block":
    "<p><b>Block assignment.</b> Stops the worker handoff path until reconciled or cancelled.</p>",
  "cancel-team-assignment:cancel":
    "<p><b>Cancel assignment.</b> Ends the assignment record; use when the handoff should not continue.</p>",
  "register-subagent:register":
    "<p><b>Register subagent role.</b> Persists an allowlist of kit commands this subagent may invoke — " +
    "review commands before registering.</p>"
};

export function elevatedPolicyExplainerHtml(workflowId: string, action: string): string | undefined {
  const row = resolveDashboardPolicyTierRow(workflowId, action);
  if (row?.tier !== "elevated") {
    return undefined;
  }
  const key = `${workflowId.trim()}:${action.trim()}`;
  const lead = ELEVATED_POLICY_EXPLAINER_LEAD_BY_PATH[key] ?? "";
  return lead + ELEVATED_POLICY_EXPLAINER_HTML;
}

/** Prepend elevated policy copy when the path tier is elevated. */
export function appendElevatedPolicyExplainer(
  baseDescriptionHtml: string | undefined,
  workflowId: string,
  action: string
): string | undefined {
  const expl = elevatedPolicyExplainerHtml(workflowId, action);
  if (!expl) {
    return baseDescriptionHtml;
  }
  const base = (baseDescriptionHtml ?? "").trim();
  return base.length > 0 ? expl + base : expl;
}
