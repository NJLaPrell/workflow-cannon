import {
  ELEVATED_POLICY_EXPLAINER_HTML,
  resolveDashboardPolicyTierRow,
  type PolicyUxTier
} from "./dashboard-policy-tier.js";

export type BuildDashboardPolicyApprovalInput = {
  channel: "dashboard";
  workflowId: string;
  action: string;
  command: string;
  taskId?: string | null;
  phaseKey?: string | null;
  /** Operator text from drawer; required for elevated tier when submitting. */
  humanRationale?: string | null;
};

export type PolicyApprovalPayload = { confirmed: true; rationale: string };

const CHANNEL = "dashboard";

function compactPart(key: string, value: string | undefined | null): string | null {
  const v = value != null ? String(value).trim() : "";
  return v.length > 0 ? `${key}=${v}` : null;
}

/** Structured rationale for kit policy traces (non-secret, bounded). */
export function formatDashboardPolicyRationale(parts: {
  workflowId: string;
  command: string;
  action: string;
  taskId?: string | null;
  phaseKey?: string | null;
  tier: PolicyUxTier;
}): string {
  const segments = [
    CHANNEL,
    compactPart("workflow", parts.workflowId),
    compactPart("command", parts.command),
    compactPart("action", parts.action),
    compactPart("tier", parts.tier),
    compactPart("taskId", parts.taskId ?? undefined),
    compactPart("phaseKey", parts.phaseKey ?? undefined)
  ].filter((s): s is string => s != null);
  return segments.join("|");
}

export function buildDashboardPolicyApproval(input: BuildDashboardPolicyApprovalInput): PolicyApprovalPayload {
  const row = resolveDashboardPolicyTierRow(input.workflowId, input.action);
  if (!row) {
    throw new Error(
      `Unknown dashboard policy path: workflowId=${input.workflowId} action=${input.action}. ` +
        "Extend DASHBOARD_POLICY_TIER_MATRIX before calling buildDashboardPolicyApproval."
    );
  }
  if (row.command !== input.command) {
    throw new Error(
      `Tier row command mismatch: matrix=${row.command} input=${input.command} ` +
        `(${input.workflowId}/${input.action})`
    );
  }
  const human = (input.humanRationale ?? "").trim();
  if (row.tier === "elevated") {
    if (!human) {
      throw new Error(
        `Elevated dashboard path ${input.workflowId}/${input.action} requires humanRationale. ` +
          `Explainer: ${ELEVATED_POLICY_EXPLAINER_HTML.replace(/<[^>]+>/g, " ").slice(0, 120)}…`
      );
    }
    const prefix = formatDashboardPolicyRationale({
      workflowId: input.workflowId,
      command: input.command,
      action: input.action,
      taskId: input.taskId,
      phaseKey: input.phaseKey,
      tier: row.tier
    });
    return { confirmed: true, rationale: `${prefix}|detail=${human}` };
  }
  return {
    confirmed: true,
    rationale: formatDashboardPolicyRationale({
      workflowId: input.workflowId,
      command: input.command,
      action: input.action,
      taskId: input.taskId,
      phaseKey: input.phaseKey,
      tier: row.tier
    })
  };
}
