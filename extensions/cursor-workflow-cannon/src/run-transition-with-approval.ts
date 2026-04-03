import * as vscode from "vscode";
import type { CommandClient } from "./runtime/command-client.js";
import { expectedPlanningGenerationArgs } from "./planning-generation-cache.js";

/** Modal confirm + policy rationale, then `run-transition` with planning-generation args when required. */
export async function confirmAndRunTransition(
  client: CommandClient,
  onSuccess: () => void,
  taskId: string,
  action: string
): Promise<void> {
  const ok = await vscode.window.showWarningMessage(
    `Apply transition '${action}' to ${taskId}?`,
    { modal: true },
    "Apply"
  );
  if (ok !== "Apply") {
    return;
  }
  const rationale =
    (await vscode.window.showInputBox({
      prompt: `Policy rationale for run-transition: ${action} on ${taskId}`,
      placeHolder: "Shown in policy trace / approval"
    })) ?? "vscode-extension";
  const r = await client.run("run-transition", {
    taskId,
    action,
    policyApproval: { confirmed: true, rationale },
    ...expectedPlanningGenerationArgs()
  });
  if (!r.ok) {
    await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
  } else {
    await vscode.window.showInformationMessage(r.message ?? "Transition OK");
    onSuccess();
  }
}
