import { parsePolicyApprovalFromEnv } from "../core/policy.js";

export type InitApprovalResolution =
  | { ok: true; rationale: string; source: "env" | "flags" }
  | { ok: false; reason: "cancelled" | "missing-approval" };

/**
 * Resolve approval for mutating `wk init` (env lane or non-interactive flags). Interactive prompts live in init-command.
 */
export function resolveInitApprovalFromEnvAndFlags(options: {
  yes: boolean;
  approvalRationale?: string;
}): InitApprovalResolution {
  const env = parsePolicyApprovalFromEnv(process.env);
  if (env?.confirmed && env.rationale.trim()) {
    return { ok: true, rationale: env.rationale, source: "env" };
  }
  if (options.yes && options.approvalRationale && options.approvalRationale.trim()) {
    return { ok: true, rationale: options.approvalRationale.trim(), source: "flags" };
  }
  return { ok: false, reason: "missing-approval" };
}
