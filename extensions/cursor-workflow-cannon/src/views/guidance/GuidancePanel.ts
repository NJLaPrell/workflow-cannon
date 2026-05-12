import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  buildGuidanceCaeMutationDrawerSpec,
  renderDrawerFormHtml,
  validateGuidanceCaeMutationSubmit
} from "../dashboard/dashboard-input-drawer.js";
import { buildGuidanceMutationActionResultMessage } from "./guidance-panel-messages.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "./render-guidance-panel.js";

const VIEW_TYPE = "workflowCannon.guidancePanel";

export class GuidancePanel {
  private panel: vscode.WebviewPanel | undefined;
  private refreshInFlight = false;
  private pendingRefresh = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** In-flight CAE mutation drawer (authoring panel) — cancelled if the webview reloads. */
  private guidanceMutationApproval:
    | { resolve: (v: { actor: string; note: string } | null) => void; actor: string }
    | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>,
    private readonly workspaceFolder?: vscode.WorkspaceFolder
  ) {
    onKitStateChanged(() => {
      this.scheduleRefresh(false);
    });
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One, true);
      void this.runRefresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Workflow Cannon — Guidance", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.extensionUri]
    });
    this.panel = panel;
    panel.onDidDispose(() => {
      this.panel = undefined;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    });
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "drawerSubmit") {
        void this.onGuidanceDrawerSubmit((msg as { values?: unknown }).values);
        return;
      }
      if (msg?.type === "drawerCancel") {
        void this.onGuidanceDrawerCancel();
        return;
      }
      if (msg?.type === "refresh") void this.runRefresh();
      if (msg?.type === "validateRegistry") void this.runValidation();
      if (msg?.type === "openArtifact") void this.openArtifact(String(msg.path ?? ""));
      if (msg?.type === "artifactAction") void this.reportAction(String(msg.action ?? ""), String(msg.artifactId ?? ""));
      if (msg?.type === "activationAction") void this.runActivationAction(String(msg.action ?? ""), String(msg.activationId ?? ""), msg.previewEvidence);
      if (msg?.type === "artifactMutation") void this.runArtifactMutation(String(msg.command ?? ""), msg.payload);
      if (msg?.type === "activationMutation") void this.runActivationMutation(String(msg.command ?? ""), msg.payload);
      if (msg?.type === "guidancePreview") void this.runGuidancePreview(msg.payload);
      if (msg?.type === "listRegistryVersions") void this.runListRegistryVersions();
      if (msg?.type === "portabilityRun") void this.runPortability(String(msg.kind ?? ""));
      if (msg?.type === "activationBulk") void this.runActivationBulk(String(msg.mode ?? ""), Array.isArray(msg.activationIds) ? msg.activationIds : []);
    });
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) void this.runRefresh();
    });
    void this.runRefresh();
  }

  private async openArtifact(path: string): Promise<void> {
    if (!path.trim()) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Artifact path is missing." });
      return;
    }
    try {
      const uri = path.startsWith("/")
        ? vscode.Uri.file(path)
        : vscode.Uri.joinPath(this.workspaceFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? this.extensionUri, ...path.split(/[\\/]+/));
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
      await this.panel?.webview.postMessage({ type: "actionResult", ok: true, text: `Opened ${path}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async reportAction(action: string, targetId: string): Promise<void> {
    const label = action.replace(/^(artifact|activation)-/, "").replace(/-/g, " ");
    if (action === "artifact-hide-default" || action === "artifact-remove-override") {
      await this.panel?.webview.postMessage({
        type: "actionResult",
        ok: false,
        text: `${label.charAt(0).toUpperCase()}${label.slice(1)} is not available in the current backend contract for ${targetId}.`
      });
      return;
    }
    await this.panel?.webview.postMessage({
      type: "actionResult",
      ok: true,
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} selected for ${targetId}`
    });
  }

  private async collectMutationApproval(command: string, target: string, fallbackNote: string): Promise<{ actor: string; note: string } | null> {
    const webview = this.panel?.webview;
    if (!webview) {
      return null;
    }
    const actor = this.defaultActorFromEnvironment() ?? "dashboard";
    return await new Promise((resolve) => {
      this.guidanceMutationApproval = { resolve, actor };
      const html = renderDrawerFormHtml(
        buildGuidanceCaeMutationDrawerSpec({ command, target, fallbackNote, defaultActor: actor })
      );
      void webview.postMessage({ type: "wcDrawerOpen", html });
    });
  }

  private async onGuidanceDrawerSubmit(values: unknown): Promise<void> {
    const pending = this.guidanceMutationApproval;
    if (!pending) {
      return;
    }
    const rec = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
    const strVals: Record<string, string> = {};
    for (const k of Object.keys(rec)) {
      strVals[k] = String(rec[k] ?? "");
    }
    const v = validateGuidanceCaeMutationSubmit(strVals);
    if (!v.ok) {
      await this.panel?.webview.postMessage({ type: "wcDrawerValidation", message: v.error });
      return;
    }
    this.guidanceMutationApproval = undefined;
    await this.panel?.webview.postMessage({ type: "wcDrawerClose" });
    pending.resolve({ actor: pending.actor, note: v.values.rationale });
  }

  private async onGuidanceDrawerCancel(): Promise<void> {
    const pending = this.guidanceMutationApproval;
    if (!pending) {
      return;
    }
    this.guidanceMutationApproval = undefined;
    await this.panel?.webview.postMessage({ type: "wcDrawerClose" });
    pending.resolve(null);
  }

  private async postMutationResult(command: string, result: Awaited<ReturnType<CommandClient["run"]>>, options: { openPath?: string } = {}): Promise<void> {
    const message = buildGuidanceMutationActionResultMessage(command, result);
    await this.panel?.webview.postMessage(message);
    if (!message.ok) return;
    const actions = options.openPath ? ["Open File", "Refresh", "View Audit", "Preview"] : ["Refresh", "View Audit", "Preview"];
    const choice = await vscode.window.showInformationMessage(message.text, ...actions);
    if (choice === "Open File" && options.openPath) await this.openArtifact(options.openPath);
    if (choice === "Refresh") await this.runRefresh();
    if (choice === "View Audit") await this.panel?.webview.postMessage({ type: "selectTab", tab: "audit" });
    if (choice === "Preview") await this.panel?.webview.postMessage({ type: "selectTab", tab: "preview" });
  }

  private resultArtifactPath(result: Awaited<ReturnType<CommandClient["run"]>>): string | undefined {
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
    const path = (data as Record<string, unknown>).path;
    return typeof path === "string" && path.trim() ? path.trim() : undefined;
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

  private async runArtifactMutation(command: string, rawPayload: unknown): Promise<void> {
    const allowed = new Set([
      "cae-create-workspace-artifact",
      "cae-update-workspace-artifact",
      "cae-duplicate-default-artifact",
      "cae-duplicate-artifact-to-workspace",
      "cae-retire-workspace-artifact"
    ]);
    if (!allowed.has(command)) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Unsupported artifact mutation." });
      return;
    }
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    const target = String(payload.artifactId ?? payload.sourceArtifactId ?? "");
    const approval = await this.collectMutationApproval(command, target, typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : "Guidance artifact editor");
    if (!approval) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Artifact mutation cancelled." });
      return;
    }
    payload.schemaVersion = 1;
    payload.actor = approval.actor;
    payload.note = approval.note;
    payload.caeMutationApproval = { confirmed: true, rationale: approval.note };
    try {
      const result = await this.client.run(command, payload);
      await this.postMutationResult(command, result, { openPath: this.resultArtifactPath(result) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runActivationMutation(command: string, rawPayload: unknown): Promise<void> {
    const allowed = new Set(["cae-create-draft-activation", "cae-update-draft-activation"]);
    if (!allowed.has(command)) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Unsupported activation mutation." });
      return;
    }
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    const activation = payload.activation && typeof payload.activation === "object" && !Array.isArray(payload.activation) ? (payload.activation as Record<string, unknown>) : {};
    const activationId = String(payload.activationId ?? activation.activationId ?? "");
    const approval = await this.collectMutationApproval(command, activationId, typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : "Guidance activation editor");
    if (!approval) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Activation save cancelled." });
      return;
    }
    payload.schemaVersion = 1;
    payload.actor = approval.actor;
    payload.note = approval.note;
    payload.caeMutationApproval = { confirmed: true, rationale: approval.note };
    try {
      const result = await this.client.run(command, payload);
      const warnings = Array.isArray((result.data as Record<string, unknown> | undefined)?.warnings)
        ? ((result.data as Record<string, unknown>).warnings as unknown[]).length
        : 0;
      await this.postMutationResult(command, {
        ...result,
        message: result.ok === true ? `${command} completed${warnings ? ` with ${warnings} warning(s).` : "."}` : result.message
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runActivationAction(action: string, activationId: string, previewEvidence: unknown): Promise<void> {
    const commandByAction: Record<string, string> = {
      "activation-activate-draft": "cae-activate-draft-activation",
      "activation-disable": "cae-disable-activation",
      "activation-retire": "cae-retire-activation"
    };
    const command = commandByAction[action];
    if (!command) {
      await this.reportAction(action, activationId);
      return;
    }
    const approval = await this.collectMutationApproval(command, activationId, `Guidance ${action.replace(/^activation-/, "").replace(/-/g, " ")}`);
    if (!approval) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Activation mutation cancelled." });
      return;
    }
    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      actor: approval.actor,
      activationId,
      note: approval.note,
      caeMutationApproval: { confirmed: true, rationale: approval.note }
    };
    if (command === "cae-activate-draft-activation" && previewEvidence && typeof previewEvidence === "object" && !Array.isArray(previewEvidence)) {
      payload.previewEvidence = previewEvidence;
    }
    try {
      const result = await this.client.run(command, payload);
      await this.postMutationResult(command, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runGuidancePreview(rawPayload: unknown): Promise<void> {
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    payload.schemaVersion = 1;
    try {
      const result = await this.client.run("cae-guidance-preview", payload);
      await this.panel?.webview.postMessage({ type: "previewResult", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel?.webview.postMessage({ type: "previewResult", result: { ok: false, code: "extension-error", message } });
    }
  }

  private async runListRegistryVersions(): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) return;
    try {
      const result = await this.client.run("cae-list-registry-versions", { schemaVersion: 1 });
      await webview.postMessage({ type: "registryVersionsResult", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await webview.postMessage({
        type: "registryVersionsResult",
        result: { ok: false, code: "extension-error", message }
      });
    }
  }

  private async runPortability(kind: string): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) return;
    const root = this.workspaceFolder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
      if (kind === "portability-reconcile") {
        const result = await this.client.run("cae-reconcile-defaults", { schemaVersion: 1 });
        await webview.postMessage({ type: "portabilityResult", result });
        return;
      }
      if (kind === "portability-export") {
        const result = await this.client.run("cae-export-guidance-pack", { schemaVersion: 1 });
        if (result.ok === true && root) {
          const packPath = path.join(root, ".workspace-kit", "tmp", "guidance-pack.json");
          await fs.mkdir(path.dirname(packPath), { recursive: true });
          const data = (result.data ?? {}) as Record<string, unknown>;
          const pack = data.pack ?? result.data;
          await fs.writeFile(packPath, JSON.stringify(pack, null, 2), "utf8");
        }
        await webview.postMessage({ type: "portabilityResult", result });
        return;
      }
      if (kind === "portability-import-dry") {
        const result = await this.client.run("cae-import-guidance-pack-dry-run", {
          schemaVersion: 1,
          packRelativePath: ".workspace-kit/tmp/guidance-pack.json"
        });
        await webview.postMessage({ type: "portabilityResult", result });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await webview.postMessage({
        type: "portabilityResult",
        result: { ok: false, code: "extension-error", message }
      });
    }
  }

  private async runActivationBulk(mode: string, activationIds: string[]): Promise<void> {
    const ids = activationIds.map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) return;
    const commandByMode: Record<string, string> = {
      "activation-bulk-disable": "cae-disable-activation",
      "activation-bulk-retire": "cae-retire-activation"
    };
    const command = commandByMode[mode];
    if (!command) return;
    const approval = await this.collectMutationApproval(
      command,
      `${ids.length} activations (${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ", …" : ""})`,
      `Bulk ${command} from Guidance panel`
    );
    if (!approval) {
      await this.panel?.webview.postMessage({ type: "actionResult", ok: false, text: "Bulk activation change cancelled." });
      return;
    }
    const webview = this.panel?.webview;
    for (const activationId of ids) {
      const payload: Record<string, unknown> = {
        schemaVersion: 1,
        actor: approval.actor,
        activationId,
        note: approval.note,
        caeMutationApproval: { confirmed: true, rationale: approval.note }
      };
      try {
        const result = await this.client.run(command, payload);
        if (result.ok !== true) {
          await webview?.postMessage({
            type: "actionResult",
            ok: false,
            text: `${command} failed for ${activationId}: ${String(result.message ?? result.code ?? "error")}`
          });
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await webview?.postMessage({ type: "actionResult", ok: false, text: `${command} threw for ${activationId}: ${message}` });
        return;
      }
    }
    await webview?.postMessage({ type: "actionResult", ok: true, text: `${command} completed for ${ids.length} activation(s).` });
    await this.runRefresh();
  }

  private async runValidation(): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) return;
    try {
      const result = await this.client.run("cae-registry-validate", { schemaVersion: 1 });
      const data = (result.data ?? {}) as Record<string, unknown>;
      const hash = typeof data.registryContentHash === "string" ? ` · ${data.registryContentHash.slice(0, 12)}` : "";
      await webview.postMessage({
        type: "validationResult",
        ok: result.ok === true,
        text: result.ok === true ? `Registry validation passed${hash}` : String(result.message ?? result.code ?? "Registry validation failed")
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await webview.postMessage({ type: "validationResult", ok: false, text: message });
    }
  }

  private scheduleRefresh(immediate: boolean): void {
    if (!this.panel) return;
    if (immediate) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
      void this.runRefresh();
      return;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.runRefresh();
    }, 450);
  }

  private async runRefresh(): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) return;
    if (this.refreshInFlight) {
      this.pendingRefresh = true;
      return;
    }
    this.refreshInFlight = true;
    try {
      if (this.guidanceMutationApproval) {
        const stuck = this.guidanceMutationApproval;
        this.guidanceMutationApproval = undefined;
        stuck.resolve(null);
      }
      const result = await this.client.run("cae-authoring-summary", { schemaVersion: 1 });
      webview.html = this.wrapHtml(webview, renderGuidanceAuthoringPanelInnerHtml(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      webview.html = this.wrapHtml(
        webview,
        renderGuidanceAuthoringPanelInnerHtml({ ok: false, code: "extension-error", message })
      );
    } finally {
      this.refreshInFlight = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.runRefresh();
      }
    }
  }

  private wrapHtml(webview: vscode.Webview, inner: string): string {
    const csp = ["default-src 'none'", "style-src 'unsafe-inline'", `script-src ${webview.cspSource} 'unsafe-inline'`].join("; ");
    const bootstrap = `(function(){var vscode=acquireVsCodeApi();function el(id){return document.getElementById(id);}function val(id){var x=el(id);return x&&x.value!=null?String(x.value).trim():'';}function setVal(id,v){var x=el(id);if(x)x.value=v||'';}function esc(s){return String(s||'').replace(/[&<>]/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':'&gt;';});}function parseTemplates(){var n=el('gp-artifact-templates-json');if(!n||!n.textContent)return[];try{return JSON.parse(n.textContent);}catch(_e){return[];}}function setTab(name){document.querySelectorAll('[data-gp-tab]').forEach(function(b){b.classList.toggle('is-active',b.getAttribute('data-gp-tab')===name);});document.querySelectorAll('[data-gp-panel]').forEach(function(p){p.classList.toggle('is-active',p.getAttribute('data-gp-panel')===name);});}function setResult(kind,text,actions){var r=el('gp-action-result');if(!r)return;r.className='gp-inline-result '+(kind==='ok'?'gp-ok':'gp-warn');if(actions&&actions.length){r.textContent='';var span=document.createElement('span');span.textContent=text||'';r.appendChild(span);var row=document.createElement('div');row.className='gp-action-row';actions.forEach(function(a){var b=document.createElement('button');b.type='button';b.setAttribute('data-gp-action',String(a.action||''));b.textContent=String(a.label||a.action||'Action');row.appendChild(b);});r.appendChild(row);}else{r.textContent=text||'';}}function filterRows(kind){var q=val('gp-'+kind+'-search').toLowerCase();var first=val('gp-'+kind+'-'+(kind==='artifact'?'source':'family'));var status=val('gp-'+kind+'-status');var shown=0;document.querySelectorAll('[data-gp-'+kind+'-row]').forEach(function(row){var ok=(!q||String(row.getAttribute('data-gp-search')||'').indexOf(q)>=0)&&(!first||row.getAttribute('data-gp-'+(kind==='artifact'?'source':'family'))===first)&&(!status||row.getAttribute('data-gp-status')===status);row.style.display=ok?'':'none';if(ok)shown++;});var c=el('gp-'+kind+'-count');if(c)c.textContent=shown+' '+(kind==='artifact'?'artifacts':'activations');}function clearArtifactForm(){['gp-artifact-id','gp-artifact-title','gp-artifact-tags','gp-artifact-slug','gp-artifact-fragment','gp-artifact-content','gp-artifact-note','gp-artifact-source-id','gp-artifact-template'].forEach(function(id){setVal(id,'');});setVal('gp-artifact-type','playbook');var p=el('gp-artifact-preview');if(p)p.textContent='';}function fillArtifactForm(btn,mode){var row=btn.closest('[data-gp-artifact-row]');if(!row)return;var artifactId=row.getAttribute('data-gp-artifact-id')||'';var title=row.getAttribute('data-gp-artifact-title')||'';var type=row.getAttribute('data-gp-artifact-type')||'playbook';var path=row.getAttribute('data-gp-artifact-path')||'';var stem=path.split('/').pop()||'';stem=stem.replace(/\.md$/,'');if(mode==='duplicate'){setVal('gp-artifact-template','');setVal('gp-artifact-source-id',artifactId);setVal('gp-artifact-id','workspace.'+artifactId.replace(/^cae\./,'').replace(/[^a-z0-9_.-]+/gi,'.')+'.copy');setVal('gp-artifact-title',title?title+' Copy':'Artifact Copy');}else{setVal('gp-artifact-source-id','');setVal('gp-artifact-id',artifactId);setVal('gp-artifact-title',title);}setVal('gp-artifact-type',type);setVal('gp-artifact-slug',stem);setVal('gp-artifact-note',mode==='retire'?'Retire artifact':'');setTab('artifacts');setResult('ok',(mode==='duplicate'?'Duplicate':mode==='retire'?'Retire':'Edit')+' loaded for '+artifactId);}function clearActivationForm(){['gp-activation-id','gp-activation-scope-value','gp-activation-scope-path','gp-activation-scope-value-2','gp-activation-scope-path-2','gp-activation-scope-json','gp-activation-note','gp-activation-ack-token'].forEach(function(id){setVal(id,'');});setVal('gp-activation-family-field','do');setVal('gp-activation-priority','1');setVal('gp-activation-lifecycle','draft');setVal('gp-activation-ack-strength','none');setVal('gp-activation-scope-preset','always');setVal('gp-activation-scope-preset-2','');document.querySelectorAll('[data-gp-activation-artifact]').forEach(function(x){x.checked=false;});}function fillActivationForm(btn,mode){var row=btn.closest('[data-gp-activation-row]');if(!row)return;var activationId=row.getAttribute('data-gp-activation-id')||'';if(mode==='duplicate')activationId='workspace.'+activationId.replace(/^cae\./,'').replace(/[^a-z0-9_.-]+/gi,'.')+'.copy';setVal('gp-activation-id',activationId);setVal('gp-activation-family-field',row.getAttribute('data-gp-activation-family')||'do');setVal('gp-activation-priority',row.getAttribute('data-gp-activation-priority')||'1');setVal('gp-activation-lifecycle','draft');setVal('gp-activation-scope-json',row.getAttribute('data-gp-activation-scope-json')||'');setVal('gp-activation-ack-strength',row.getAttribute('data-gp-activation-ack-strength')||'none');setVal('gp-activation-ack-token',row.getAttribute('data-gp-activation-ack-token')||'');var refs=(row.getAttribute('data-gp-activation-refs')||'').split(',');document.querySelectorAll('[data-gp-activation-artifact]').forEach(function(x){x.checked=refs.indexOf(x.value)>=0;});setTab('activations');setResult('ok',(mode==='duplicate'?'Duplicate':'Edit')+' loaded for '+(row.getAttribute('data-gp-activation-id')||''));}function renderMarkdownPreview(){var src=val('gp-artifact-content');var html=src.split(/\n{2,}/).map(function(block){var text=esc(block.trim());if(!text)return '';if(text.indexOf('# ')==0)return '<h3>'+text.slice(2)+'</h3>';if(text.indexOf('## ')==0)return '<h4>'+text.slice(3)+'</h4>';return '<p>'+text.replace(/\n/g,'<br>')+'</p>';}).join('');var p=el('gp-artifact-preview');if(p)p.innerHTML=html||'<p class="gp-muted">No markdown yet.</p>';}function artifactPayload(kind){var editor=el('gp-artifact-editor');var tags=val('gp-artifact-tags').split(',').map(function(x){return x.trim();}).filter(Boolean);var base={artifactId:val('gp-artifact-id'),artifactType:val('gp-artifact-type'),title:val('gp-artifact-title'),slug:val('gp-artifact-slug'),fragment:val('gp-artifact-fragment'),contentMarkdown:val('gp-artifact-content'),tags:tags,note:val('gp-artifact-note'),expectedActiveVersionId:editor?editor.getAttribute('data-gp-active-version')||undefined:undefined,expectedRegistryDigest:editor?editor.getAttribute('data-gp-registry-digest')||undefined:undefined};Object.keys(base).forEach(function(k){if(base[k]===''||(Array.isArray(base[k])&&base[k].length===0))delete base[k];});if(kind==='duplicate'){base.sourceArtifactId=val('gp-artifact-source-id');delete base.contentMarkdown;}if(kind==='retire'){return {artifactId:base.artifactId,note:base.note,expectedActiveVersionId:base.expectedActiveVersionId,expectedRegistryDigest:base.expectedRegistryDigest};}return base;}function scopeScalar(raw){var text=String(raw||'').trim();if(text==='true')return true;if(text==='false')return false;if(text==='null')return null;if(text!==''&&!Number.isNaN(Number(text)))return Number(text);return text;}function activationScopeRow(preset,value,path){if(preset==='always')return[{kind:'always'}];if(!value){setResult('warn','Scope value is required for '+preset+'.');return null;}if(preset==='command-exact')return[{kind:'commandName',match:'exact',value:value}];if(preset==='command-prefix')return[{kind:'commandName',match:'prefix',value:value}];if(preset==='task-tag')return[{kind:'taskTag',match:path==='all'?'all':'any',values:value.split(',').map(function(x){return x.trim();}).filter(Boolean)}];if(preset==='task-id-pattern')return[{kind:'taskIdPattern',pattern:value}];if(preset==='phase-key')return[{kind:'phaseKey',value:value}];if(preset==='command-arg-equals'){if(!path){setResult('warn','Arg path is required for command arg equals.');return null;}return[{kind:'commandArgEquals',path:path,value:scopeScalar(value)}];}setResult('warn','Unknown scope preset '+preset+'.');return null;}function activationScope(){var advanced=val('gp-activation-scope-json');if(advanced){try{return JSON.parse(advanced);}catch(err){setResult('warn','Scope JSON is invalid: '+(err&&err.message?err.message:String(err)));return null;}}var p2=val('gp-activation-scope-preset-2');var row1=activationScopeRow(val('gp-activation-scope-preset'),val('gp-activation-scope-value'),val('gp-activation-scope-path'));if(!row1)return null;if(!p2)return{conditions:row1};var row2=activationScopeRow(p2,val('gp-activation-scope-value-2'),val('gp-activation-scope-path-2'));if(!row2)return null;var all=row1.concat(row2);if(all.some(function(c){return c.kind==='always';})&&all.length>1){setResult('warn','Cannot combine always with other scope rows.');return null;}return{conditions:all};}function activationPayload(kind){var editor=el('gp-activation-editor');var activationId=val('gp-activation-id');var scope=activationScope();if(!activationId){setResult('warn','Activation ID is required.');return null;}if(!scope)return null;var refs=[];document.querySelectorAll('[data-gp-activation-artifact]').forEach(function(x){if(x.checked)refs.push({artifactId:x.value});});if(refs.length===0){setResult('warn','Select at least one artifact.');return null;}var ackStrength=val('gp-activation-ack-strength');var ackToken=val('gp-activation-ack-token');var activation={schemaVersion:1,activationId:activationId,family:val('gp-activation-family-field')||'do',lifecycleState:'draft',priority:Number(val('gp-activation-priority')||'0'),scope:scope,artifactRefs:refs};if(ackStrength&&ackStrength!=='none'){if(!ackToken){setResult('warn','Ack token is required when acknowledgement is not none.');return null;}activation.acknowledgement={strength:ackStrength,token:ackToken};}var payload={activation:activation,note:val('gp-activation-note'),expectedActiveVersionId:editor?editor.getAttribute('data-gp-active-version')||undefined:undefined,expectedRegistryDigest:editor?editor.getAttribute('data-gp-registry-digest')||undefined:undefined};if(kind==='update')payload.activationId=activationId;return payload;}function activationScopeDraft(){var p2=val('gp-activation-scope-preset-2');var preset=val('gp-activation-scope-preset');var value=val('gp-activation-scope-value');var path=val('gp-activation-scope-path');function pushPreviewConds(conds,p,v,ph){if(p==='always'){conds.push({kind:'always'});return true;}if(!v){setResult('warn','Scope value is required for preview.');return false;}if(p==='command-exact'){conds.push({kind:'commandName',match:'exact',value:v});return true;}if(p==='command-prefix'){conds.push({kind:'commandName',match:'prefix',value:v});return true;}if(p==='task-tag'){conds.push({kind:'taskTag',match:ph==='all'?'all':'any',values:v.split(',').map(function(x){return x.trim();}).filter(Boolean)});return true;}if(p==='task-id-pattern'){conds.push({kind:'taskIdPattern',pattern:v});return true;}if(p==='phase-key'){conds.push({kind:'phaseKey',value:v});return true;}if(p==='command-arg-equals'){if(!ph){setResult('warn','Arg path is required for preview.');return false;}conds.push({kind:'commandArgEquals',path:ph,value:scopeScalar(v)});return true;}setResult('warn','Unknown scope preset '+p+'.');return false;}if(p2){var conds=[];if(!pushPreviewConds(conds,preset,value,path))return null;if(!pushPreviewConds(conds,p2,val('gp-activation-scope-value-2'),val('gp-activation-scope-path-2')))return null;if(conds.some(function(c){return c.kind==='always';})&&conds.length>1){setResult('warn','Cannot combine always with another row in preview.');return null;}return {conditions:conds};}if(preset==='always')return {preset:'always'};if(!value){setResult('warn','Scope value is required for preview.');return null;}if(preset==='command-exact')return {preset:'advancedCommand',commandName:value,commandNameMatch:'exact'};if(preset==='command-prefix')return {preset:'advancedCommand',commandName:value,commandNameMatch:'prefix'};if(preset==='task-tag')return {preset:'taskTag',match:path==='all'?'all':'any',values:value.split(',').map(function(x){return x.trim();}).filter(Boolean)};if(preset==='task-id-pattern')return {preset:'task',taskIdPattern:value};if(preset==='phase-key')return {preset:'phase',phaseKey:value};if(preset==='command-arg-equals'){if(!path){setResult('warn','Arg path is required for preview.');return null;}return {preset:'advancedCommand',commandName:val('gp-preview-command')||'run-transition',commandNameMatch:'exact',commandArgPath:path,commandArgValue:scopeScalar(value)};}return null;}function previewPayload(){var commandName=val('gp-preview-command');if(!commandName){setResult('warn','Preview command is required.');return null;}var argsText=val('gp-preview-command-args');var commandArgs={};if(argsText){try{commandArgs=JSON.parse(argsText);}catch(err){setResult('warn','Command args JSON is invalid: '+(err&&err.message?err.message:String(err)));return null;}}var scopeDraft=activationScopeDraft();if(!scopeDraft)return null;var activationId=val('gp-activation-id')||'workspace.activation.draft.preview';var ackStrength=val('gp-activation-ack-strength');var ackToken=val('gp-activation-ack-token');var draftRule={schemaVersion:1,title:activationId,family:val('gp-activation-family-field')||'do',priority:Number(val('gp-activation-priority')||'0'),scopeDraft:scopeDraft};if(ackStrength&&ackStrength!=='none'){if(!ackToken){setResult('warn','Ack token is required for preview acknowledgement.');return null;}draftRule.acknowledgement={strength:ackStrength,token:ackToken};}var first=document.querySelector('[data-gp-activation-artifact]:checked');if(first){draftRule.artifactType=first.getAttribute('data-gp-artifact-type')||undefined;}var payload={schemaVersion:1,commandName:commandName,evalMode:'shadow',currentKitPhase:val('gp-preview-phase'),commandArgs:commandArgs,draftRule:draftRule};var taskId=val('gp-preview-task-id');if(taskId)payload.taskId=taskId;return payload;}function previewEvidence(data){var impact=data.draftImpact||{};var ar=impact.activationReadiness||{};var er=data.enforcementReadiness||{};return {schemaVersion:1,activationId:impact.draftActivationId||val('gp-activation-id')||null,registryContentHash:data.registryContentHash||null,traceId:data.traceId||null,draftImpact:{activationReadinessLevel:ar.level||null,conflictStatus:ar.conflictEntryCount?'conflicts':'none'},enforcementReadiness:er};}function renderPreviewResult(result){var box=el('gp-preview-result');if(!box)return;if(!result||result.ok!==true){box.innerHTML='<section class="gp-callout gp-bad"><b>Preview failed</b><span>'+esc(result&&result.message||result&&result.code||'Unknown failure')+'</span></section>';return;}var data=result.data||{};var impact=data.draftImpact||{};var ar=impact.activationReadiness||{};var counts=data.familyCounts||{};var samples=Array.isArray(impact.samples)?impact.samples:[];var warnings=(impact.broadScopeWarnings||[]).concat(impact.scopeWarnings||[],impact.scopeErrors||[]);var evidence=previewEvidence(data);var level=ar.level||'ok';var verdict=level==='stop_confirm'?'Stop and confirm':level==='warning'?'Warning':'OK';var fam=Array.isArray(ar.sameFamilyConflictSubset)?ar.sameFamilyConflictSubset:[];var conflictHelp=fam.length?'<section class="gp-callout gp-warn"><b>Same-family conflicts (draft)</b><pre style="white-space:pre-wrap;max-height:220px;overflow:auto;font-size:11px">'+esc(JSON.stringify(fam,null,2))+'</pre></section>':'';var sampleRows=samples.slice(0,8).map(function(s){var kind=esc(s.sampleKind||'—');var lab=esc(s.label||s.sampleLabel||'sample');var hit=s.draftVisibleInOverlay===true?'yes':'no';return '<tr><td>'+lab+'</td><td>'+kind+'</td><td>'+esc(s.commandName||'')+'</td><td>'+esc(JSON.stringify(s.baselineFamilyCounts||{}))+'</td><td>'+esc(JSON.stringify(s.overlayFamilyCounts||{}))+'</td><td>'+hit+'</td></tr>';}).join('')||'<tr><td colspan="6">No sampled matches returned.</td></tr>';var warningRows=warnings.slice(0,6).map(function(w){return '<p><b>'+esc(w.code||'warning')+'</b><span>'+esc(w.message||String(w))+'</span></p>';}).join('')||'<p><b>clean</b><span>No broad-scope warnings returned.</span></p>';box.innerHTML='<section class="gp-callout gp-'+(level==='ok'?'ok':level==='warning'?'warn':'bad')+'"><b>'+verdict+'</b><span>'+esc((ar.reasons&&ar.reasons[0]&&ar.reasons[0].message)||impact.scopePlainSummary||'Preview completed.')+'</span></section>'+conflictHelp+'<div class="gp-status-grid"><div><b>Baseline</b><span>'+esc(JSON.stringify(counts))+'</span></div><div><b>Pending ack</b><span>'+esc(String((data.pendingAcknowledgements||[]).length||0))+'</span></div><div><b>Conflicts</b><span>'+esc(JSON.stringify(data.conflictShadowSummary||{}))+'</span></div></div><div class="gp-warning-list">'+warningRows+'</div><p class="gp-muted" style="margin:8px 0 4px">Samples capped at 8 — <b>Matched</b> means the draft appeared in the overlay for that synthetic context.</p><table><thead><tr><th>Label</th><th>Kind</th><th>Command</th><th>Baseline</th><th>Draft</th><th>Matched</th></tr></thead><tbody>'+sampleRows+'</tbody></table><label class="gp-editor-block">Preview evidence<textarea id="gp-preview-evidence" rows="7" readonly>'+esc(JSON.stringify(evidence,null,2))+'</textarea></label>';var r=el('gp-preview-readiness');if(r)r.textContent=verdict;}function sendArtifactMutation(command,payload){setResult('warn','Preparing artifact mutation...');vscode.postMessage({type:'artifactMutation',command:command,payload:payload});}function sendActivationMutation(command,payload){if(!payload)return;setResult('warn','Preparing activation draft save...');vscode.postMessage({type:'activationMutation',command:command,payload:payload});}document.addEventListener('click',function(ev){var dh=el('wc-drawer-host');if(!dh||dh.classList.contains('wc-drawer-host--hidden'))return;var t=ev.target&&ev.target.closest?ev.target.closest('[data-wc-drawer-action]'):null;if(!t||!dh.contains(t))return;var act=t.getAttribute('data-wc-drawer-action');if(act==='backdrop'||act==='cancel'){vscode.postMessage({type:'drawerCancel'});return;}if(act==='submit'){var vals={};dh.querySelectorAll('[data-wc-drawer-field]').forEach(function(el){var fid=el.getAttribute('data-wc-drawer-field');if(!fid)return;vals[fid]=('value'in el&&el.value!=null)?String(el.value):'';});vscode.postMessage({type:'drawerSubmit',values:vals});}});document.addEventListener('keydown',function(ev){if(ev.key!=='Escape')return;var dh=el('wc-drawer-host');if(!dh||dh.classList.contains('wc-drawer-host--hidden'))return;ev.preventDefault();vscode.postMessage({type:'drawerCancel'});});document.body.addEventListener('input',function(ev){var id=ev.target&&ev.target.id;if(id==='gp-artifact-search')filterRows('artifact');if(id==='gp-activation-search')filterRows('activation');if(id==='gp-artifact-content')renderMarkdownPreview();});document.body.addEventListener('change',function(ev){var id=ev.target&&ev.target.id;if(id==='gp-artifact-source'||id==='gp-artifact-status')filterRows('artifact');if(id==='gp-artifact-template'){var tm=parseTemplates();var tid=val('gp-artifact-template');var pick=(tm||[]).filter(function(x){return x&&String(x.id)===tid;})[0];if(pick){setVal('gp-artifact-type',String(pick.artifactType||''));setVal('gp-artifact-title',String(pick.title||''));setVal('gp-artifact-content',String(pick.contentMarkdown||''));renderMarkdownPreview();}}if(id==='gp-activation-family'||id==='gp-activation-status')filterRows('activation');});document.body.addEventListener('click',function(ev){var t=ev.target;if(!t||t.tagName!=='BUTTON')return;var target=t.getAttribute('data-gp-tab-target');if(target){setTab(target);}var tab=t.getAttribute('data-gp-tab');if(tab){setTab(tab);return;}var action=t.getAttribute('data-gp-action');if(action==='refresh'){vscode.postMessage({type:'refresh'});return;}if(action==='select-audit'){setTab('audit');return;}if(action==='new-activation'){clearActivationForm();setTab('activations');return;}if(action==='preview-run-draft'){var pp=previewPayload();if(pp){setTab('preview');setResult('warn','Running Guidance preview...');vscode.postMessage({type:'guidancePreview',payload:pp});}return;}if(action==='preview-copy-evidence'){var evd=el('gp-preview-evidence');if(evd&&navigator.clipboard){navigator.clipboard.writeText(evd.value);setResult('ok','Preview evidence copied.');}else{setResult('warn','Run preview before copying evidence.');}return;}if(action==='validate-registry'){setResult('warn','Validating registry...');vscode.postMessage({type:'validateRegistry'});return;}if(action==='versions-refresh'){setResult('warn','Loading registry versions...');vscode.postMessage({type:'listRegistryVersions'});return;}if(action==='portability-reconcile'){setResult('warn','Running default comparison...');vscode.postMessage({type:'portabilityRun',kind:'portability-reconcile'});return;}if(action==='portability-export'){setResult('warn','Exporting guidance pack...');vscode.postMessage({type:'portabilityRun',kind:'portability-export'});return;}if(action==='portability-import-dry'){setResult('warn','Dry-run import...');vscode.postMessage({type:'portabilityRun',kind:'portability-import-dry'});return;}if(action==='activation-bulk-select-visible'){document.querySelectorAll('[data-gp-activation-bulk]').forEach(function(cb){var tr=cb.closest('[data-gp-activation-row]');if(!tr||tr.style.display==='none')return;cb.checked=true;});return;}if(action==='activation-bulk-clear'){document.querySelectorAll('[data-gp-activation-bulk]').forEach(function(cb){cb.checked=false;});return;}if(action==='activation-bulk-disable'||action==='activation-bulk-retire'){var ids=[];document.querySelectorAll('[data-gp-activation-bulk]:checked').forEach(function(cb){ids.push(cb.getAttribute('data-gp-activation-bulk')||'');});if(!ids.length){setResult('warn','Select at least one activation.');return;}vscode.postMessage({type:'activationBulk',mode:action,activationIds:ids});return;}if(action==='artifact-open'){vscode.postMessage({type:'openArtifact',path:t.getAttribute('data-gp-artifact-path')||''});return;}if(action==='artifact-preview'){setTab('preview');setResult('ok','Preview selected for '+(t.getAttribute('data-gp-artifact-id')||''));return;}if(action==='artifact-edit'||action==='artifact-duplicate'||action==='artifact-retire'){fillArtifactForm(t,action.replace('artifact-',''));return;}if(action==='artifact-preview-form'){renderMarkdownPreview();return;}if(action==='artifact-clear-form'){clearArtifactForm();return;}if(action==='artifact-create'){sendArtifactMutation('cae-create-workspace-artifact',artifactPayload('create'));return;}if(action==='artifact-update'){sendArtifactMutation('cae-update-workspace-artifact',artifactPayload('update'));return;}if(action==='artifact-duplicate-submit'){var sid=val('gp-artifact-source-id');var dupCmd=(sid&&sid.indexOf('workspace.')===0)?'cae-duplicate-artifact-to-workspace':'cae-duplicate-default-artifact';sendArtifactMutation(dupCmd,artifactPayload('duplicate'));return;}if(action==='artifact-retire-submit'){sendArtifactMutation('cae-retire-workspace-artifact',artifactPayload('retire'));return;}if(action==='activation-clear-form'){clearActivationForm();return;}if(action==='activation-edit'||action==='activation-duplicate'){fillActivationForm(t,action.replace('activation-',''));return;}if(action==='activation-create-submit'){sendActivationMutation('cae-create-draft-activation',activationPayload('create'));return;}if(action==='activation-update-submit'){sendActivationMutation('cae-update-draft-activation',activationPayload('update'));return;}if(action&&action.indexOf('activation-')===0){if(action==='activation-preview')setTab('preview');var pe=null;var evd=el('gp-preview-evidence');if(evd&&evd.value){try{pe=JSON.parse(evd.value);}catch(_err){pe=null;}}vscode.postMessage({type:'activationAction',action:action,activationId:t.getAttribute('data-gp-activation-id')||'',previewEvidence:pe});return;}if(action&&action.indexOf('artifact-')===0){vscode.postMessage({type:'artifactAction',action:action,artifactId:t.getAttribute('data-gp-artifact-id')||''});return;}});window.addEventListener('message',function(ev){var m=ev.data;if(m&&m.type==='wcDrawerOpen'&&typeof m.html==='string'){var dh=el('wc-drawer-host');if(!dh)return;dh.innerHTML=m.html;dh.classList.remove('wc-drawer-host--hidden');dh.setAttribute('aria-hidden','false');return;}if(m&&m.type==='wcDrawerClose'){var dh2=el('wc-drawer-host');if(dh2){dh2.innerHTML='';dh2.classList.add('wc-drawer-host--hidden');dh2.setAttribute('aria-hidden','true');}return;}if(m&&m.type==='wcDrawerValidation'&&typeof m.message==='string'){var vv=document.getElementById('wc-drawer-validation');if(vv){vv.textContent=m.message;vv.hidden=false;}return;}if(m&&m.type==='validationResult'){setResult(m.ok?'ok':'warn',m.text||'Validation finished.');}if(m&&m.type==='actionResult'){setResult(m.ok?'ok':'warn',m.text||'Action finished.',m.actions||[]);}if(m&&m.type==='previewResult'){renderPreviewResult(m.result);}if(m&&m.type==='portabilityResult'){var o=el('gp-portability-out');if(o)o.textContent=JSON.stringify(m.result,null,2);setTab('portability');setResult(m.result&&m.result.ok===true?'ok':'warn',String((m.result&&m.result.code)||(m.result&&m.result.message)||'Finished'));return;}if(m&&m.type==='registryVersionsResult'){var pre=el('gp-versions-json');if(pre)pre.textContent=JSON.stringify(m.result,null,2);setResult(m.result&&m.result.ok===true?'ok':'warn',m.result&&m.result.ok?'Registry versions loaded.':String(m.result&&m.result.message||m.result&&m.result.code||'Load failed'));}if(m&&m.type==='selectTab'){setTab(m.tab||'overview');}});filterRows('artifact');filterRows('activation');})();`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon Guidance</title>
  <style>
    html, body { margin: 0; min-height: 100%; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); font-size: 13px; line-height: 1.42; }
    .gp-shell { max-width: 1180px; margin: 0 auto; padding: 18px 22px 28px; }
    .gp-head, .gp-band { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gp-head { border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding-bottom: 14px; }
    .gp-kicker { margin: 0 0 4px; opacity: .72; text-transform: uppercase; font-size: 11px; }
    h1 { margin: 0; font-size: 22px; font-weight: 650; }
    h2 { margin: 0 0 10px; font-size: 15px; }
    p { margin: 4px 0; }
    .gp-primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; padding: 7px 12px; cursor: pointer; }
    .gp-tabs { display: flex; gap: 4px; margin: 16px 0 12px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); }
    .gp-tabs button { background: transparent; color: var(--vscode-foreground); border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; cursor: pointer; }
    .gp-tabs button.is-active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-button-background); }
    .gp-action-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 10px; }
    .gp-action-row button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, var(--vscode-widget-border)); border-radius: 6px; padding: 7px 12px; cursor: pointer; }
    .gp-action-row button.gp-primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .gp-inline-result { min-height: 18px; margin: 4px 0 12px; opacity: .88; }
    .gp-inline-result.gp-ok, .gp-inline-result.gp-warn { border: 0; }
    .gp-tab-panel { display: none; }
    .gp-tab-panel.is-active { display: block; }
    .gp-callout { display: flex; gap: 12px; align-items: baseline; margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-left-width: 4px; }
    .gp-callout span { opacity: .84; }
    .gp-ok { border-color: var(--vscode-testing-iconPassed, #3fb950); }
    .gp-warn { border-color: var(--vscode-inputValidation-warningBorder, #d29922); }
    .gp-bad { border-color: var(--vscode-errorForeground, #f85149); }
    .gp-pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .gp-pill { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 999px; padding: 4px 8px; }
    .gp-pill b { font-weight: 650; }
    .gp-grid { display: grid; gap: 10px; margin: 12px 0; }
    .gp-status-grid { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 1px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); margin: 12px 0; }
    .gp-status-grid div { padding: 9px 11px; background: var(--vscode-sideBar-background); }
    .gp-status-grid b, .gp-status-grid span { display: block; }
    .gp-status-grid span { margin-top: 4px; word-break: break-word; }
    .gp-warning-list { border-left: 3px solid var(--vscode-inputValidation-warningBorder, #d29922); padding-left: 10px; margin: 10px 0 12px; }
    .gp-warning-list p { display: flex; gap: 8px; margin: 4px 0; }
    .gp-table-tools { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 150px; gap: 8px; margin: 10px 0; }
    .gp-table-tools input, .gp-table-tools select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 4px; padding: 6px 8px; }
    .gp-source { display: inline-block; padding: 2px 6px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 999px; }
    .gp-source-default { opacity: .78; }
    .gp-source-workspace, .gp-source-override { border-color: var(--vscode-focusBorder); }
    .gp-row-actions { display: flex; flex-wrap: wrap; gap: 4px; min-width: 220px; }
    .gp-row-actions button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, var(--vscode-widget-border)); border-radius: 4px; padding: 3px 6px; cursor: pointer; font-size: 11px; }
    .gp-row-actions button:disabled { opacity: .42; cursor: not-allowed; }
    .gp-group-row td { background: var(--vscode-sideBar-background); font-weight: 700; text-transform: uppercase; font-size: 11px; opacity: .82; }
    .gp-bad-text { color: var(--vscode-errorForeground); }
    .gp-editor { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 12px; margin: 12px 0; }
    .gp-form-grid { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 8px; }
    .gp-form-grid label, .gp-editor-block { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
    .gp-form-grid input, .gp-form-grid select, .gp-editor-block input, .gp-editor-block textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 4px; padding: 6px 8px; font: inherit; font-weight: 400; }
    .gp-editor-block { margin-top: 8px; }
    .gp-markdown-preview { border: 1px dashed var(--vscode-widget-border, rgba(127,127,127,.35)); min-height: 36px; padding: 8px 10px; margin-top: 8px; }
    .gp-markdown-preview h3, .gp-markdown-preview h4 { margin: 0 0 6px; }
    .gp-picker { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 8px; margin: 10px 0; }
    .gp-picker-group { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 8px; }
    .gp-picker-group legend { font-weight: 700; font-size: 11px; text-transform: uppercase; }
    .gp-pick { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 5px 0; }
    .gp-pick b { font-size: 11px; font-weight: 500; opacity: .78; }
    .gp-grid-4 { grid-template-columns: repeat(4, minmax(120px, 1fr)); }
    .gp-grid-3 { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
    .gp-grid div { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 10px 12px; }
    .gp-grid b, .gp-grid span { display: block; }
    .gp-grid span { margin-top: 5px; font-size: 20px; font-weight: 650; }
    .gp-muted { opacity: .74; }
    .gp-versions-dump { margin: 12px 0 0; padding: 10px 12px; max-height: 420px; overflow: auto; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 8px 9px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; opacity: .76; }
    .gp-bulk-col { width: 30px; text-align: center; }
    small { display: block; opacity: .74; margin-top: 3px; }
    code { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .wc-drawer-host { position: fixed; inset: 0; z-index: 20000; pointer-events: none; }
    .wc-drawer-host:not(.wc-drawer-host--hidden) { pointer-events: auto; }
    .wc-drawer-host--hidden { display: none !important; }
    .wc-drawer-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
    .wc-drawer-panel {
      position: absolute; left: 8px; right: 8px; bottom: 8px; max-height: 78vh; overflow: auto;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      border-radius: 8px; padding: 10px 12px 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    .wc-drawer-title { margin: 0 0 6px 0; font-size: 14px; font-weight: 600; }
    .wc-drawer-desc { margin: 0 0 10px 0; opacity: 0.9; line-height: 1.35; }
    .wc-drawer-validation { margin: 0 0 8px 0; padding: 6px 8px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .wc-drawer-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    .wc-drawer-field-label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 4px; }
    .wc-drawer-input, .wc-drawer-textarea, .wc-drawer-select {
      width: 100%; box-sizing: border-box; font-family: var(--vscode-font-family); font-size: 12px;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(127,127,127,.35)); border-radius: 4px; padding: 4px 6px;
    }
    .wc-drawer-textarea { resize: vertical; min-height: 48px; }
    .wc-drawer-summary-body { font-size: 12px; line-height: 1.4; padding: 6px 8px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .wc-drawer-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .wc-drawer-btn { padding: 4px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; }
    .wc-drawer-btn-secondary {
      color: var(--vscode-foreground); background: transparent;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
    }
    .wc-drawer-btn-primary {
      color: var(--vscode-button-foreground); background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    @media (max-width: 720px) { .gp-head, .gp-band { align-items: flex-start; flex-direction: column; } .gp-grid-4, .gp-grid-3, .gp-status-grid, .gp-table-tools, .gp-form-grid, .gp-picker { grid-template-columns: 1fr; } .gp-tabs { overflow-x: auto; } }
  </style>
</head>
<body>${inner}<div id="wc-drawer-host" class="wc-drawer-host wc-drawer-host--hidden" aria-hidden="true"></div><script>${bootstrap}</script></body>
</html>`;
  }
}
