import { buildDashboardPolicyApproval, type PolicyApprovalPayload } from "./build-dashboard-policy-approval.js";
import { resolveDashboardPolicyTierRow, type PolicyUxTier } from "./dashboard-policy-tier.js";

export type DashboardPolicyPathRef = {
  workflowId: string;
  action: string;
  command: string;
};

export function policyUxTierForPath(workflowId: string, action: string): PolicyUxTier | undefined {
  return resolveDashboardPolicyTierRow(workflowId, action)?.tier;
}

export function isRoutineDashboardPolicyPath(workflowId: string, action: string): boolean {
  return policyUxTierForPath(workflowId, action) === "routine";
}

export function shouldCollectPolicyRationaleInDrawer(workflowId: string, action: string): boolean {
  const tier = policyUxTierForPath(workflowId, action);
  return tier === "elevated";
}

export function buildDashboardPolicyApprovalForPath(
  path: DashboardPolicyPathRef,
  context: { taskId?: string | null; phaseKey?: string | null; humanRationale?: string | null }
): PolicyApprovalPayload {
  return buildDashboardPolicyApproval({
    channel: "dashboard",
    workflowId: path.workflowId,
    action: path.action,
    command: path.command,
    taskId: context.taskId,
    phaseKey: context.phaseKey,
    humanRationale: context.humanRationale
  });
}
