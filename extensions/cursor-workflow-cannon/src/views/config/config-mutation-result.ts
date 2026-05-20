import { escapeHtml } from "../dashboard/render-dashboard.js";
import type { ConfigKeyRowInput } from "./render-config.js";

export type ConfigCliResult = { code: number; stdout: string; stderr: string };

export type ConfigMutationOutcome = {
  statusKind: "ok" | "err" | "warn";
  statusText: string;
  restartHint?: { key: string; label: string };
};

/** Map config CLI failures to operator-readable status (policy, approval, generic). */
export function formatConfigMutationError(text: string, exitCode: number): string {
  const blob = (text || "").trim();
  const lower = blob.toLowerCase();
  if (
    lower.includes("policy-denied") ||
    lower.includes("policy approval") ||
    lower.includes("policyapproval") ||
    lower.includes("workspace_kit_policy_approval")
  ) {
    return (
      "Config change blocked by kit policy.\n\n" +
      "Set WORKSPACE_KIT_POLICY_APPROVAL in the environment for the kit process, or use JSON policyApproval on workspace-kit run (chat alone is not approval).\n\n" +
      "See .ai/POLICY-APPROVAL.md in the repo.\n\n" +
      (blob ? `CLI (exit ${exitCode}):\n${blob.slice(0, 600)}` : `Exit code ${exitCode}.`)
    );
  }
  if (lower.includes("requires approval") || lower.includes("requiresrestart")) {
    return (
      "This key needs maintainer approval before it can be saved.\n\n" +
      (blob ? `CLI (exit ${exitCode}):\n${blob.slice(0, 600)}` : `Exit code ${exitCode}.`)
    );
  }
  return blob ? `Config command failed (exit ${exitCode}):\n${blob.slice(0, 800)}` : `Config command failed (exit ${exitCode}).`;
}

export function renderConfigRestartBannerHtml(key: string): string {
  return (
    '<div class="cfg-restart-banner" role="status">' +
    `<p><b>Restart may be required</b> after changing <code>${escapeHtml(key)}</code>.</p>` +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="config-reload-window">Reload Window</button>' +
    '<span class="cfg-muted"> Or reload the VS Code window when convenient.</span>' +
    "</div>"
  );
}

/** Shared post-set/unset handling for sidebar Config and dashboard Config tab hosts. */
export function handleConfigMutationResult(
  row: ConfigKeyRowInput | null,
  result: ConfigCliResult,
  mutation: "set" | "unset"
): ConfigMutationOutcome {
  const raw = (result.stdout + (result.stderr ? "\n" + result.stderr : "")).trim();
  if (result.code !== 0) {
    return {
      statusKind: "err",
      statusText: formatConfigMutationError(raw, result.code)
    };
  }
  const keyLabel = row?.key ?? "config key";
  let statusText =
    mutation === "set"
      ? `Saved ${keyLabel} on the selected layer.`
      : `Unset ${keyLabel} on the selected layer.`;
  const outcome: ConfigMutationOutcome = { statusKind: "ok", statusText };
  if (row?.requiresRestart) {
    outcome.restartHint = { key: row.key, label: keyLabel };
    statusText += " This key may require a window reload before it takes full effect.";
    outcome.statusText = statusText;
  }
  return outcome;
}

export function configMutationOutcomeToWebviewPayload(
  outcome: ConfigMutationOutcome,
  exitCode: number
): {
  code: number;
  statusKind: string;
  statusText: string;
  restartBannerHtml?: string;
  restartHint?: { key: string; label: string };
} {
  return {
    code: exitCode,
    statusKind: outcome.statusKind,
    statusText: outcome.statusText,
    restartHint: outcome.restartHint,
    restartBannerHtml: outcome.restartHint
      ? renderConfigRestartBannerHtml(outcome.restartHint.key)
      : undefined
  };
}
