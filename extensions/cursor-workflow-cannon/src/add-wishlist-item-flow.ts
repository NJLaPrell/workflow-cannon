import * as vscode from "vscode";
import type { CommandClient } from "./runtime/command-client.js";

const INTAKE_FIELDS: { argKey: string; prompt: string }[] = [
  { argKey: "title", prompt: "Wishlist title (short label)" },
  { argKey: "problemStatement", prompt: "Problem / gap this addresses" },
  { argKey: "expectedOutcome", prompt: 'Expected outcome (what "done" looks like)' },
  { argKey: "impact", prompt: "Impact (why it matters)" },
  { argKey: "constraints", prompt: "Constraints (hard limits)" },
  { argKey: "successSignals", prompt: "Success signals (observable)" },
  { argKey: "requestor", prompt: "Requestor (accountable for intake)" },
  { argKey: "evidenceRef", prompt: "Evidence ref (link or pointer)" }
];

/** Prompt for `create-wishlist` required fields, then run workspace-kit. */
export async function promptAndCreateWishlist(client: CommandClient): Promise<void> {
  const payload: Record<string, string> = {};
  for (const f of INTAKE_FIELDS) {
    const v = await vscode.window.showInputBox({
      title: "New wishlist item",
      prompt: f.prompt,
      ignoreFocusOut: true
    });
    if (v === undefined) {
      return;
    }
    const t = v.trim();
    if (!t) {
      void vscode.window.showWarningMessage(`${f.argKey} is required — cancelled.`);
      return;
    }
    payload[f.argKey] = t;
  }

  const r = await client.run("create-wishlist", payload);
  if (!r.ok) {
    void vscode.window.showErrorMessage(r.message ?? "create-wishlist failed");
    return;
  }
  const id =
    typeof r.data?.taskId === "string"
      ? r.data.taskId
      : typeof r.data?.id === "string"
        ? r.data.id
        : "created";
  void vscode.window.showInformationMessage(`Wishlist intake task ${id} created.`);
}
