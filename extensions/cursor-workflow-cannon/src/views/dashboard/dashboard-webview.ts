/**
 * Browser entry — bundled to media/dashboard-webview.js (not compiled by root tsc).
 */
import { renderDashboardRootInnerHtml } from "./render-dashboard.js";

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

function main(): void {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");
  const btn = document.getElementById("btn");
  const validate = document.getElementById("validate");
  const tasks = document.getElementById("tasks");
  const config = document.getElementById("config");

  if (!root || !btn || !validate || !tasks || !config) {
    document.body.innerHTML =
      "<p class=\"bad\">Workflow Cannon dashboard: missing DOM nodes (root or buttons).</p>";
    return;
  }

  btn.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
  validate.addEventListener("click", () => vscode.postMessage({ type: "validateConfig" }));
  tasks.addEventListener("click", () => vscode.postMessage({ type: "openTasks" }));
  config.addEventListener("click", () => vscode.postMessage({ type: "openConfig" }));

  window.addEventListener("message", (ev: MessageEvent) => {
    const msg = ev.data as { type?: string; payload?: unknown };
    if (msg?.type !== "dashboard") {
      return;
    }
    try {
      root.innerHTML = renderDashboardRootInnerHtml(msg.payload);
    } catch (err) {
      root.innerHTML =
        '<pre class="bad">Dashboard render error: ' +
        String(err).replace(/&/g, "&amp;").replace(/</g, "&lt;") +
        "</pre>";
    }
  });

  vscode.postMessage({ type: "dashboard-ready" });
}

main();
