import * as vscode from "vscode";

/** Same handler Cursor's `cursor://anysphere.cursor-deeplink/prompt?text=…` deeplink uses internally. */
const CURSOR_DEEPLINK_PROMPT_PREFILL = "deeplink.prompt.prefill";
const CURSOR_PROMPT_DEEPLINK = "cursor://anysphere.cursor-deeplink/prompt";

/**
 * Prefills the Cursor AI chat input (Composer) with `text`, using Cursor's deeplink pipeline.
 * Falls back to opening the deeplink URI, then clipboard + toast if needed.
 */
export async function prefillCursorChat(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    void vscode.window.showWarningMessage("Workflow Cannon: prompt text is empty.");
    return;
  }

  try {
    await vscode.commands.executeCommand(CURSOR_DEEPLINK_PROMPT_PREFILL, { text: trimmed });
    return;
  } catch {
    // Command missing (non-Cursor) or internal failure — try URI handler
  }

  try {
    const uri = vscode.Uri.parse(
      `${CURSOR_PROMPT_DEEPLINK}?text=${encodeURIComponent(trimmed)}`
    );
    const opened = await vscode.env.openExternal(uri);
    if (opened) {
      return;
    }
  } catch {
    // Last resort below
  }

  await vscode.env.clipboard.writeText(trimmed);
  void vscode.window.showWarningMessage(
    "Workflow Cannon: could not open Cursor chat prefill. Prompt copied to clipboard — paste into chat."
  );
}
