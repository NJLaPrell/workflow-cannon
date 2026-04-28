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
  label: string;
};

const WORKFLOW_INTENT_LABELS: Record<string, string> = {
  "get-next-actions": "Find the next task",
  "list-tasks": "Review the task queue",
  "dashboard-summary": "Refresh dashboard context",
  "queue-health": "Check queue health",
  "run-transition": "Change task status",
  "cae-dashboard-summary": "Reload Guidance status",
  "cae-guidance-preview": "Preview Guidance",
  "cae-recent-traces": "Review recent checks",
  "cae-explain": "Explain a Guidance check",
  "generate-document": "Generate one document",
  "document-project": "Regenerate project docs"
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
    curated: CURATED_WORKFLOW_NAMES.has(name),
    label: WORKFLOW_INTENT_LABELS[name] ?? name
  };
}

function workflowChoicesFromProduct(payload: unknown): WorkflowChoice[] {
  const product = asRecord(payload);
  const intents = asRecord(product.intents);
  const workflows = Array.isArray(intents.workflows) ? intents.workflows : [];
  return workflows
    .map((raw) => {
      const row = asRecord(raw);
      const name = typeof row.name === "string" ? row.name : "";
      if (!name) return null;
      return {
        name,
        moduleId: typeof row.moduleId === "string" ? row.moduleId : "",
        description: typeof row.description === "string" ? row.description : "",
        curated: row.curated === true,
        label: typeof row.label === "string" && row.label ? row.label : name
      };
    })
    .filter((choice): choice is WorkflowChoice => choice !== null);
}

export class GuidanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.guidance";

  private view?: vscode.WebviewView;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | undefined;

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
      if (msg?.type === "draftPreview") {
        const commandName = typeof msg.commandName === "string" && msg.commandName.trim() ? msg.commandName.trim() : "get-next-actions";
        const taskId = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        const sourceTitle = typeof msg.sourceTitle === "string" ? msg.sourceTitle.trim() : "";
        const trigger = typeof msg.trigger === "string" ? msg.trigger.trim() : commandName;
        const strength = typeof msg.strength === "string" ? msg.strength.trim() : "advisory";
        const args: Record<string, unknown> = {
          schemaVersion: 1,
          commandName: trigger,
          evalMode: "shadow",
          argvSummary: `Draft guidance update preview: ${sourceTitle || "Untitled guidance"} (${strength})`
        };
        if (taskId) args.taskId = taskId;
        const r = await this.client.run("cae-guidance-preview", args);
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
      if (msg?.type === "versionAction") {
        await this.recordVersionAction(webview, msg);
      }
    });
  }

  refresh(): void {
    if (this.view) {
      void this.pushSummary(this.view.webview);
    }
  }

  private async pushSummary(webview: vscode.Webview): Promise<void> {
    const summary = await this.client.run("cae-dashboard-summary", { schemaVersion: 1 });
    const product =
      summary.ok && summary.data && typeof summary.data === "object"
        ? asRecord(summary.data).guidanceProduct
        : undefined;
    await webview.postMessage({ type: "setSummary", html: renderGuidanceSummaryInnerHtml(summary) });
    await this.pushChoices(webview, workflowChoicesFromProduct(product));
  }

  private async pushChoices(webview: vscode.Webview, productWorkflows: WorkflowChoice[] = []): Promise<void> {
    const [nextActions, inProgress, workflows] = await Promise.all([
      this.client.run("get-next-actions", {}),
      this.client.run("list-tasks", { status: "in_progress" }),
      productWorkflows.length > 0 ? Promise.resolve(productWorkflows) : this.loadWorkflowChoices()
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
          byName.set(name, {
            name,
            moduleId: "",
            description: "Common workflow",
            curated: true,
            label: WORKFLOW_INTENT_LABELS[name] ?? name
          });
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
        curated: true,
        label: WORKFLOW_INTENT_LABELS[name] ?? name
      }));
    }
  }

  private async notifyRefresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
    }
    this.autoRefreshTimer = setTimeout(() => {
      this.autoRefreshTimer = undefined;
      void this.view?.webview.postMessage({ type: "poke" });
    }, 1500);
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

  private async recordVersionAction(webview: vscode.Webview, msg: Record<string, unknown>): Promise<void> {
    const action = typeof msg.action === "string" ? msg.action : "";
    const versionId = typeof msg.versionId === "string" ? msg.versionId.trim() : "";
    const command =
      action === "activate"
        ? "cae-activate-registry-version"
        : action === "rollback"
          ? "cae-rollback-registry-version"
          : action === "clone"
            ? "cae-clone-registry-version"
            : "";
    if (!command) return;
    const actor = (await this.resolveActionActor("Actor for CAE guidance-set update")) ?? "dashboard";
    const rationale = await vscode.window.showInputBox({
      prompt: "Rationale for CAE guidance-set update",
      placeHolder: "Why is this guidance-set change needed?"
    });
    if (!rationale || !rationale.trim()) return;
    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      actor,
      note: rationale.trim(),
      caeMutationApproval: {
        confirmed: true,
        rationale: rationale.trim()
      }
    };
    if (command === "cae-activate-registry-version") {
      if (!versionId) return;
      payload.versionId = versionId;
    }
    if (command === "cae-clone-registry-version") {
      if (!versionId || versionId === "n/a") return;
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const toVersionId = await vscode.window.showInputBox({
        prompt: "Draft guidance-set version id",
        value: `cae.reg.draft.${stamp}`
      });
      if (!toVersionId || !toVersionId.trim()) return;
      payload.fromVersionId = versionId;
      payload.toVersionId = toVersionId.trim();
      payload.setActive = false;
    }
    const r = await this.client.run(command, payload);
    await webview.postMessage({
      type: "setActionResult",
      html: renderGuidanceActionResultInnerHtml({ action: `Guidance set ${action}`, result: r })
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
  var loadTimer = null;
  var previewBtn = document.getElementById('gd-preview');
  var refreshBtn = document.getElementById('gd-refresh');
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
  function setBusy(el, busy, label) {
    if (!el) return;
    if (busy) {
      if (!el.getAttribute('data-original-label')) el.setAttribute('data-original-label', el.textContent || '');
      el.disabled = true;
      if (label) el.textContent = label;
    } else {
      el.disabled = false;
      var original = el.getAttribute('data-original-label');
      if (original) el.textContent = original;
    }
  }
  function scrollToPanel(el) {
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function workflowLabel(workflow) {
    if (!workflow) return '';
    var label = workflow.label || workflow.name || '';
    return workflow.name && workflow.name !== label ? String(label) + ' (' + String(workflow.name) + ')' : String(label);
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
      workflowSelect.appendChild(option('Choose what you are about to do', ''));
      (Array.isArray(workflows) ? workflows : []).filter(function(w) { return w && w.curated; }).forEach(function(w) {
        workflowSelect.appendChild(option(workflowLabel(w), String(w.name || ''), String(w.description || '')));
      });
    }
    if (workflowList) {
      workflowList.textContent = '';
      (Array.isArray(workflows) ? workflows : []).forEach(function(w) {
        var opt = option(workflowLabel(w), String(w.name || ''), String(w.moduleId || '') + (w.description ? ' — ' + String(w.description) : ''));
        workflowList.appendChild(opt);
      });
    }
  }
  function requestLoad(background) {
    if (background) {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = setTimeout(function() {
        loadTimer = null;
        vscode.postMessage({ type: 'load' });
      }, 1200);
      return;
    }
    setBusy(refreshBtn, true, 'Reloading...');
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
    setBusy(previewBtn, true, 'Checking...');
    if (previewRoot) previewRoot.innerHTML = '<section class="gd-card gd-loading"><h2>Checking before you run...</h2><p class="gd-muted">Reading the active guidance set for this task and workflow.</p></section>';
    showStatus('info', 'Running read-only pre-flight check...');
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
  function previewDraft() {
    var taskId = document.getElementById('gd-task-id');
    var commandName = document.getElementById('gd-command-name');
    var sourceTitle = document.getElementById('gd-draft-source-title');
    var trigger = document.getElementById('gd-draft-trigger');
    var strength = document.getElementById('gd-draft-strength');
    setBusy(document.getElementById('gd-draft-preview'), true, 'Previewing...');
    showStatus('info', 'Previewing draft impact against the current workflow...');
    vscode.postMessage({
      type: 'draftPreview',
      taskId: taskId && taskId.value || '',
      commandName: commandName && commandName.value || '',
      sourceTitle: sourceTitle && sourceTitle.value || '',
      trigger: trigger && trigger.value || '',
      strength: strength && strength.value || ''
    });
  }
  function fillDraftFromButton(button) {
    setInputValue('gd-draft-trigger', button.getAttribute('data-command-name') || document.getElementById('gd-command-name')?.value || '');
    setInputValue('gd-draft-check-record', button.getAttribute('data-trace-id') || '');
    setInputValue('gd-draft-trigger-id', button.getAttribute('data-activation-id') || '');
    var sourceTitle = document.getElementById('gd-draft-source-title');
    if (sourceTitle && !sourceTitle.value) sourceTitle.value = 'Guidance update from current check';
    showStatus('ok', 'Draft update context filled. Review it in Manage Guidance, then preview impact.');
    scrollToPanel(document.getElementById('gd-manage-draft'));
  }
  function copyVisibleJson(button) {
    var block = button && button.closest ? button.closest('.gd-raw-block') : null;
    var pre = block ? block.querySelector('pre') : null;
    var text = pre ? pre.textContent || '' : '';
    if (!text) {
      showStatus('err', 'No JSON block found to copy.');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showStatus('ok', 'Copied visible JSON.');
      }, function(err) {
        showStatus('err', 'Copy failed: ' + (err && err.message ? err.message : String(err)));
      });
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      showStatus('ok', 'Copied visible JSON.');
    } catch (err) {
      showStatus('err', 'Copy failed: ' + (err && err.message ? err.message : String(err)));
    }
    document.body.removeChild(area);
  }
  if (taskSelect) taskSelect.addEventListener('change', function() { setInputValue('gd-task-id', taskSelect.value || ''); });
  if (workflowSelect) workflowSelect.addEventListener('change', function() { if (workflowSelect.value) setInputValue('gd-command-name', workflowSelect.value); });
  document.getElementById('gd-refresh') && document.getElementById('gd-refresh').addEventListener('click', function(){ requestLoad(false); });
  document.getElementById('gd-preview') && document.getElementById('gd-preview').addEventListener('click', runPreview);
  document.getElementById('gd-draft-preview') && document.getElementById('gd-draft-preview').addEventListener('click', previewDraft);
  document.getElementById('gd-draft-reset') && document.getElementById('gd-draft-reset').addEventListener('click', function(){
    ['gd-draft-source-title','gd-draft-trigger','gd-draft-strength','gd-draft-check-record','gd-draft-trigger-id','gd-draft-notes'].forEach(function(id){ setInputValue(id, id === 'gd-draft-strength' ? 'advisory' : ''); });
    showStatus('info', 'Draft update form reset.');
  });
  document.body.addEventListener('click', function(ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'BUTTON') return;
    var act = t.getAttribute('data-wc-action');
    if (!act) return;
    ev.preventDefault();
    if (act === 'guidance-explain') {
      setBusy(t, true, 'Reviewing...');
      showStatus('info', 'Loading explanation...');
      vscode.postMessage({ type: 'explain', traceId: t.getAttribute('data-trace-id') || '' });
      return;
    }
    if (act === 'guidance-improve') {
      fillDraftFromButton(t);
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
      setBusy(t, true, 'Recording...');
      vscode.postMessage({
        type: 'feedback',
        signal: t.getAttribute('data-signal') || 'useful',
        traceId: t.getAttribute('data-trace-id') || '',
        activationId: t.getAttribute('data-activation-id') || '',
        commandName: t.getAttribute('data-command-name') || ''
      });
      return;
    }
    if (act === 'guidance-version-activate') {
      setBusy(t, true, 'Activating...');
      vscode.postMessage({ type: 'versionAction', action: 'activate', versionId: t.getAttribute('data-version-id') || '' });
      return;
    }
    if (act === 'guidance-version-rollback') {
      setBusy(t, true, 'Rolling back...');
      vscode.postMessage({ type: 'versionAction', action: 'rollback' });
      return;
    }
    if (act === 'guidance-version-clone') {
      setBusy(t, true, 'Creating draft...');
      vscode.postMessage({ type: 'versionAction', action: 'clone', versionId: t.getAttribute('data-version-id') || '' });
      return;
    }
    if (act === 'guidance-copy-block') {
      copyVisibleJson(t);
    }
  });
  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'poke') {
      requestLoad(true);
      return;
    }
    if (m && m.type === 'setSummary' && summaryRoot && typeof m.html === 'string') {
      summaryRoot.innerHTML = m.html;
      setBusy(refreshBtn, false);
      showStatus('info', 'Guidance status loaded.');
      return;
    }
    if (m && m.type === 'setChoices') {
      renderChoices(m.tasks, m.workflows);
      return;
    }
    if (m && m.type === 'setPreview' && previewRoot && typeof m.html === 'string') {
      previewRoot.innerHTML = m.html;
      setBusy(previewBtn, false);
      setBusy(document.getElementById('gd-draft-preview'), false);
      showStatus('ok', 'Pre-flight result updated.');
      scrollToPanel(previewRoot);
      return;
    }
    if (m && m.type === 'setTraceDetail' && traceDetailRoot && typeof m.html === 'string') {
      traceDetailRoot.innerHTML = m.html;
      document.querySelectorAll('[data-wc-action="guidance-explain"]').forEach(function(btn){ setBusy(btn, false); });
      showStatus('info', 'Trace detail loaded.');
      scrollToPanel(traceDetailRoot);
      return;
    }
    if (m && m.type === 'setActionResult' && actionResultRoot && typeof m.html === 'string') {
      actionResultRoot.innerHTML = m.html;
      document.querySelectorAll('button[disabled]').forEach(function(btn){ setBusy(btn, false); });
      showStatus('info', 'Guidance action finished.');
      scrollToPanel(actionResultRoot);
      return;
    }
    if (m && m.type === 'showStatus') {
      showStatus(m.kind || 'info', m.text || '');
    }
  });
  requestLoad(false);
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; font-size: 12px; margin: 0; }
    h1 { font-size: 19px; margin: 0 0 3px; }
    h2 { font-size: 13px; margin: 0; }
    h3 { font-size: 12px; margin: 0; }
    .gd-muted { opacity: 0.78; line-height: 1.35; }
    .gd-toolbar, .gd-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .gd-toolbar { margin: 10px 0; }
    .gd-field { display: flex; flex-direction: column; gap: 3px; min-width: 120px; flex: 1; }
    .gd-field label { font-weight: 600; }
    .gd-input { padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .gd-btn { padding: 4px 10px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-widget-border); border-radius: 2px; }
    .gd-btn:disabled { cursor: progress; opacity: 0.65; }
    .gd-primary, .gd-btn.gd-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .gd-status { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px 8px; margin: 8px 0; border-radius: 2px; background: var(--vscode-textCodeBlock-background); }
    .gd-status-ok { background: rgba(0, 160, 0, 0.15); }
    .gd-status-err, .gd-danger { background: rgba(200, 60, 60, 0.2); }
    .gd-card { border: 1px solid var(--vscode-widget-border); border-radius: 3px; background: var(--vscode-editor-background); padding: 8px; margin: 8px 0; }
    .gd-hero { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-button-background) 9%, var(--vscode-editor-background)); }
    .gd-result-card { border-color: var(--vscode-focusBorder); }
    .gd-loading { border-style: dashed; }
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
    .gd-debug summary { opacity: 0.82; }
    .gd-library { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .gd-tabs { display: flex; gap: 6px; margin: 8px 0; }
    .gd-kicker { text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; font-size: 10px; margin: 0 0 3px; }
    pre { overflow: auto; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  </style>
</head>
<body>
  <p class="gd-kicker">Workflow Cannon</p>
  <h1>Before You Run</h1>
  <p class="gd-muted">Check which required rules, recommendations, and review checks apply before a workflow runs. Manage Guidance below lets maintainers inspect or prepare versioned CAE updates.</p>
  <div class="gd-toolbar">
    <button type="button" class="gd-btn" id="gd-refresh">Reload status</button>
  </div>
  <section class="gd-card gd-hero">
    <div class="gd-card-head">
      <h2>Check Before Running</h2>
      <span class="gd-pill">Read-only</span>
    </div>
    <p class="gd-muted">Choose the task and what you are about to do. This check does not run the workflow.</p>
    <div class="gd-toolbar">
      <div class="gd-field"><label for="gd-task-select">Task</label><select id="gd-task-select" class="gd-input"><option value="">Loading tasks...</option></select></div>
      <div class="gd-field"><label for="gd-workflow-select">What are you about to do?</label><select id="gd-workflow-select" class="gd-input"><option value="">Loading workflows...</option></select></div>
    </div>
    <div class="gd-toolbar">
      <div class="gd-field"><label for="gd-task-id">Task</label><input id="gd-task-id" class="gd-input" placeholder="T921 (optional)" /></div>
      <div class="gd-field"><label for="gd-command-name">Workflow</label><input id="gd-command-name" class="gd-input" list="gd-workflow-options" value="get-next-actions" /><datalist id="gd-workflow-options"></datalist></div>
    </div>
    <details>
      <summary>Advanced options</summary>
      <div class="gd-toolbar">
        <div class="gd-field"><label for="gd-module-id">Module</label><input id="gd-module-id" class="gd-input" placeholder="optional" /></div>
        <div class="gd-field"><label for="gd-argv-summary">Argv summary</label><input id="gd-argv-summary" class="gd-input" placeholder="optional advanced text override" /></div>
      </div>
      <div class="gd-field"><label for="gd-command-args">Command args JSON</label><textarea id="gd-command-args" class="gd-input" rows="4" placeholder='optional JSON object, e.g. {"status":"ready"}'></textarea></div>
      <p><label><input type="checkbox" id="gd-mode-live" /> Evaluate using active guidance now. This still does not run the workflow.</label></p>
    </details>
    <button type="button" class="gd-btn gd-primary" id="gd-preview">Check Before Running</button>
  </section>
  <div id="guidance-preview-root"></div>
  <div id="guidance-action-result-root"></div>
  <div id="guidance-trace-detail-root"></div>
  <section class="gd-card" id="gd-manage-draft">
    <div class="gd-card-head">
      <h2>Draft Guidance Update</h2>
      <span class="gd-pill">Not active until published</span>
    </div>
    <p class="gd-muted">Use this when current guidance is missing, useful, or noisy. Previewing a draft is read-only; publishing uses the Manage Guidance version controls.</p>
    <div class="gd-toolbar">
      <div class="gd-field"><label for="gd-draft-source-title">Source title</label><input id="gd-draft-source-title" class="gd-input" placeholder="What should users see?" /></div>
      <div class="gd-field"><label for="gd-draft-trigger">Trigger workflow</label><input id="gd-draft-trigger" class="gd-input" placeholder="get-next-actions" /></div>
      <div class="gd-field"><label for="gd-draft-strength">Strength</label><select id="gd-draft-strength" class="gd-input"><option value="required">Required rule</option><option value="advisory" selected>Recommendation</option><option value="step">Suggested step</option><option value="review">Review check</option></select></div>
    </div>
    <details>
      <summary>Draft context</summary>
      <div class="gd-toolbar">
        <div class="gd-field"><label for="gd-draft-check-record">Check record</label><input id="gd-draft-check-record" class="gd-input" placeholder="Filled from Improve this guidance" /></div>
        <div class="gd-field"><label for="gd-draft-trigger-id">Existing trigger id</label><input id="gd-draft-trigger-id" class="gd-input" placeholder="optional" /></div>
      </div>
      <div class="gd-field"><label for="gd-draft-notes">Notes</label><textarea id="gd-draft-notes" class="gd-input" rows="3" placeholder="What should change and why?"></textarea></div>
    </details>
    <div class="gd-actions">
      <button type="button" class="gd-btn gd-primary" id="gd-draft-preview">Preview Draft Impact</button>
      <button type="button" class="gd-btn" id="gd-draft-reset">Reset Draft</button>
    </div>
  </section>
  <div id="guidance-summary-root">
    <section class="gd-card">
      <div class="gd-card-head">
        <h2>Guidance System</h2>
        <span class="gd-pill">Loading</span>
      </div>
      <p class="gd-muted">Guidance system status, recent activity, library, and version controls are loading.</p>
    </section>
  </div>
  <div id="gd-status" class="gd-status gd-status-info" role="status">Guidance status is loading.</div>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
