import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandClient } from "../../runtime/command-client.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";
import type { DrawerFormSpec, DrawerValidationResult } from "../dashboard/dashboard-input-drawer.js";
import {
  buildGuidanceAckDrawerSpec,
  buildGuidanceRegistryVersionMutationDrawerSpec,
  buildGuidanceShadowFeedbackDrawerSpec,
  renderDrawerFormHtml,
  validateGuidanceAckSubmit,
  validateGuidanceRegistryVersionMutationSubmit,
  validateGuidanceShadowFeedbackSubmit
} from "../dashboard/dashboard-input-drawer.js";
import {
  renderGuidanceActionResultInnerHtml,
  renderGuidancePreviewInnerHtml,
  renderGuidanceTraceDetailInnerHtml,
  renderActiveSetStatusHtml,
  renderManageVersionsHtml,
  renderManageStatusHtml,
  renderHistoryTabHtml
} from "./render-guidance.js";
import {
  buildDraftGuidanceRulePayload,
  draftStrengthToFamily,
  withAcknowledgement,
  type WizardScopePreset
} from "./guidance-wizard-draft.js";

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

type CatalogNavItem = {
  displayTitle: string;
  activationId: string;
  appliesWhen: string;
};

function catalogItemsFromProduct(product: unknown): CatalogNavItem[] {
  if (!product || typeof product !== "object") return [];
  const rc = asRecord(asRecord(product).rulesCatalog);
  const items = Array.isArray(rc.items) ? rc.items : [];
  const out: CatalogNavItem[] = [];
  for (const raw of items.slice(0, 40)) {
    const row = asRecord(raw);
    const dbg = asRecord(row.debug);
    const activationId = typeof dbg.activationId === "string" ? dbg.activationId : "";
    if (!activationId) continue;
    const displayTitle =
      typeof row.displayTitle === "string" && row.displayTitle.trim()
        ? row.displayTitle.trim().slice(0, 200)
        : activationId;
    const appliesWhen = typeof row.appliesWhen === "string" ? row.appliesWhen.slice(0, 400) : "";
    out.push({ displayTitle, activationId, appliesWhen });
  }
  return out;
}

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

function buildDraftPreviewPayloadFromMessage(
  msg: Record<string, unknown>
): { commandName: string; taskId: string; draftRule: Record<string, unknown> } {
  const commandName =
    typeof msg.commandName === "string" && msg.commandName.trim() ? msg.commandName.trim() : "get-next-actions";
  const taskId = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
  const msgType = typeof msg.type === "string" ? msg.type : "";

  if (msgType === "draftPreview") {
    const sourceTitleRaw = typeof msg.sourceTitle === "string" ? msg.sourceTitle.trim() : "";
    const sourceTitle = sourceTitleRaw.length ? sourceTitleRaw.slice(0, 256) : "Draft Guidance change";
    const triggerRaw = typeof msg.trigger === "string" ? msg.trigger.trim() : "";
    const strengthRaw =
      typeof msg.strength === "string" && msg.strength.trim() ? msg.strength.trim() : "advisory";
    const workflowNameCandidate = triggerRaw.length ? triggerRaw : commandName;
    return {
      commandName,
      taskId,
      draftRule: {
        schemaVersion: 1,
        title: sourceTitle,
        artifactType: "playbook",
        family: draftStrengthToFamily(strengthRaw),
        priority: 750,
        scopeDraft:
          workflowNameCandidate === "__always__"
            ? { preset: "always" }
            : { preset: "workflow", workflowName: workflowNameCandidate }
      }
    };
  }

  const title =
    typeof msg.title === "string" && msg.title.trim() ? msg.title.trim().slice(0, 256) : "Draft Guidance rule";
  const strengthRaw =
    typeof msg.strength === "string" && msg.strength.trim() ? msg.strength.trim() : "advisory";
  const prio = typeof msg.priority === "number" ? msg.priority : Number(msg.priority ?? NaN);
  const presetRaw = typeof msg.scopePreset === "string" ? msg.scopePreset.trim() : "workflow";
  const allowed: WizardScopePreset[] = ["workflow", "always", "phase", "task", "completing_task"];
  const scopePreset = (allowed.includes(presetRaw as WizardScopePreset) ? presetRaw : "workflow") as WizardScopePreset;
  const workflowName =
    typeof msg.workflowName === "string" && msg.workflowName.trim() ? msg.workflowName.trim() : undefined;
  const phaseKey =
    typeof msg.phaseKey === "string" && msg.phaseKey.trim() ? msg.phaseKey.trim() : undefined;
  const scopeTaskId =
    typeof msg.scopeTaskId === "string" && msg.scopeTaskId.trim() ? msg.scopeTaskId.trim() : undefined;
  const ackStrength = typeof msg.ackStrength === "string" ? msg.ackStrength.trim() : undefined;

  let built = buildDraftGuidanceRulePayload({
    title,
    strengthRaw,
    priority: Number.isFinite(prio) ? prio : 750,
    scopePreset,
    workflowName:
      workflowName ?? (scopePreset === "workflow" || scopePreset === "completing_task" ? commandName : undefined),
    phaseKey,
    scopeTaskId
  });
  const traceHint = typeof msg.checkTraceId === "string" ? msg.checkTraceId.trim() : taskId || commandName;
  built = withAcknowledgement(built, ackStrength, traceHint.length ? traceHint : undefined);
  return { commandName, taskId, draftRule: built };
}

export class GuidanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.guidance";

  private view?: vscode.WebviewView;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private guidanceRegistryMutationAllowed = false;
  private guidanceRegistryMutationDenial: string | null = null;
  private guidanceSidebarDrawer:
    | {
        resolve: (values: Record<string, string> | null) => void;
        validateSubmit?: (values: Record<string, string>) => DrawerValidationResult;
      }
    | undefined;

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
      if (msg?.type === "drawerSubmit") {
        const raw = (msg as { values?: unknown }).values;
        await this.onSidebarDrawerSubmit(
          webview,
          raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
        );
        return;
      }
      if (msg?.type === "drawerCancel") {
        await this.onSidebarDrawerCancel(webview);
        return;
      }
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
      if (msg?.type === "wizardDraftPreview" || msg?.type === "draftPreview") {
        const m = msg as Record<string, unknown>;
        const { commandName, taskId, draftRule } = buildDraftPreviewPayloadFromMessage(m);

        const args: Record<string, unknown> = {
          schemaVersion: 1,
          commandName,
          evalMode: "shadow",
          draftRule
        };
        if (taskId) args.taskId = taskId;
        const r = await this.client.run("cae-guidance-preview", args);
        await webview.postMessage({ type: "setPreview", html: renderGuidancePreviewInnerHtml(r) });

        let readinessLevel: string | undefined;
        if (r.ok && r.data && typeof r.data === "object") {
          const di = asRecord(asRecord(r.data).draftImpact);
          const ar = di.activationReadiness ? asRecord(di.activationReadiness) : undefined;
          readinessLevel = typeof ar?.level === "string" ? (ar.level as string) : undefined;
        }
        await webview.postMessage({
          type: "setDraftWizardOutcome",
          previewOk: r.ok === true,
          readinessLevel: readinessLevel ?? null
        });
      }
      if (msg?.type === "copyWizardDraft") {
        const m = { ...(msg as Record<string, unknown>), type: "wizardDraftPreview" };
        const { draftRule } = buildDraftPreviewPayloadFromMessage(m);
        try {
          const text = JSON.stringify(draftRule, null, 2);
          await vscode.env.clipboard.writeText(text);
          await webview.postMessage({
            type: "showStatus",
            kind: "ok",
            text: "Copied draft rule JSON for handoff."
          });
        } catch (_e) {
          await webview.postMessage({
            type: "showStatus",
            kind: "err",
            text: "Could not copy draft JSON."
          });
        }
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
    this.cancelSidebarDrawer(webview);
    const summary = await this.client.run("cae-dashboard-summary", { schemaVersion: 1 });
    const product =
      summary.ok && summary.data && typeof summary.data === "object"
        ? asRecord(summary.data).guidanceProduct
        : undefined;
    await webview.postMessage({ type: "setActiveSetStatus", html: renderActiveSetStatusHtml(summary) });
    await webview.postMessage({ type: "setManageVersions", html: renderManageVersionsHtml(summary) });
    await webview.postMessage({ type: "setManageStatus", html: renderManageStatusHtml(summary) });
    await webview.postMessage({ type: "setHistory", html: renderHistoryTabHtml(summary) });
    const mut = product ? asRecord(asRecord(product).mutationCapability) : undefined;
    this.guidanceRegistryMutationAllowed = mut?.canMutate === true;
    this.guidanceRegistryMutationDenial = typeof mut?.denialReason === "string" ? mut.denialReason : null;
    const canMutate = this.guidanceRegistryMutationAllowed;
    const denialReason = this.guidanceRegistryMutationDenial;
    await webview.postMessage({ type: "setGovernance", canMutate, denialReason });
    await this.pushChoices(webview, workflowChoicesFromProduct(product), catalogItemsFromProduct(product));
  }

  private async pushChoices(
    webview: vscode.Webview,
    productWorkflows: WorkflowChoice[] = [],
    catalogItems: CatalogNavItem[] = []
  ): Promise<void> {
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
      workflows,
      catalogItems
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

  private cancelSidebarDrawer(webview: vscode.Webview): void {
    const pending = this.guidanceSidebarDrawer;
    if (!pending) {
      return;
    }
    this.guidanceSidebarDrawer = undefined;
    void webview.postMessage({ type: "wcDrawerClose" });
    pending.resolve(null);
  }

  private async openSidebarDrawer(
    webview: vscode.Webview,
    spec: DrawerFormSpec,
    validateSubmit?: (values: Record<string, string>) => DrawerValidationResult
  ): Promise<Record<string, string> | null> {
    return await new Promise((resolve) => {
      this.guidanceSidebarDrawer = { resolve, validateSubmit };
      void webview.postMessage({ type: "wcDrawerOpen", html: renderDrawerFormHtml(spec) });
    });
  }

  private async onSidebarDrawerSubmit(
    webview: vscode.Webview,
    raw: Record<string, unknown>
  ): Promise<void> {
    const pending = this.guidanceSidebarDrawer;
    if (!pending) {
      return;
    }
    const strVals: Record<string, string> = {};
    for (const k of Object.keys(raw)) {
      strVals[k] = String(raw[k] ?? "");
    }
    if (pending.validateSubmit) {
      const v = pending.validateSubmit(strVals);
      if (!v.ok) {
        await webview.postMessage({ type: "wcDrawerValidation", message: v.error });
        return;
      }
    }
    this.guidanceSidebarDrawer = undefined;
    await webview.postMessage({ type: "wcDrawerClose" });
    pending.resolve(strVals);
  }

  private async onSidebarDrawerCancel(webview: vscode.Webview): Promise<void> {
    const pending = this.guidanceSidebarDrawer;
    if (!pending) {
      return;
    }
    this.guidanceSidebarDrawer = undefined;
    await webview.postMessage({ type: "wcDrawerClose" });
    pending.resolve(null);
  }

  private async recordAck(webview: vscode.Webview, msg: Record<string, unknown>): Promise<void> {
    const traceId = typeof msg.traceId === "string" ? msg.traceId.trim() : "";
    const activationId = typeof msg.activationId === "string" ? msg.activationId.trim() : "";
    const ackToken = typeof msg.ackToken === "string" ? msg.ackToken.trim() : "";
    if (!traceId || !activationId || !ackToken) return;
    const defaultActor = this.defaultActorFromEnvironment() ?? "dashboard";
    const submitted = await this.openSidebarDrawer(
      webview,
      buildGuidanceAckDrawerSpec({ traceId, activationId, defaultActor }),
      validateGuidanceAckSubmit
    );
    if (!submitted) return;
    const actor = (submitted.actor ?? "").trim() || defaultActor;
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
    const defaultActor = this.defaultActorFromEnvironment() ?? "dashboard";
    const submitted = await this.openSidebarDrawer(
      webview,
      buildGuidanceShadowFeedbackDrawerSpec({
        signal,
        traceId,
        activationId,
        commandName,
        defaultActor
      }),
      validateGuidanceShadowFeedbackSubmit
    );
    if (!submitted) return;
    const actor = (submitted.actor ?? "").trim() || defaultActor;
    const note = (submitted.note ?? "").trim();
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
    if (note) payload.note = note;
    const r = await this.client.run("cae-record-shadow-feedback", payload);
    await webview.postMessage({
      type: "setActionResult",
      html: renderGuidanceActionResultInnerHtml({ action: `${signal === "useful" ? "Useful" : "Noisy"} feedback`, result: r })
    });
    await this.pushSummary(webview);
  }

  private async recordVersionAction(webview: vscode.Webview, msg: Record<string, unknown>): Promise<void> {
    const clearBusy = async (): Promise<void> => {
      await webview.postMessage({ type: "clearVersionActionBusy" });
    };
    try {
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

      if (!this.guidanceRegistryMutationAllowed) {
        await vscode.window.showWarningMessage(
          this.guidanceRegistryMutationDenial ??
            "Guidance registry mutations are blocked for this workspace (check kit.cae.registryStore and kit.cae.adminMutations).",
          { modal: true }
        );
        return;
      }

      const envActor = this.defaultActorFromEnvironment() ?? "";
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const draftDefault = `cae.reg.draft.${stamp}`;
      const needsDraft = command === "cae-clone-registry-version";
      if (needsDraft && (!versionId || versionId === "n/a")) {
        return;
      }
      const targetSummaryPlain =
        command === "cae-activate-registry-version"
          ? `Activate version: ${versionId || "(missing)"}`
          : command === "cae-rollback-registry-version"
            ? "Roll back to the immediately previous guidance-set version (kit selects the target)."
            : `Clone from ${versionId} into a new draft (enter draft id below).`;

      const submitted = await this.openSidebarDrawer(
        webview,
        buildGuidanceRegistryVersionMutationDrawerSpec({
          command,
          actionLabel: action,
          targetSummaryPlain,
          needsDraftVersionId: needsDraft,
          draftVersionDefault: draftDefault,
          defaultActor: envActor || "dashboard"
        }),
        (vals) => validateGuidanceRegistryVersionMutationSubmit(vals, needsDraft)
      );
      if (!submitted) return;
      const rationale = (submitted.rationale ?? "").trim();
      const actor = (submitted.actor ?? "").trim();
      if (!actor) {
        await vscode.window.showErrorMessage(
          "Actor is required (set Git email, WORKSPACE_KIT_ACTOR, or enter a value in the drawer)."
        );
        return;
      }
      let toVersionIdForConfirm = "";
      if (needsDraft) {
        toVersionIdForConfirm = (submitted.draftVersionId ?? "").trim();
      }

      const payload: Record<string, unknown> = {
        schemaVersion: 1,
        actor: actor.trim(),
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
        payload.fromVersionId = versionId;
        payload.toVersionId = toVersionIdForConfirm;
        payload.setActive = false;
      }

      const r = await this.client.run(command, payload);
      await webview.postMessage({
        type: "setActionResult",
        html: renderGuidanceActionResultInnerHtml({
          action: `Guidance set ${action}`,
          result: r,
          mutationContext: {
            kind: "registry-mutation",
            commandName: command,
            actor: actor.trim()
          }
        })
      });
      await this.pushSummary(webview);
    } finally {
      await clearBusy();
    }
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

  private buildHtmlShell(webview: vscode.Webview): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");
    const bootstrap = `(function(){
  var vscode = acquireVsCodeApi();
  var previewRoot = document.getElementById('guidance-preview-root');
  var traceDetailRoot = document.getElementById('guidance-trace-detail-root');
  var actionResultRoot = document.getElementById('guidance-action-result-root');
  var historyRoot = document.getElementById('guidance-history-root');
  var manageStatusEl = document.getElementById('gd-manage-status');
  var versionsRoot = document.getElementById('guidance-versions-root');
  var statusDetailRoot = document.getElementById('guidance-status-root');
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
  function gv(id) {
    var e = document.getElementById(id);
    return e && e.value != null ? String(e.value).trim() : '';
  }
  function gwDraftPreviewBtn() {
    return document.getElementById('gw-draft-preview');
  }
  function updateScopeRows() {
    var preset = gv('gw-scope-preset');
    var rowW = document.getElementById('gw-wf-row');
    var rowPh = document.getElementById('gw-phase-row');
    var rowTs = document.getElementById('gw-task-row');
    if (rowW) rowW.style.display = preset === 'workflow' ? '' : 'none';
    if (rowPh) rowPh.style.display = preset === 'phase' || preset === 'completing_task' ? '' : 'none';
    if (rowTs) rowTs.style.display = preset === 'task' || preset === 'completing_task' ? '' : 'none';
  }
  function activateTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.gd-tab').forEach(function(btn) {
      btn.classList.toggle('gd-tab-active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.gd-panel').forEach(function(panel) {
      panel.style.display = panel.id === 'panel-' + tabName ? 'block' : 'none';
    });
  }
  function activateSubsection(name) {
    document.querySelectorAll('.gd-subsection-btn').forEach(function(btn) {
      btn.classList.toggle('gd-subsection-active', btn.getAttribute('data-subsection') === name);
    });
    document.querySelectorAll('.gd-subsection').forEach(function(el) {
      el.style.display = el.id === 'subsection-' + name ? 'block' : 'none';
    });
  }
  function renderCatalogNav(items) {
    var root = document.getElementById('gw-catalog-rows');
    if (!root) return;
    root.textContent = '';
    if (!items || items.length === 0) return;
    (Array.isArray(items) ? items : []).slice(0, 40).forEach(function(it) {
      var wrap = document.createElement('div');
      wrap.className = 'gw-catalog-row gd-row gd-row-compact';
      wrap.style.flexWrap = 'wrap';
      var lblWrap = document.createElement('div');
      lblWrap.style.flex = '1';
      lblWrap.style.minWidth = '120px';
      var strong = document.createElement('strong');
      strong.style.fontSize = '11px';
      strong.textContent = String(it.displayTitle || '');
      lblWrap.appendChild(strong);
      if (it.appliesWhen) {
        var when = document.createElement('div');
        when.className = 'gd-muted';
        when.style.marginTop = '4px';
        when.style.fontSize = '10px';
        when.textContent = String(it.appliesWhen);
        lblWrap.appendChild(when);
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wc-btn wc-btn-md wc-btn-secondary';
      b.setAttribute('data-wc-action', 'wizard-catalog-use');
      b.setAttribute('data-catalog-title', String(it.displayTitle || ''));
      b.setAttribute('data-catalog-when', String(it.appliesWhen || ''));
      b.setAttribute('data-activation-id', String(it.activationId || ''));
      b.textContent = 'Use as template';
      wrap.appendChild(lblWrap);
      wrap.appendChild(b);
      root.appendChild(wrap);
    });
  }
  function renderChoices(tasks, workflows, catalogItems) {
    if (taskSelect) {
      taskSelect.textContent = '';
      taskSelect.appendChild(option('Manual / no task', ''));
      (Array.isArray(tasks) ? tasks : []).forEach(function(task) {
        var label = String(task.id || '') + (task.title ? ' \u2014 ' + String(task.title) : '');
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
        var opt = option(workflowLabel(w), String(w.name || ''), String(w.moduleId || '') + (w.description ? ' \u2014 ' + String(w.description) : ''));
        workflowList.appendChild(opt);
      });
    }
    renderCatalogNav(catalogItems || []);
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
  function wizardPayload() {
    var taskEl = document.getElementById('gd-task-id');
    var cmdEl = document.getElementById('gd-command-name');
    var prioEl = document.getElementById('gw-priority');
    var pri = prioEl && prioEl.value ? parseInt(prioEl.value, 10) : NaN;
    var priority = Number.isFinite(pri) ? pri : 750;
    return {
      taskId: taskEl && taskEl.value || '',
      commandName: cmdEl && cmdEl.value || '',
      title: gv('gw-draft-title'),
      strength: gv('gw-strength'),
      priority: priority,
      scopePreset: gv('gw-scope-preset') || 'workflow',
      workflowName: gv('gw-wf-name'),
      phaseKey: gv('gw-phase-key'),
      scopeTaskId: gv('gw-scope-task-id'),
      ackStrength: gv('gw-ack-strength'),
      checkTraceId: gv('gw-check-record')
    };
  }
  function wizardPreview() {
    setBusy(gwDraftPreviewBtn(), true, 'Previewing...');
    showStatus('info', 'Previewing draft impact against the current workflow...');
    var p = wizardPayload();
    p.type = 'wizardDraftPreview';
    vscode.postMessage(p);
  }
  function wizardReset() {
    setInputValue('gw-draft-title', '');
    setInputValue('gw-strength', 'advisory');
    setInputValue('gw-scope-preset', 'workflow');
    setInputValue('gw-wf-name', '');
    setInputValue('gw-phase-key', '');
    setInputValue('gw-scope-task-id', '');
    setInputValue('gw-priority', '750');
    setInputValue('gw-ack-strength', 'none');
    setInputValue('gw-check-record', '');
    setInputValue('gw-trigger-id', '');
    setInputValue('gw-draft-notes', '');
    updateScopeRows();
    var copyBtn = document.getElementById('gw-copy-draft-json');
    if (copyBtn) copyBtn.disabled = true;
    var readiness = document.getElementById('gw-readiness-note');
    if (readiness) readiness.textContent = '';
    showStatus('info', 'Draft wizard reset.');
  }
  function fillDraftFromButton(button) {
    var cmd = button.getAttribute('data-command-name') || gv('gd-command-name');
    setInputValue('gw-wf-name', cmd);
    setInputValue('gw-check-record', button.getAttribute('data-trace-id') || '');
    setInputValue('gw-trigger-id', button.getAttribute('data-activation-id') || '');
    var titleEl = document.getElementById('gw-draft-title');
    if (titleEl && !titleEl.value) titleEl.value = 'Guidance update from current check';
    setInputValue('gw-scope-preset', 'workflow');
    updateScopeRows();
    activateTab('manage');
    activateSubsection('wizard');
    showStatus('ok', 'Improve context filled \u2014 review wizard fields, then Preview draft impact.');
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
  document.querySelectorAll('.gd-tab').forEach(function(btn) {
    btn.addEventListener('click', function() { activateTab(btn.getAttribute('data-tab') || 'check'); });
  });
  document.querySelectorAll('.gd-subsection-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { activateSubsection(btn.getAttribute('data-subsection') || 'wizard'); });
  });
  if (taskSelect) taskSelect.addEventListener('change', function() { setInputValue('gd-task-id', taskSelect.value || ''); });
  if (workflowSelect) workflowSelect.addEventListener('change', function() { if (workflowSelect.value) setInputValue('gd-command-name', workflowSelect.value); });
  document.getElementById('gw-scope-preset') && document.getElementById('gw-scope-preset').addEventListener('change', updateScopeRows);
  document.getElementById('gd-refresh') && document.getElementById('gd-refresh').addEventListener('click', function(){ requestLoad(false); });
  document.getElementById('gd-preview') && document.getElementById('gd-preview').addEventListener('click', runPreview);
  document.getElementById('gw-draft-preview') && document.getElementById('gw-draft-preview').addEventListener('click', wizardPreview);
  document.getElementById('gw-draft-reset') && document.getElementById('gw-draft-reset').addEventListener('click', wizardReset);
  document.getElementById('gw-new-rule') && document.getElementById('gw-new-rule').addEventListener('click', wizardReset);
  document.getElementById('gw-copy-draft-json') && document.getElementById('gw-copy-draft-json').addEventListener('click', function(){
    var p = wizardPayload();
    p.type = 'copyWizardDraft';
    vscode.postMessage(p);
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
    if (act === 'wizard-catalog-use') {
      var ttl = t.getAttribute('data-catalog-title') || '';
      var when = t.getAttribute('data-catalog-when') || '';
      var aid = t.getAttribute('data-activation-id') || '';
      setInputValue('gw-draft-title', ttl);
      setInputValue('gw-scope-preset', 'workflow');
      var cmd = gv('gd-command-name');
      if (cmd) setInputValue('gw-wf-name', cmd);
      var notesEl = document.getElementById('gw-draft-notes');
      var ln = notesEl && notesEl.value ? String(notesEl.value) : '';
      var nl = String.fromCharCode(10);
      var parts = [];
      if (ttl) parts.push('Title (catalog): ' + ttl);
      if (when) parts.push('Applies when: ' + when);
      if (aid) parts.push('Activation id: ' + aid);
      var block = parts.join(nl);
      if (notesEl) notesEl.value = ln ? (ln + nl + nl + block) : block;
      updateScopeRows();
      activateTab('manage');
      activateSubsection('wizard');
      showStatus('info', 'Template applied \u2014 tweak scope and Preview draft impact.');
      scrollToPanel(document.getElementById('gd-manage-draft'));
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
  document.addEventListener('click', function(ev) {
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-wc-drawer-action]') : null;
    if (!t || !dh.contains(t)) return;
    var act = t.getAttribute('data-wc-drawer-action');
    if (act === 'backdrop' || act === 'cancel') { vscode.postMessage({ type: 'drawerCancel' }); return; }
    if (act === 'submit') {
      var vals = {};
      dh.querySelectorAll('[data-wc-drawer-field]').forEach(function(el) {
        var fid = el.getAttribute('data-wc-drawer-field');
        if (!fid) return;
        vals[fid] = ('value' in el && el.value != null) ? String(el.value) : '';
      });
      vscode.postMessage({ type: 'drawerSubmit', values: vals });
    }
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    ev.preventDefault();
    vscode.postMessage({ type: 'drawerCancel' });
  });
  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'wcDrawerOpen' && typeof m.html === 'string') {
      var dh = document.getElementById('wc-drawer-host');
      if (!dh) return;
      if (!String(m.html).trim()) return;
      dh.innerHTML = m.html;
      dh.classList.remove('wc-drawer-host--hidden');
      dh.setAttribute('aria-hidden', 'false');
      return;
    }
    if (m && m.type === 'wcDrawerClose') {
      var dh2 = document.getElementById('wc-drawer-host');
      if (dh2) { dh2.innerHTML = ''; dh2.classList.add('wc-drawer-host--hidden'); dh2.setAttribute('aria-hidden', 'true'); }
      return;
    }
    if (m && m.type === 'wcDrawerValidation' && typeof m.message === 'string') {
      var vv = document.getElementById('wc-drawer-validation');
      if (vv) { vv.textContent = m.message; vv.hidden = false; }
      return;
    }
    if (m && m.type === 'poke') {
      requestLoad(true);
      return;
    }
    if (m && m.type === 'setActiveSetStatus' && typeof m.html === 'string') {
      if (manageStatusEl) manageStatusEl.innerHTML = m.html;
      setBusy(refreshBtn, false);
      showStatus('info', 'Guidance status loaded.');
      return;
    }
    if (m && m.type === 'setManageVersions' && typeof m.html === 'string') {
      if (versionsRoot) versionsRoot.innerHTML = m.html;
      return;
    }
    if (m && m.type === 'setManageStatus' && typeof m.html === 'string') {
      if (statusDetailRoot) statusDetailRoot.innerHTML = m.html;
      return;
    }
    if (m && m.type === 'setHistory' && typeof m.html === 'string') {
      if (historyRoot) historyRoot.innerHTML = m.html;
      return;
    }
    if (m && m.type === 'setChoices') {
      renderChoices(m.tasks, m.workflows, m.catalogItems);
      return;
    }
    if (m && m.type === 'setGovernance') {
      var wrap = document.getElementById('gw-governance-wrap');
      var gov = document.getElementById('gw-governance-panel');
      var copyHint = document.getElementById('gw-handoff-hint');
      var can = m.canMutate === true;
      if (wrap) wrap.style.display = can ? 'none' : 'block';
      if (gov) {
        var dr = m.denialReason || 'This workspace cannot mutate the CAE registry from the extension.';
        gov.textContent = 'Governance: ' + dr;
      }
      if (copyHint) {
        copyHint.textContent = can
          ? 'Preview first. Publishing uses version controls in the Versions tab.'
          : 'Registry updates are blocked here \u2014 use Copy draft JSON after a successful preview for handoff.';
      }
      return;
    }
    if (m && m.type === 'setPreview' && previewRoot && typeof m.html === 'string') {
      previewRoot.innerHTML = m.html;
      setBusy(previewBtn, false);
      setBusy(gwDraftPreviewBtn(), false);
      showStatus('ok', 'Pre-flight result updated.');
      scrollToPanel(previewRoot);
      return;
    }
    if (m && m.type === 'setTraceDetail' && traceDetailRoot && typeof m.html === 'string') {
      activateTab('check');
      traceDetailRoot.innerHTML = m.html;
      document.querySelectorAll('[data-wc-action="guidance-explain"]').forEach(function(btn){ setBusy(btn, false); });
      showStatus('info', 'Trace detail loaded.');
      scrollToPanel(traceDetailRoot);
      return;
    }
    if (m && m.type === 'setActionResult' && actionResultRoot && typeof m.html === 'string') {
      activateTab('check');
      actionResultRoot.innerHTML = m.html;
      document.querySelectorAll('button[disabled]').forEach(function(btn){ setBusy(btn, false); });
      showStatus('info', 'Guidance action finished.');
      scrollToPanel(actionResultRoot);
      return;
    }
    if (m && m.type === 'clearVersionActionBusy') {
      document.querySelectorAll('[data-wc-action^="guidance-version"]').forEach(function(btn){ setBusy(btn, false); });
      return;
    }
    if (m && m.type === 'setDraftWizardOutcome') {
      var copyBtn = document.getElementById('gw-copy-draft-json');
      if (copyBtn) copyBtn.disabled = m.previewOk !== true;
      var readiness = document.getElementById('gw-readiness-note');
      if (readiness) {
        if (m.previewOk && m.readinessLevel) {
          readiness.textContent = 'Activation readiness level: ' + String(m.readinessLevel);
        } else if (m.previewOk) {
          readiness.textContent = '';
        } else {
          readiness.textContent = 'Fix the draft and preview again before copying JSON.';
        }
      }
      return;
    }
    if (m && m.type === 'showStatus') {
      showStatus(m.kind || 'info', m.text || '');
    }
  });
  updateScopeRows();
  requestLoad(false);
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    ${WC_BASE_CSS}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; overflow: hidden; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 12px; display: flex; flex-direction: column; background: var(--vscode-sideBar-background); }
    h1 { font-size: 14px; margin: 0 0 2px; font-weight: 700; }
    h2 { font-size: 12px; margin: 0; font-weight: 600; }
    h3 { font-size: 11px; margin: 0; font-weight: 600; }
    .gd-muted { opacity: 0.75; line-height: 1.35; }
    .gd-toolbar, .gd-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .gd-toolbar { margin: 6px 0; }
    .gd-field { display: flex; flex-direction: column; gap: 3px; min-width: 100px; flex: 1; }
    .gd-field label { font-weight: 600; font-size: 11px; }
    .gd-input { padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45)); border-radius: 4px; font-family: var(--vscode-font-family); font-size: 12px; }
    button { cursor: pointer; font-family: var(--vscode-font-family); }
    /* ── Status bar ── */
    .gd-status { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 4px 12px; flex-shrink: 0; background: var(--vscode-sideBar-background); border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25)); opacity: 0.8; }
    .gd-status-ok { color: var(--vscode-testing-iconPassed, #3fb950); opacity: 1; }
    .gd-status-err { color: var(--vscode-errorForeground); opacity: 1; }
    /* ── Cards ── */
    .gd-card { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; background: var(--vscode-editor-background); padding: 8px; margin: 6px 0; }
    .gd-danger { background: rgba(200, 60, 60, 0.15); border-color: rgba(200,60,60,.4); }
    .gd-hero { border-color: var(--vscode-button-background); background: color-mix(in srgb, var(--vscode-button-background) 7%, var(--vscode-editor-background)); }
    .gd-loading { border-style: dashed; }
    .gd-warn-card { background: rgba(200, 150, 0, 0.1); border-color: rgba(200,150,0,.35); }
    .gd-ok-card { background: rgba(0, 160, 0, 0.07); border-color: rgba(0, 160, 0, 0.3); }
    .gd-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 6px; }
    .gd-pill, .gd-chip { font-size: 10px; padding: 1px 7px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); white-space: nowrap; font-weight: 500; }
    .gd-ok { background: rgba(0, 160, 0, 0.22); }
    .gd-warn { background: rgba(200,150,0,.25); }
    /* ── Metadata grid ── */
    .gd-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 10px; margin: 8px 0 0; font-size: 11px; }
    .gd-meta dt { font-weight: 600; opacity: 0.75; }
    .gd-meta dd { margin: 0; word-break: break-all; }
    .gd-meta-tight { margin-top: 4px !important; gap: 3px 10px !important; }
    .gd-counts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .gd-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .gd-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); padding-top: 6px; }
    .gd-row-compact { align-items: flex-start; }
    .gd-guidance-card { border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); margin-top: 8px; padding-top: 8px; }
    .gd-debug summary { opacity: 0.75; font-size: 11px; cursor: pointer; }
    .gd-library { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .gd-kicker { display: block; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.55; font-size: 9.5px; font-weight: 700; margin: 0 0 1px; }
    pre { overflow: auto; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; background: var(--vscode-textCodeBlock-background); padding: 6px; border-radius: 4px; }
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
    .gd-draft-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0 0; }
    .gd-draft-table th, .gd-draft-table td { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3)); padding: 4px 6px; text-align: left; vertical-align: top; }
    .gd-readiness-banner { padding: 6px 0 10px 0; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); margin-bottom: 8px; }
    .gd-readiness-head { margin-bottom: 4px !important; }
    .gd-readiness-ok { background: rgba(0, 160, 0, 0.22); color: inherit; border-radius: 4px; padding: 2px 6px; }
    .gd-readiness-warn { background: rgba(200, 150, 0, 0.3); color: inherit; border-radius: 4px; padding: 2px 6px; }
    .gd-readiness-danger { background: rgba(200, 60, 60, 0.32); color: inherit; border-radius: 4px; padding: 2px 6px; }
    .gd-readiness-list { margin: 6px 0 0 0; padding-left: 18px; }
    .gd-blast-examples { margin: 6px 0 0 0; padding-left: 18px; }
    .gd-blast.gd-card { margin: 8px 0; }
    .gd-warning ul { margin: 6px 0 0; padding-left: 18px; }
    .gw-wizard-steps { padding: 8px 0 0; border-top: 1px dashed var(--vscode-widget-border, rgba(127,127,127,.3)); margin-top: 8px; }
    .gw-catalog-strip { margin: 8px 0 0; max-height: 180px; overflow: auto; }
    /* ── Persistent header ── */
    .gd-header { padding: 6px 12px 0; flex-shrink: 0; }
    /* ── Three-tab bar — matches .wc-tab-bar in dashboard ── */
    .gd-tab-bar { display: flex; gap: 0; margin: 4px -12px 0 -12px; padding: 0 4px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3)); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
    .gd-tab-bar::-webkit-scrollbar { display: none; }
    .gd-tab { flex: 1; padding: 5px 9px; font-size: 11px; font-weight: 500; font-family: var(--vscode-font-family); border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: var(--vscode-foreground); opacity: 0.55; cursor: pointer; white-space: nowrap; }
    .gd-tab:hover { opacity: 0.85; }
    .gd-tab.gd-tab-active { opacity: 1; font-weight: 600; border-bottom-color: var(--vscode-button-background); }
    /* ── Tab panels ── */
    .gd-panel { flex: 1; overflow-y: auto; padding: 8px 12px; display: none; }
    #panel-check { display: block; }
    /* ── Manage sub-section bar — pill tabs ── */
    .gd-subsection-bar { display: flex; gap: 4px; margin: 0 0 8px; }
    .gd-subsection-btn { flex: 1; padding: 3px 6px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.4)); border-radius: 4px; background: transparent; color: var(--vscode-foreground); opacity: 0.6; font-size: 10px; font-weight: 500; cursor: pointer; font-family: var(--vscode-font-family); white-space: nowrap; }
    .gd-subsection-btn:hover { opacity: 0.85; background: var(--vscode-toolbar-hoverBackground); }
    .gd-subsection-btn.gd-subsection-active { opacity: 1; font-weight: 600; border-color: var(--vscode-button-background); color: var(--vscode-foreground); background: color-mix(in srgb, var(--vscode-button-background) 10%, transparent); }
    .gd-subsection { display: none; }
    #subsection-wizard { display: block; }
    .wc-drawer-host { position: fixed; inset: 0; z-index: 20000; pointer-events: none; }
    .wc-drawer-host--hidden { display: none !important; }
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-scrim,
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-panel {
      pointer-events: auto;
    }
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
  </style>
</head>
<body>
  <!-- Persistent header -->
  <div class="gd-header">
    <span class="gd-kicker">Workflow Cannon</span>
    <h1>CAE</h1>
  </div>

  <!-- Persistent tab bar: Check | History | Manage — all equal weight -->
  <div class="gd-tab-bar" role="tablist">
    <button class="gd-tab gd-tab-active" data-tab="check" type="button" role="tab" aria-selected="true">Check</button>
    <button class="gd-tab" data-tab="history" type="button" role="tab" aria-selected="false">History</button>
    <button class="gd-tab" data-tab="manage" type="button" role="tab" aria-selected="false">Manage</button>
  </div>

  <!-- CHECK panel -->
  <div class="gd-panel" id="panel-check" role="tabpanel">
    <div id="gd-ack-banner"></div>
    <section class="gd-card gd-hero">
      <div class="gd-card-head">
        <h2>Pre-flight Check</h2>
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
      <div class="gd-toolbar" style="justify-content:space-between">
        <button type="button" class="wc-btn wc-btn-md wc-btn-primary" id="gd-preview">Run Pre-flight Check</button>
        <button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" id="gd-refresh">Reload</button>
      </div>
    </section>
    <div id="guidance-preview-root"></div>
    <div id="guidance-action-result-root"></div>
    <div id="guidance-trace-detail-root"></div>
  </div>

  <!-- HISTORY panel -->
  <div class="gd-panel" id="panel-history" role="tabpanel">
    <div id="guidance-history-root">
      <section class="gd-card">
        <div class="gd-card-head">
          <h2>Recent checks</h2>
          <span class="gd-pill">Loading</span>
        </div>
        <p class="gd-muted">Guidance history is loading.</p>
      </section>
    </div>
  </div>

  <!-- MANAGE panel -->
  <div class="gd-panel" id="panel-manage" role="tabpanel">
    <!-- Active set status (injected by setActiveSetStatus) -->
    <div id="gd-manage-status">
      <section class="gd-card">
        <div class="gd-card-head">
          <h2>Active guidance set</h2>
          <span class="gd-pill">Loading</span>
        </div>
        <p class="gd-muted">Guidance system status is loading.</p>
      </section>
    </div>

    <!-- Sub-section switcher: New rule | Versions | Status -->
    <div class="gd-subsection-bar">
      <button type="button" class="gd-subsection-btn gd-subsection-active" data-subsection="wizard">New rule</button>
      <button type="button" class="gd-subsection-btn" data-subsection="versions">Versions</button>
      <button type="button" class="gd-subsection-btn" data-subsection="status">Status</button>
    </div>

    <!-- WIZARD sub-section -->
    <div id="subsection-wizard" class="gd-subsection">
      <section class="gd-card" id="gd-manage-draft">
        <div class="gd-card-head">
          <h2>Guidance authoring wizard</h2>
          <span class="gd-pill">Not active until published</span>
        </div>
        <p class="gd-muted">New / Improve / Duplicate from catalog flows: fill the steps below. Preview computes blast radius + activation readiness against the hero task/workflow.</p>
        <div id="gw-governance-wrap" class="gd-warn-card gd-card" style="margin:10px 0;display:none;padding:10px;font-size:11px;line-height:1.4;border-radius:4px;">
          <p id="gw-governance-panel"><strong>Governance:</strong></p>
        </div>
        <p id="gw-handoff-hint" class="gd-muted" style="font-size:11px;margin:6px 0">Loading governance&#8230;</p>
        <div class="gw-wizard-steps">
          <section class="gd-card" style="padding:10px;background:transparent;border-style:dashed;margin:10px 0;">
            <h3>Catalog shortcuts</h3>
            <p class="gd-muted">Populate the form from a catalog row (read-only; does not mutate the registry).</p>
            <div id="gw-catalog-rows" class="gw-catalog-strip"></div>
          </section>
          <div class="gd-toolbar gd-actions">
            <button type="button" class="wc-btn wc-btn-md wc-btn-secondary" id="gw-new-rule">Clear / new rule draft</button>
          </div>
          <div class="gd-toolbar">
            <div class="gd-field"><label for="gw-draft-title">Guidance title</label><input id="gw-draft-title" class="gd-input" placeholder="What operators should see" /></div>
            <div class="gd-field"><label for="gw-strength">Strength</label>
              <select id="gw-strength" class="gd-input">
                <option value="required">Required rule</option>
                <option value="advisory" selected>Recommendation</option>
                <option value="step">Suggested steps</option>
                <option value="verify">Review check</option>
              </select>
            </div>
            <div class="gd-field"><label for="gw-priority">Priority</label><input id="gw-priority" class="gd-input" type="number" min="0" max="9999" value="750" /></div>
          </div>
          <div class="gd-toolbar">
            <div class="gd-field"><label for="gw-scope-preset">Scope preset</label>
              <select id="gw-scope-preset" class="gd-input">
                <option value="workflow">Workflow intent</option>
                <option value="always">Always-on</option>
                <option value="phase">Phase-bound</option>
                <option value="task">Task-bound</option>
                <option value="completing_task">Completing-task</option>
              </select>
            </div>
          </div>
          <div class="gd-toolbar" id="gw-wf-row">
            <div class="gd-field"><label for="gw-wf-name">Workflow name</label><input id="gw-wf-name" class="gd-input" placeholder="get-next-actions" /></div>
          </div>
          <div class="gd-toolbar" id="gw-phase-row" style="display:none">
            <div class="gd-field"><label for="gw-phase-key">Phase key</label><input id="gw-phase-key" class="gd-input" placeholder="e.g. phase-75" /></div>
          </div>
          <div class="gd-toolbar" id="gw-task-row" style="display:none">
            <div class="gd-field"><label for="gw-scope-task-id">Scoped task id</label><input id="gw-scope-task-id" class="gd-input" placeholder="T921" /></div>
          </div>
          <details>
            <summary>Acknowledgement + trace context</summary>
            <div class="gd-toolbar">
              <div class="gd-field"><label for="gw-ack-strength">Acknowledgement tier</label>
                <select id="gw-ack-strength" class="gd-input">
                  <option value="none">None</option>
                  <option value="surface">Surface notice</option>
                  <option value="recommend">Recommend ack</option>
                  <option value="ack_required">Ack required</option>
                  <option value="satisfy_required">Satisfaction required</option>
                </select>
              </div>
              <div class="gd-field"><label for="gw-check-record">Check trace id</label><input id="gw-check-record" class="gd-input" placeholder="Improve flow fills trace id" /></div>
              <div class="gd-field"><label for="gw-trigger-id">Existing activation id</label><input id="gw-trigger-id" class="gd-input" placeholder="optional correlation" /></div>
            </div>
          </details>
          <div class="gd-field" style="max-width:none"><label for="gw-draft-notes">Notes for maintainers</label><textarea id="gw-draft-notes" class="gd-input" rows="3" placeholder="What should change and why?"></textarea></div>
          <p id="gw-readiness-note" class="gd-muted" style="font-size:11px;"></p>
          <div class="gd-actions">
            <button type="button" class="wc-btn wc-btn-md wc-btn-primary" id="gw-draft-preview">Preview draft impact</button>
            <button type="button" class="wc-btn wc-btn-md wc-btn-secondary" id="gw-draft-reset">Reset wizard</button>
            <button type="button" class="wc-btn wc-btn-md wc-btn-secondary" disabled id="gw-copy-draft-json">Copy draft JSON</button>
          </div>
        </div>
      </section>
    </div>

    <!-- VERSIONS sub-section (injected by setManageVersions) -->
    <div id="subsection-versions" class="gd-subsection">
      <div id="guidance-versions-root">
        <section class="gd-card">
          <p class="gd-muted">Version history loading&#8230;</p>
        </section>
      </div>
    </div>

    <!-- STATUS sub-section (injected by setManageStatus) -->
    <div id="subsection-status" class="gd-subsection">
      <div id="guidance-status-root">
        <section class="gd-card">
          <p class="gd-muted">System status loading&#8230;</p>
        </section>
      </div>
    </div>
  </div>

  <!-- Always-visible status bar -->
  <div id="gd-status" class="gd-status gd-status-info" role="status">Guidance status is loading.</div>

  <div id="wc-drawer-host" class="wc-drawer-host wc-drawer-host--hidden" aria-hidden="true"></div>

  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
