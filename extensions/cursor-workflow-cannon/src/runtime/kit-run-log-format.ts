/** Pure helpers for kit run trace lines (no vscode import — safe for unit tests). */

export function summarizeKitRunArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  const taskId = args.taskId;
  if (typeof taskId === "string" && taskId.trim()) {
    parts.push(`taskId=${taskId.trim()}`);
  }
  const action = args.action;
  if (typeof action === "string" && action.trim()) {
    parts.push(`action=${action.trim()}`);
  }
  const phaseKey = args.phaseKey;
  if (typeof phaseKey === "string" && phaseKey.trim()) {
    parts.push(`phaseKey=${phaseKey.trim()}`);
  }
  const noteId = args.noteId;
  if (typeof noteId === "string" && noteId.trim()) {
    parts.push(`noteId=${noteId.trim()}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function formatKitRunStartLine(commandName: string, args: Record<string, unknown>): string {
  return `→ run ${commandName}${summarizeKitRunArgs(args)}`;
}

export function formatKitRunEndLine(
  commandName: string,
  startedAt: number,
  result: { ok: boolean; code?: string; message?: string }
): string {
  const ms = Date.now() - startedAt;
  if (result.ok) {
    return `← run ${commandName} ${ms}ms ok`;
  }
  const code = result.code ?? "unknown";
  const detail = result.message ? ` — ${String(result.message).slice(0, 160)}` : "";
  return `← run ${commandName} ${ms}ms FAIL ${code}${detail}`;
}
