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
  { workflowId: "accept-proposed", action: "accept-batch", command: "run-transition", tier: "elevated" },
  { workflowId: "review-approval-item", action: "accept", command: "review-item", tier: "routine" },
  { workflowId: "review-approval-item", action: "decline", command: "review-item", tier: "routine" },
  { workflowId: "review-approval-item", action: "accept_edited", command: "review-item", tier: "elevated" },
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

/** Copy for elevated drawer descriptionHtml (task 3 wires into specs). */
export const ELEVATED_POLICY_EXPLAINER_HTML =
  "<p><b>Elevated policy path.</b> This action is not on the routine tier matrix. " +
  "You must enter a specific, auditable rationale — Dashboard boilerplate is not a substitute for " +
  "CLI/agent <code>policyApproval</code> on terminal <code>wk run</code>.</p>";
