import * as vscode from "vscode";
import type { CommandClient } from "./runtime/command-client.js";
import { ingestPlanningMetaFromData, expectedPlanningGenerationArgs } from "./planning-generation-cache.js";

const WISHLIST_FIELD_SPECS: readonly { key: string; prompt: string; placeHolder: string }[] = [
  { key: "title", prompt: "Short label", placeHolder: "e.g. Faster cold start" },
  { key: "problemStatement", prompt: "What problem or gap this addresses", placeHolder: "Problem / gap" },
  { key: "expectedOutcome", prompt: "What done looks like", placeHolder: "Expected outcome" },
  { key: "impact", prompt: "Why it matters", placeHolder: "Impact" },
  { key: "constraints", prompt: "Hard limits (time, compatibility, policy)", placeHolder: "Constraints" },
  { key: "successSignals", prompt: "Observable signals of success", placeHolder: "Success signals" },
  { key: "requestor", prompt: "Who is asking / accountable", placeHolder: "Team or handle" },
  { key: "evidenceRef", prompt: "Link or pointer to supporting context", placeHolder: "Issue URL, doc path, …" }
] as const;

/**
 * Prompts for create-wishlist fields, refreshes planning-generation cache, runs create-wishlist.
 * Laugh all you want — eight boxes beats hand-editing SQLite.
 */
export async function promptAndCreateWishlist(client: CommandClient): Promise<void> {
  const warm = await client.run("dashboard-summary", {});
  if (warm.ok && warm.data && typeof warm.data === "object") {
    ingestPlanningMetaFromData(warm.data as Record<string, unknown>);
  }

  const payload: Record<string, unknown> = {};
  for (const f of WISHLIST_FIELD_SPECS) {
    const value = await vscode.window.showInputBox({
      title: "Add wishlist item",
      prompt: f.prompt,
      placeHolder: f.placeHolder,
      ignoreFocusOut: true
    });
    if (value === undefined) {
      return;
    }
    const t = value.trim();
    if (!t) {
      void vscode.window.showWarningMessage("Wishlist create cancelled (empty field).");
      return;
    }
    payload[f.key] = t;
  }

  Object.assign(payload, expectedPlanningGenerationArgs());

  let r = await client.run("create-wishlist", payload);
  if (!r.ok && r.code === "planning-generation-mismatch") {
    const again = await client.run("dashboard-summary", {});
    if (again.ok && again.data && typeof again.data === "object") {
      ingestPlanningMetaFromData(again.data as Record<string, unknown>);
    }
    const retryPayload = { ...payload, ...expectedPlanningGenerationArgs() };
    r = await client.run("create-wishlist", retryPayload);
  }

  if (r.ok) {
    const tid = typeof r.data?.taskId === "string" ? r.data.taskId : "";
    void vscode.window.showInformationMessage(
      tid ? `Wishlist intake created (${tid}).` : "Wishlist intake created."
    );
  } else {
    const hint =
      r.code === "planning-generation-mismatch" || r.code === "planning-generation-required"
        ? " Try Refresh on the dashboard, then run again."
        : "";
    void vscode.window.showErrorMessage((r.message ?? String(r.code ?? "create-wishlist failed")) + hint);
  }
}
