import * as vscode from "vscode";
import type { CommandClient } from "./runtime/command-client.js";
import { expectedPlanningGenerationArgs, ingestPlanningMetaFromData } from "./planning-generation-cache.js";

/** Modal confirm + policy rationale, then `run-transition` with planning-generation args when required. */
export async function confirmAndRunTransition(
  client: CommandClient,
  onSuccess: () => void,
  taskId: string,
  action: string,
  /** Shown in the reject confirmation only, e.g. "this wishlist item". */
  rejectConfirmSubject?: string
): Promise<void> {
  const actionPhrase =
    action === "reject"
      ? `Decline and cancel ${rejectConfirmSubject ?? "this proposed task"} (reject → cancelled)`
      : `Apply transition '${action}'`;
  const ok = await vscode.window.showWarningMessage(`${actionPhrase} for ${taskId}?`, { modal: true }, "Apply");
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
    ingestPlanningMetaFromData(r.data);
    await vscode.window.showInformationMessage(r.message ?? "Transition OK");
    onSuccess();
  }
}

/** One shared rationale; sequential `accept` with refreshed `expectedPlanningGeneration` after each success. */
export async function confirmAndRunAcceptProposedPhaseBatch(
  client: CommandClient,
  onSuccess: () => void,
  taskIds: string[],
  categoryLabel: string
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `Accept ${String(taskIds.length)} proposed ${categoryLabel} task(s) (accept → ready)? Each runs run-transition with the same policy rationale.`,
    { modal: true },
    "Accept all"
  );
  if (ok !== "Accept all") {
    return;
  }
  const rationale =
    (await vscode.window.showInputBox({
      prompt: `Policy rationale for batch accept (${String(taskIds.length)} × accept on proposed ${categoryLabel})`,
      placeHolder: "Shown in policy trace / approval"
    })) ?? "vscode-extension batch accept";
  const failures: string[] = [];
  for (const taskId of taskIds) {
    const r = await client.run("run-transition", {
      taskId,
      action: "accept",
      policyApproval: { confirmed: true, rationale },
      ...expectedPlanningGenerationArgs()
    });
    if (!r.ok) {
      failures.push(`${taskId}: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 200)}`);
    } else {
      ingestPlanningMetaFromData(r.data);
    }
  }
  if (failures.length > 0) {
    await vscode.window.showErrorMessage(
      `Some accepts failed (${String(failures.length)}/${String(taskIds.length)}): ${failures.slice(0, 3).join(" · ")}`
    );
  } else {
    await vscode.window.showInformationMessage(`Accepted ${String(taskIds.length)} proposed ${categoryLabel} task(s).`);
  }
  onSuccess();
}
