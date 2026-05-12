import * as vscode from "vscode";
import type { CommandClient } from "./runtime/command-client.js";
import { ingestPlanningMetaFromData, expectedPlanningGenerationArgs } from "./planning-generation-cache.js";

/**
 * Runs `create-wishlist` after the eight required string fields are collected (e.g. from the Dashboard drawer).
 * Warms planning generation, retries once on mismatch, then toasts success or surfaces errors.
 */
export async function executeCreateWishlistFromValidatedFields(
  client: CommandClient,
  fields: Record<string, string>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const warm = await client.run("dashboard-summary", {});
  if (warm.ok && warm.data && typeof warm.data === "object") {
    ingestPlanningMetaFromData(warm.data as Record<string, unknown>);
  }

  const payload: Record<string, unknown> = { ...fields, ...expectedPlanningGenerationArgs() };

  let r = await client.run("create-wishlist", payload);
  if (!r.ok && r.code === "planning-generation-mismatch") {
    const again = await client.run("dashboard-summary", {});
    if (again.ok && again.data && typeof again.data === "object") {
      ingestPlanningMetaFromData(again.data as Record<string, unknown>);
    }
    const retryPayload = { ...fields, ...expectedPlanningGenerationArgs() };
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
    return { ok: true };
  }

  const hint =
    r.code === "planning-generation-mismatch" || r.code === "planning-generation-required"
      ? " Try Refresh on the dashboard, then run again."
      : "";
  return { ok: false, error: (r.message ?? String(r.code ?? "create-wishlist failed")) + hint };
}
