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
      void vscode.window.showInformationMessage("Add wishlist item cancelled (closed prompt).");
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
    const data = r.data as Record<string, unknown> | undefined;
    const itemRaw = data?.item ?? data?.wishlist;
    const item = itemRaw && typeof itemRaw === "object" && itemRaw !== null ? (itemRaw as Record<string, unknown>) : null;
    const wishlistId = item && typeof item.id === "string" ? item.id.trim() : "";
    const title = item && typeof item.title === "string" ? item.title.trim() : "";
    const tid = typeof data?.taskId === "string" ? data.taskId.trim() : "";
    const summary =
      wishlistId && title.length > 0
        ? `Wishlist saved as ${wishlistId}: ${title.slice(0, 100)}${title.length > 100 ? "…" : ""}`
        : wishlistId
          ? `Wishlist saved as ${wishlistId}` + (tid ? ` (intake task ${tid})` : "")
          : tid
            ? `Wishlist intake task created (${tid}). Open Wishlist or refresh the dashboard to see it.`
            : "Wishlist intake created.";
    const pick = await vscode.window.showInformationMessage(summary, "Open wishlist detail", "Dismiss");
    if (pick === "Open wishlist detail") {
      const openId = wishlistId || tid;
      if (openId.length > 0) {
        await vscode.commands.executeCommand("workflowCannon.wishlist.showDetail", openId);
      }
    }
  } else {
    const hint =
      r.code === "planning-generation-mismatch" || r.code === "planning-generation-required"
        ? " Try Refresh on the dashboard, then run again."
        : "";
    void vscode.window.showErrorMessage((r.message ?? String(r.code ?? "create-wishlist failed")) + hint);
  }
}
