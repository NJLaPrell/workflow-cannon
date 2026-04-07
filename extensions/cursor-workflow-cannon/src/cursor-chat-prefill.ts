import * as vscode from "vscode";

/** Same handler Cursor's `cursor://anysphere.cursor-deeplink/prompt?text=…` deeplink uses internally. */
const CURSOR_DEEPLINK_PROMPT_PREFILL = "deeplink.prompt.prefill";
const CURSOR_PROMPT_DEEPLINK = "cursor://anysphere.cursor-deeplink/prompt";

/** Cursor-internal IDs vary by build; first match wins. */
const NEW_AGENT_CHAT_COMMAND_IDS = [
  "composer.newAgentChat",
  "workbench.action.composer.newAgentChat",
  "cursor.composer.newAgentChat"
] as const;

export type PrefillCursorChatOptions = {
  /**
   * Best-effort: open a fresh Agent/Composer chat before prefilling (Cursor only).
   * Unknown command IDs are ignored so VS Code / older Cursor still get prefill-only behavior.
   */
  newChat?: boolean;
};

async function tryOpenNewAgentChat(): Promise<void> {
  for (const id of NEW_AGENT_CHAT_COMMAND_IDS) {
    try {
      await vscode.commands.executeCommand(id);
      // Let the new session take focus before prefill (avoids racing the previous composer).
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
      return;
    } catch {
      // Command not registered in this host — try next candidate.
    }
  }
}

/**
 * Prefills the Cursor AI chat input (Composer) with `text`, using Cursor's deeplink pipeline.
 * Falls back to opening the deeplink URI, then clipboard + toast if needed.
 */
export async function prefillCursorChat(
  text: string,
  options?: PrefillCursorChatOptions
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    void vscode.window.showWarningMessage("Workflow Cannon: prompt text is empty.");
    return;
  }

  if (options?.newChat) {
    await tryOpenNewAgentChat();
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
