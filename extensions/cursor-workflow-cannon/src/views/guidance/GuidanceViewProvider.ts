import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  renderGuidanceActionResultInnerHtml,
  renderGuidancePreviewInnerHtml,
  renderGuidanceSummaryInnerHtml,
  renderGuidanceTraceDetailInnerHtml
} from "./render-guidance.js";

type TaskChoice = {
  id: string;
  title: string;
  status: string;
  phase?: string;
};

type WorkflowChoice = {
  name: string;
  moduleId: string;
  description: string;
  curated: boolean;
};

const CURATED_WORKFLOW_NAMES = new Set([
  "get-next-actions",
  "list-tasks",
  "dashboard-summary",
  "queue-health",
  "run-transition",
  "cae-dashboard-summary",
  "cae-guidance-preview",
  "cae-recent-traces",
  "cae-explain",
  "generate-document",
  "document-project"
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function taskChoicesFromPayload(payload: unknown): TaskChoice[] {
  const data = asRecord(asRecord(payload).data);
  const tasks = Array.isArray(data.tasks) ? data.tasks : Array.isArray(data.readyQueue) ? data.readyQueue : [];
  const choices: TaskChoice[] = [];
  for (const raw of tasks) {
    const task = asRecord(raw);
    const id = typeof task.id === "string" ? task.id : "";
    if (!id) continue;
    choices.push({
      id,
      title: typeof task.title === "string" ? task.title : "",
      status: typeof task.status === "string" ? task.status : "",
      phase: typeof task.phase === "string" ? task.phase : undefined
    });
  }
  return choices;
}

function workflowChoiceFromManifestEntry(raw: unknown): WorkflowChoice | null {
  const entry = asRecord(raw);
  const name = typeof entry.name === "string" ? entry.name : "";
  if (!name) return null;
  return {
    name,
    moduleId: typeof entry.moduleId === "string" ? entry.moduleId : "",
    description: typeof entry.description === "string" ? entry.description : "",
    curated: CURATED_WORKFLOW_NAMES.has(name)
  };
}

export class GuidanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.guidance";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>
  ) {
    onKitStateChanged(() => {
      void this.notifyRefresh();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webview.html = this.buildHtmlShell(webview);
    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "load") {
        await this.pushSummary(webview);
      }
      if (msg?.type === "preview") {
        const commandName = typeof msg.commandName === "string" ? msg.commandName.trim() : "";
        const taskId = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        const moduleId = typeof msg.moduleId === "string" ? msg.moduleId.trim() : "";
        const argvSummary = typeof msg.argvSummary === "string" ? msg.argvSummary.trim() : "";
        const commandArgs =
          msg.commandArgs && typeof msg.commandArgs === "object" && !Array.isArray(msg.commandArgs)
            ? (msg.commandArgs as Record<string, unknown>)
            : undefined;
        const evalMode = msg.evalMode === "live" ? "live" : "shadow";
        const args: Record<string, unknown> = {
          schemaVersion: 1,
          commandName,
          evalMode
        };
        if (taskId) args.taskId = taskId;
        if (moduleId) args.moduleId = moduleId;
        if (commandArgs) args.commandArgs = commandArgs;
        if (argvSummary) args.argvSummary = argvSummary;
        const r = commandName
          ? await this.client.run("cae-guidance-preview", args)
          : { ok: false, code: "invalid-args", message: "Command or workflow is required." };
        await webview.postMessage({ type: "setPreview", html: renderGuidancePreviewInnerHtml(r) });
      }
      if (msg?.type === "explain" && typeof msg.traceId === "string") {
        const traceId = msg.traceId.trim();
        const r = await this.client.run("cae-explain", {
          schemaVersion: 1,
          traceId,
          level: "summary"
        });
        const traceFetch = await this.client.run("cae-get-trace", { schemaVersion: 1, traceId });
        await webview.postMessage({
          type: "setTraceDetail",
          html: renderGuidanceTraceDetailInnerHtml({ explain: r, traceFetch })
        });
      }
      if (msg?.type === "ack") {
        await this.recordAck(webview, msg);
      }
      if (msg?.type === "feedback") {
        await this.recordFeedback(webview, msg);
      }
    });
  }

  refresh(): void {
    if (this.view) {
      void this.pushSummary(this.view.webview);
    }
  }

  private async pushSummary(webview: vscode.Webview): Promise<void> {
    const r = await this.client.run("cae-dashboard-summary", { schemaVersion: 1 });
    await webview.postMessage({ type: "setSummary", html: renderGuidanceSummaryInnerHtml(r) });
    await this.pushChoices(webview);
  }

  private async pushChoices(webview: vscode.Webview): Promise<void> {
    const [nextActions, inProgress, workflows] = await Promise.all([
      this.client.run("get-next-actions", {}),
      this.client.run("list-tasks", { status: "in_progress" }),
      this.loadWorkflowChoices()
    ]);
    const byId = new Map<string, TaskChoice>();
    for (const task of [...taskChoicesFromPayload(nextActions), ...taskChoicesFromPayload(inProgress)]) {
      byId.set(task.id, task);
    }
    await webview.postMessage({
      type: "setChoices",
      tasks: [...byId.values()].slice(0, 50),
      workflows
    });
  }

  private async loadWorkflowChoices(): Promise<WorkflowChoice[]> {
    const manifestPath = path.join(
      this.client.getWorkspaceRoot(),
      "src",
      "contracts",
      "builtin-run-command-manifest.json"
    );
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw) as unknown;
      const byName = new Map<string, WorkflowChoice>();
      if (Array.isArray(manifest)) {
        for (const entry of manifest) {
          const choice = workflowChoiceFromManifestEntry(entry);
          if (choice) byName.set(choice.name, choice);
        }
      }
      for (const name of CURATED_WORKFLOW_NAMES) {
        if (!byName.has(name)) {
          byName.set(name, { name, moduleId: "", description: "Common workflow", curated: true });
        }
      }
      return [...byName.values()].sort((a, b) => {
        if (a.curated !== b.curated) return a.curated ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [...CURATED_WORKFLOW_NAMES].map((name) => ({
        name,
        moduleId: "",
        description: "Common workflow",
        curated: true
      }));
    }
  }

  private async notifyRefresh(): Promise<void> {
    if (this.view) {
      await this.view.webview.postMessage({ type: "poke" });
    }
  }

  private async recordAck(webview: vscode.Webview, msg: Record<string, unknown>): Promise<void> {
    const traceId = typeof msg.traceId === "string" ? msg.traceId.trim() : "";
    const activationId = typeof msg.activationId === "string" ? msg.activationId.trim() : "";
    const ackToken = typeof msg.ackToken === "string" ? msg.ackToken.trim() : "";
    if (!traceId || !activationId || !ackToken) return;
    const confirmed = await vscode.window.showWarningMessage(
      "Record Guidance acknowledgement? This means “I read this guidance”; it is not policy approval for another sensitive command.",
      { modal: true },
      "Record acknowledgement"
    );
    if (confirmed !== "Record acknowledgement") return;
    const actor = (await this.resolveActionActor("Actor for acknowledgement")) ?? "dashboard";
    const r = await this.client.run("cae-satisfy-ack", {
      schemaVersion: 1,
      traceId,
      activationId,
      ackToken,
      actor,
      policyApproval: {
        confirmed: true,
        rationale: "Guidance tab acknowledgement confirmation"
      }
    });
    await webview.postMessage({
      type: "setActionResult",
      html: renderGuidanceActionResultInnerHtml({ action: "Acknowledgement", result: r })
    });
    await this.pushSummary(webview);
  }

  private async recordFeedback(webview: vscode.Webview, msg: Record<string, unknown>): Promise<void> {
    const traceId = typeof msg.traceId === "string" ? msg.traceId.trim() : "";
    const activationId = typeof msg.activationId === "string" ? msg.activationId.trim() : "";
    const commandName = typeof msg.commandName === "string" ? msg.commandName.trim() : "";
    const signal = msg.signal === "noisy" ? "noisy" : "useful";
    if (!traceId || !activationId || !commandName) return;
    const confirmed = await vscode.window.showWarningMessage(
      `Mark this Guidance item ${signal}? This records shadow feedback and may require command policy approval.`,
      { modal: true },
      `Mark ${signal}`
    );
    if (confirmed !== `Mark ${signal}`) return;
    const actor = (await this.resolveActionActor("Actor for feedback")) ?? "dashboard";
    const note = await vscode.window.showInputBox({
      prompt: "Optional feedback note",
      placeHolder: "What made this Guidance useful or noisy?"
    });
    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      traceId,
      activationId,
      commandName,
      signal,
      actor,
      policyApproval: {
        confirmed: true,
        rationale: "Guidance tab shadow feedback confirmation"
      }
    };
    if (note && note.trim()) payload.note = note.trim();
    const r = await this.client.run("cae-record-shadow-feedback", payload);
    await webview.postMessage({
      type: "setActionResult",
      html: renderGuidanceActionResultInnerHtml({ action: `${signal === "useful" ? "Useful" : "Noisy"} feedback`, result: r })
    });
    await this.pushSummary(webview);
  }

  private defaultActorFromEnvironment(): string | undefined {
    const candidates = [
      process.env.GIT_AUTHOR_EMAIL,
      process.env.GIT_COMMITTER_EMAIL,
      process.env.WORKSPACE_KIT_ACTOR,
      process.env.USER,
      process.env.USERNAME
    ];
    return candidates.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)?.trim();
  }

  private async resolveActionActor(prompt: string): Promise<string | undefined> {
    const actor = this.defaultActorFromEnvironment();
    if (actor) return actor;
    return vscode.window.showInputBox({ prompt, value: "dashboard" });
  }

  private buildHtmlShell(webview: vscode.Webview): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");
    const bootstrap = `(function(){
  var vscode = acquireVsCodeApi();
  var summaryRoot = document.getElementById('guidance-summary-root');
  var previewRoot = document.getElementById('guidance-preview-root');
  var traceDetailRoot = document.getElementById('guidance-trace-detail-root');
  var actionResultRoot = document.getElementById('guidance-action-result-root');
  var statusEl = document.getElementById('gd-status');
  var taskSelect = document.getElementById('gd-task-select');
  var workflowSelect = document.getElementById('gd-workflow-select');
  var workflowList = document.getElementById('gd-workflow-options');
  function showStatus(kind, text) {
    if (!statusEl) return;
    statusEl.className = 'gd-status gd-status-' + (kind || 'info');
    statusEl.textContent = text || '';
  }
  function option(label, value, title) {
    var opt = document.createElement('option');
    opt.value = value || '';
    opt.textContent = label || value || '';
    if (title) opt.title = title;
    return opt;
  }
  function setInputValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value || '';
  }
  function renderChoices(tasks, workflows) {
    if (taskSelect) {
      taskSelect.textContent = '';
      taskSelect.appendChild(option('Manual / no task', ''));
      (Array.isArray(tasks) ? tasks : []).forEach(function(task) {
        var label = String(task.id || '') + (task.title ? ' — ' + String(task.title) : '');
        taskSelect.appendChild(option(label, String(task.id || ''), String(task.phase || task.status || '')));
      });
    }
    if (workflowSelect) {
      workflowSelect.textContent = '';
      workflowSelect.appendChild(option('Manual entry', ''));
      (Array.isArray(workflows) ? workflows : []).filter(function(w) { return w && w.curated; }).forEach(function(w) {
        workflowSelect.appendChild(option(String(w.name || ''), String(w.name || ''), String(w.description || '')));
      });
    }
    if (workflowList) {
      workflowList.textContent = '';
      (Array.isArray(workflows) ? workflows : []).forEach(function(w) {
        var opt = option(String(w.name || ''), String(w.name || ''), String(w.moduleId || '') + (w.description ? ' — ' + String(w.description) : ''));
        workflowList.appendChild(opt);
      });
    }
  }
  function requestLoad() {
    vscode.postMessage({ type: 'load' });
  }
  function runPreview() {
    var taskId = document.getElementById('gd-task-id');
    var commandName = document.getElementById('gd-command-name');
    var moduleId = document.getElementById('gd-module-id');
    var argvSummary = document.getElementById('gd-argv-summary');
    var commandArgs = document.getElementById('gd-command-args');
    var live = document.getElementById('gd-mode-live');
    var parsedCommandArgs;
    var commandArgsText = commandArgs && commandArgs.value ? commandArgs.value.trim() : '';
    if (commandArgsText) {
      try {
        parsedCommandArgs = JSON.parse(commandArgsText);
        if (!parsedCommandArgs || typeof parsedCommandArgs !== 'object' || Array.isArray(parsedCommandArgs)) {
          throw new Error('commandArgs must be a JSON object');
        }
      } catch (err) {
        showStatus('err', 'Invalid commandArgs JSON: ' + (err && err.message ? err.message : String(err)));
        return;
      }
    }
    vscode.postMessage({
      type: 'preview',
      taskId: taskId && taskId.value || '',
      commandName: commandName && commandName.value || '',
      moduleId: moduleId && moduleId.value || '',
      commandArgs: parsedCommandArgs,
      argvSummary: argvSummary && argvSummary.value || '',
      evalMode: live && live.checked ? 'live' : 'shadow'
    });
  }
  if (taskSelect) taskSelect.addEventListener('change', function() { setInputValue('gd-task-id', taskSelect.value || ''); });
  if (workflowSelect) workflowSelect.addEventListener('change', function() { if (workflowSelect.value) setInputValue('gd-command-name', workflowSelect.value); });
  document.getElementById('gd-refresh') && document.getElementById('gd-refresh').addEventListener('click', requestLoad);
  document.getElementById('gd-preview') && document.getElementById('gd-preview').addEventListener('click', runPreview);
  document.body.addEventListener('click', function(ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'BUTTON') return;
    var act = t.getAttribute('data-wc-action');
    if (!act) return;
    ev.preventDefault();
    if (act === 'guidance-explain') {
      vscode.postMessage({ type: 'explain', traceId: t.getAttribute('data-trace-id') || '' });
      return;
    }
    if (act === 'guidance-ack') {
      vscode.postMessage({
        type: 'ack',
        traceId: t.getAttribute('data-trace-id') || '',
        activationId: t.getAttribute('data-activation-id') || '',
        ackToken: t.getAttribute('data-ack-token') || ''
      });
      return;
    }
    if (act === 'guidance-feedback') {
      vscode.postMessage({
        type: 'feedback',
        signal: t.getAttribute('data-signal') || 'useful',
        traceId: t.getAttribute('data-trace-id') || '',
        activationId: t.getAttribute('data-activation-id') || '',
        commandName: t.getAttribute('data-command-name') || ''
      });
    }
  });
  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'poke') {
      requestLoad();
      return;
    }
    if (m && m.type === 'setSummary' && summaryRoot && typeof m.html === 'string') {
      summaryRoot.innerHTML = m.html;
      showStatus('info', 'Guidance summary loaded.');
      return;
    }
    if (m && m.type === 'setChoices') {
      renderChoices(m.tasks, m.workflows);
      return;
    }
    if (m && m.type === 'setPreview' && previewRoot && typeof m.html === 'string') {
      previewRoot.innerHTML = m.html;
      showStatus('info', 'Guidance preview updated.');
      return;
    }
    if (m && m.type === 'setTraceDetail' && traceDetailRoot && typeof m.html === 'string') {
      traceDetailRoot.innerHTML = m.html;
      showStatus('info', 'Trace detail loaded.');
      return;
    }
    if (m && m.type === 'setActionResult' && actionResultRoot && typeof m.html === 'string') {
      actionResultRoot.innerHTML = m.html;
      showStatus('info', 'Guidance action finished.');
      return;
    }
    if (m && m.type === 'showStatus') {
      showStatus(m.kind || 'info', m.text || '');
    }
  });
  requestLoad();
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 12px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    h2 { font-size: 13px; margin: 0; }
    h3 { font-size: 12px; margin: 0; }
    .gd-muted { opacity: 0.78; line-height: 1.35; }
    .gd-toolbar, .gd-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .gd-toolbar { margin: 10px 0; }
    .gd-field { display: flex; flex-direction: column; gap: 3px; min-width: 120px; flex: 1; }
    .gd-field label { font-weight: 600; }
    .gd-input { padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .gd-btn { padding: 4px 10px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-widget-border); border-radius: 2px; }
    .gd-primary, .gd-btn.gd-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .gd-status { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px 8px; margin: 8px 0; border-radius: 2px; background: var(--vscode-textCodeBlock-background); }
    .gd-status-ok { background: rgba(0, 160, 0, 0.15); }
    .gd-status-err, .gd-danger { background: rgba(200, 60, 60, 0.2); }
    .gd-card { border: 1px solid var(--vscode-widget-border); border-radius: 3px; background: var(--vscode-editor-background); padding: 8px; margin: 8px 0; }
    .gd-warn-card { background: rgba(200, 150, 0, 0.12); }
    .gd-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .gd-pill, .gd-chip { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); white-space: nowrap; }
    .gd-ok { background: rgba(0, 160, 0, 0.25); }
    .gd-warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
    .gd-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin: 8px 0 0; }
    .gd-meta dt { font-weight: 600; }
    .gd-meta dd { margin: 2px 0 0; }
    .gd-counts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .gd-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .gd-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--vscode-widget-border); padding-top: 6px; }
    .gd-row-compact { align-items: flex-start; }
    .gd-guidance-card { border-top: 1px solid var(--vscode-widget-border); margin-top: 8px; padding-top: 8px; }
    pre { overflow: auto; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  </style>
</head>
<body>
  <h1>Guidance</h1>
  <p class="gd-muted">Context Guidance powered by CAE. Preview what rules, steps, and checks apply before you run a workflow.</p>
  <div class="gd-toolbar">
    <button type="button" class="gd-btn gd-primary" id="gd-refresh">Reload status</button>
  </div>
  <section class="gd-card">
    <h2>Check current context</h2>
    <p class="gd-muted">Pick a common path first, or use the manual fields when you need to go off-road.</p>
    <div class="gd-toolbar">
      <div class="gd-field"><label for="gd-task-select">Task picker</label><select id="gd-task-select" class="gd-input"><option value="">Loading tasks…</option></select></div>
      <div class="gd-field"><label for="gd-workflow-select">Common workflows</label><select id="gd-workflow-select" class="gd-input"><option value="">Loading workflows…</option></select></div>
    </div>
    <div class="gd-toolbar">
      <div class="gd-field"><label for="gd-task-id">Task</label><input id="gd-task-id" class="gd-input" placeholder="T921 (optional)" /></div>
      <div class="gd-field"><label for="gd-command-name">Command or workflow</label><input id="gd-command-name" class="gd-input" list="gd-workflow-options" value="get-next-actions" /><datalist id="gd-workflow-options"></datalist></div>
      <div class="gd-field"><label for="gd-module-id">Module</label><input id="gd-module-id" class="gd-input" placeholder="optional" /></div>
    </div>
    <div class="gd-field"><label for="gd-command-args">Command args JSON</label><textarea id="gd-command-args" class="gd-input" rows="4" placeholder='optional JSON object, e.g. {"status":"ready"}'></textarea></div>
    <div class="gd-field"><label for="gd-argv-summary">Argv summary</label><input id="gd-argv-summary" class="gd-input" placeholder="optional advanced text override" /></div>
    <p><label><input type="checkbox" id="gd-mode-live" /> Applies now (advanced). Default is Preview mode.</label></p>
    <button type="button" class="gd-btn gd-primary" id="gd-preview">Check current context</button>
  </section>
  <div id="gd-status" class="gd-status gd-status-info" role="status"></div>
  <div id="guidance-action-result-root"></div>
  <div id="guidance-trace-detail-root"></div>
  <div id="guidance-preview-root"></div>
  <div id="guidance-summary-root"></div>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
