import type * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  configMutationOutcomeToWebviewPayload,
  handleConfigMutationResult
} from "./config-mutation-result.js";
import { loadConfigKeyRows } from "./load-config-key-rows.js";
import { renderConfigListInnerHtml } from "./render-config.js";
import { renderExplainConfigHtml } from "./render-explain-config.js";

export async function pushConfigListToWebview(
  client: CommandClient,
  webview: vscode.Webview,
  includeAll: boolean
): Promise<void> {
  const { rows, errors } = await loadConfigKeyRows(client, { includeAll });
  const html = renderConfigListInnerHtml(rows);
  await webview.postMessage({
    type: "setList",
    html,
    error: errors.length ? errors.join("\n") : undefined,
    includeAll
  });
}

export async function handleConfigSetMessage(
  client: CommandClient,
  webview: vscode.Webview,
  key: string,
  value: string,
  scope: "project" | "user",
  includeAll: boolean
): Promise<void> {
  const r = await client.config(["set", "--scope", scope, key, value]);
  const { rows } = await loadConfigKeyRows(client, { includeAll });
  const row = rows.find((x) => x.key === key) ?? null;
  const outcome = handleConfigMutationResult(row, r, "set");
  if (outcome.statusKind === "ok") {
    await pushConfigListToWebview(client, webview, includeAll);
  }
  await webview.postMessage({
    type: "configMutationResult",
    payload: configMutationOutcomeToWebviewPayload(outcome, r.code)
  });
}

export async function handleConfigUnsetMessage(
  client: CommandClient,
  webview: vscode.Webview,
  key: string,
  scope: "project" | "user",
  includeAll: boolean
): Promise<void> {
  const r = await client.config(["unset", "--scope", scope, key]);
  const { rows } = await loadConfigKeyRows(client, { includeAll });
  const row = rows.find((x) => x.key === key) ?? null;
  const outcome = handleConfigMutationResult(row, r, "unset");
  if (outcome.statusKind === "ok") {
    await pushConfigListToWebview(client, webview, includeAll);
  }
  await webview.postMessage({
    type: "configMutationResult",
    payload: configMutationOutcomeToWebviewPayload(outcome, r.code)
  });
}

export async function handleConfigExplainMessage(
  client: CommandClient,
  webview: vscode.Webview,
  key: string
): Promise<void> {
  const r = await client.run("explain-config", { path: key.trim() });
  await webview.postMessage({
    type: "explainResult",
    html: renderExplainConfigHtml(r),
    payload: r
  });
}
