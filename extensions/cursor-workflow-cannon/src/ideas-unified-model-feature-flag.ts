import * as vscode from "vscode";

export const IDEAS_UNIFIED_MODEL_ENV_VAR = "IDEAS_UNIFIED_MODEL_ENABLED";

function parseTruthyEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off" || normalized === "") {
    return false;
  }
  return undefined;
}

/**
 * Dashboard feature flag: unified IdeaPlan UI (Brainstorm button, brainstorming rollup).
 * Precedence: explicit VS Code workspace/global setting → env kill-switch → default true.
 */
export function isIdeasUnifiedModelEnabledForDashboard(): boolean {
  const inspected = vscode.workspace
    .getConfiguration("workflowCannon.ideas")
    .inspect<boolean>("unifiedModelEnabled");
  const configured = inspected?.workspaceValue ?? inspected?.globalValue;
  if (typeof configured === "boolean") {
    return configured;
  }
  const fromEnv = parseTruthyEnv(process.env[IDEAS_UNIFIED_MODEL_ENV_VAR]);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return true;
}
