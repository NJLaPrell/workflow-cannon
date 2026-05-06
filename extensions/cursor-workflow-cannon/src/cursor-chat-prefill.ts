import * as vscode from "vscode";

/** Same handler Cursor's `cursor://anysphere.cursor-deeplink/prompt?text=…` deeplink uses internally. */
const CURSOR_DEEPLINK_PROMPT_PREFILL = "deeplink.prompt.prefill";
const CURSOR_PROMPT_DEEPLINK = "cursor://anysphere.cursor-deeplink/prompt";
const VSCODE_CHAT_OPEN = "workbench.action.chat.open";
const VSCODE_NEW_CHAT = "workbench.action.chat.newChat";

/** Cursor-internal IDs vary by build; first match wins. */
const NEW_AGENT_CHAT_COMMAND_IDS = [
  "composer.newAgentChat",
  "workbench.action.composer.newAgentChat",
  "cursor.composer.newAgentChat"
] as const;

export type EditorIdeKind = "cursor" | "vscode" | "other";
export type ChatPrefillRoute =
  | "cursor-command"
  | "vscode-chat-command"
  | "cursor-external-deeplink"
  | "clipboard";

export type EditorIntegrationState = {
  schemaVersion: 1;
  appName: string;
  uriScheme: string;
  ideKind: EditorIdeKind;
  chatPrefill: {
    route: ChatPrefillRoute;
    label: string;
    canPrefillDirectly: boolean;
    externalCursorDeeplink: boolean;
    commands: {
      cursorPrefill: boolean;
      cursorNewChat: boolean;
      vscodeChatOpen: boolean;
      vscodeNewChat: boolean;
    };
  };
};

export type PrefillCursorChatOptions = {
  /**
   * Best-effort: open a fresh Agent/Composer chat before prefilling (Cursor only).
   * Unknown command IDs are ignored so VS Code / older Cursor still get prefill-only behavior.
   */
  newChat?: boolean;
};

function detectIdeKind(appName: string, uriScheme: string): EditorIdeKind {
  if (uriScheme === "cursor" || appName.toLowerCase().includes("cursor")) {
    return "cursor";
  }
  if (uriScheme === "vscode" || appName.toLowerCase().includes("visual studio code")) {
    return "vscode";
  }
  return "other";
}

async function getAvailableCommandIds(): Promise<ReadonlySet<string>> {
  try {
    return new Set(await vscode.commands.getCommands(true));
  } catch {
    return new Set();
  }
}

function chooseChatPrefillRoute(args: {
  cursorPrefill: boolean;
  vscodeChatOpen: boolean;
  canUseCursorExternalDeeplink: boolean;
}): { route: ChatPrefillRoute; label: string; canPrefillDirectly: boolean } {
  if (args.cursorPrefill) {
    return { route: "cursor-command", label: "Cursor Composer", canPrefillDirectly: true };
  }
  if (args.canUseCursorExternalDeeplink) {
    return {
      route: "cursor-external-deeplink",
      label: "Cursor external deeplink",
      canPrefillDirectly: true
    };
  }
  if (args.vscodeChatOpen) {
    return { route: "vscode-chat-command", label: "VS Code Chat", canPrefillDirectly: true };
  }
  return { route: "clipboard", label: "Clipboard fallback", canPrefillDirectly: false };
}

function buildEditorIntegrationState(commandIds: ReadonlySet<string>): EditorIntegrationState {
  const appName = vscode.env.appName;
  const uriScheme = vscode.env.uriScheme;
  const cursorPrefill = commandIds.has(CURSOR_DEEPLINK_PROMPT_PREFILL);
  const cursorNewChat = NEW_AGENT_CHAT_COMMAND_IDS.some((id) => commandIds.has(id));
  const vscodeChatOpen = commandIds.has(VSCODE_CHAT_OPEN);
  const vscodeNewChat = commandIds.has(VSCODE_NEW_CHAT);
  const externalCursorDeeplink = uriScheme === "cursor";
  const route = chooseChatPrefillRoute({
    cursorPrefill,
    vscodeChatOpen,
    canUseCursorExternalDeeplink: externalCursorDeeplink
  });
  return {
    schemaVersion: 1,
    appName,
    uriScheme,
    ideKind: detectIdeKind(appName, uriScheme),
    chatPrefill: {
      ...route,
      externalCursorDeeplink,
      commands: {
        cursorPrefill,
        cursorNewChat,
        vscodeChatOpen,
        vscodeNewChat
      }
    }
  };
}

export async function resolveEditorIntegrationState(): Promise<EditorIntegrationState> {
  return buildEditorIntegrationState(await getAvailableCommandIds());
}

async function tryOpenNewAgentChat(commandIds: ReadonlySet<string>): Promise<void> {
  for (const id of NEW_AGENT_CHAT_COMMAND_IDS) {
    if (!commandIds.has(id)) {
      continue;
    }
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

async function tryPrefillVsCodeChat(
  text: string,
  commandIds: ReadonlySet<string>,
  options?: PrefillCursorChatOptions
): Promise<boolean> {
  if (options?.newChat) {
    if (commandIds.has(VSCODE_NEW_CHAT)) {
      try {
        await vscode.commands.executeCommand(VSCODE_NEW_CHAT);
        await new Promise<void>((resolve) => setTimeout(resolve, 75));
      } catch {
        // Command registration is necessary but not a guarantee the host can open a new chat.
      }
    }
  }

  if (!commandIds.has(VSCODE_CHAT_OPEN)) {
    return false;
  }

  try {
    await vscode.commands.executeCommand(VSCODE_CHAT_OPEN, {
      query: text,
      isPartialQuery: true
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefills an AI chat input with `text`, preferring Cursor's deeplink pipeline.
 * Falls back to VS Code chat prefill or clipboard + toast when Cursor is unavailable.
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

  const commandIds = await getAvailableCommandIds();
  const integration = buildEditorIntegrationState(commandIds);

  if (options?.newChat) {
    await tryOpenNewAgentChat(commandIds);
  }

  if (integration.chatPrefill.commands.cursorPrefill) {
    try {
      await vscode.commands.executeCommand(CURSOR_DEEPLINK_PROMPT_PREFILL, { text: trimmed });
      return;
    } catch {
      // Registered commands can still fail; fall through to the next detected route.
    }
  }

  const canUseCursorDeeplink = integration.chatPrefill.externalCursorDeeplink;
  if (!canUseCursorDeeplink && (await tryPrefillVsCodeChat(trimmed, commandIds, options))) {
    return;
  }

  if (!canUseCursorDeeplink) {
    await vscode.env.clipboard.writeText(trimmed);
    void vscode.window.showWarningMessage(
      "Workflow Cannon: could not prefill chat. Prompt copied to clipboard — paste into chat."
    );
    return;
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
