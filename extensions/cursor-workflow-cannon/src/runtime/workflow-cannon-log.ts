import * as vscode from "vscode";
import { formatKitRunEndLine, formatKitRunStartLine } from "./kit-run-log-format.js";

let output: vscode.OutputChannel | undefined;

/** Extra webview / scheduling detail (`WORKSPACE_KIT_DEBUG_DASHBOARD=1`). */
export function isWcTraceVerbose(): boolean {
  return process.env.WORKSPACE_KIT_DEBUG_DASHBOARD === "1";
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/** Primary operator trace — View → Output → Workflow Cannon (not mirrored to Extension Host). */
export function logWc(scope: string, message: string): void {
  if (!output) {
    output = vscode.window.createOutputChannel("Workflow Cannon");
  }
  output.appendLine(`${timestamp()} [${scope}] ${message}`);
}

export function logWcKitRunStart(commandName: string, args: Record<string, unknown>): number {
  logWc("wk", formatKitRunStartLine(commandName, args));
  return Date.now();
}

export function logWcKitRunEnd(
  commandName: string,
  startedAt: number,
  result: { ok: boolean; code?: string; message?: string }
): void {
  logWc("wk", formatKitRunEndLine(commandName, startedAt, result));
}

/** Wire into `CommandClient` from extension activate. */
export function kitRunTraceHooks(): {
  onKitRunStart: typeof logWcKitRunStart;
  onKitRunEnd: typeof logWcKitRunEnd;
  onKitRunNotice: (message: string) => void;
} {
  return {
    onKitRunStart: logWcKitRunStart,
    onKitRunEnd: logWcKitRunEnd,
    onKitRunNotice: (message) => logWc("wk", message)
  };
}

export { summarizeKitRunArgs } from "./kit-run-log-format.js";
