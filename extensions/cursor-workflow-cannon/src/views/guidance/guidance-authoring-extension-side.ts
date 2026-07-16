import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  buildGuidanceCaeMutationDrawerSpec,
  buildGuidanceLibraryIdentityDrawerSpec,
  renderDrawerFormHtml,
  validateGuidanceCaeMutationSubmit,
  validateGuidanceLibraryIdentitySubmit,
  type GuidanceLibraryIdentityDrawerMode
} from "../dashboard/dashboard-input-drawer.js";
import { buildGuidanceMutationActionResultMessage } from "./guidance-panel-messages.js";

export type GuidanceAuthoringExtensionSideOptions = {
  client: CommandClient;
  workspaceFolder?: vscode.WorkspaceFolder;
  extensionUri: vscode.Uri;
  getWebview: () => vscode.Webview | undefined;
  /** Called after bulk activation mutations (and similar) to refresh authoring UI / summary. */
  reloadAfterMutations: () => Promise<void>;
};

/**
 * Shared extension-side handlers for the guidance authoring webview bootstrap
 * (standalone Guidance panel + embedded Dashboard CAE tab).
 */
export class GuidanceAuthoringExtensionSide {
  private guidanceMutationApproval:
    | { resolve: (v: { actor: string; note: string } | null) => void; actor: string }
    | undefined;

  private libraryIdentitySession:
    | {
        mode: GuidanceLibraryIdentityDrawerMode;
        sourceArtifactId?: string;
        expectedActiveVersionId?: string;
        expectedRegistryDigest?: string;
      }
    | undefined;

  constructor(private readonly opts: GuidanceAuthoringExtensionSideOptions) {}

  cancelMutationApproval(): void {
    if (this.guidanceMutationApproval) {
      const stuck = this.guidanceMutationApproval;
      this.guidanceMutationApproval = undefined;
      stuck.resolve(null);
    }
    this.libraryIdentitySession = undefined;
  }

  /** @returns true when a guidance drawer was open and this submit consumed it */
  async handleCaeDrawerSubmitIfActive(values: unknown): Promise<boolean> {
    if (this.libraryIdentitySession) {
      return await this.handleLibraryIdentityDrawerSubmit(values);
    }
    const pending = this.guidanceMutationApproval;
    if (!pending) {
      return false;
    }
    const rec = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
    const strVals: Record<string, string> = {};
    for (const k of Object.keys(rec)) {
      strVals[k] = String(rec[k] ?? "");
    }
    const v = validateGuidanceCaeMutationSubmit(strVals);
    if (!v.ok) {
      await this.opts.getWebview()?.postMessage({ type: "wcDrawerValidation", message: v.error });
      return true;
    }
    this.guidanceMutationApproval = undefined;
    await this.opts.getWebview()?.postMessage({ type: "wcDrawerClose" });
    pending.resolve({ actor: pending.actor, note: v.values.rationale });
    return true;
  }

  /** @returns true when a guidance drawer was open and this cancel consumed it */
  async handleCaeDrawerCancelIfActive(): Promise<boolean> {
    if (this.libraryIdentitySession) {
      this.libraryIdentitySession = undefined;
      await this.opts.getWebview()?.postMessage({ type: "wcDrawerClose" });
      await this.opts.getWebview()?.postMessage({ type: "actionResult", ok: false, text: "Library mutation cancelled." });
      return true;
    }
    const pending = this.guidanceMutationApproval;
    if (!pending) {
      return false;
    }
    this.guidanceMutationApproval = undefined;
    await this.opts.getWebview()?.postMessage({ type: "wcDrawerClose" });
    pending.resolve(null);
    return true;
  }

  dispatchWebviewMessage(msg: unknown): void {
    const m = msg as { type?: string; [key: string]: unknown };
    if (m.type === "validateRegistry") void this.runValidation();
    if (m.type === "openArtifact") void this.openArtifact(String(m.path ?? ""));
    if (m.type === "artifactAction") {
      const action = String(m.action ?? "");
      if (action === "library-create" || action === "library-duplicate") {
        void this.openLibraryIdentityDrawer(action, m);
        return;
      }
      void this.reportAction(action, String(m.artifactId ?? ""));
    }
    if (m.type === "activationAction")
      void this.runActivationAction(String(m.action ?? ""), String(m.activationId ?? ""), m.previewEvidence);
    if (m.type === "artifactMutation") void this.runArtifactMutation(String(m.command ?? ""), m.payload);
    if (m.type === "activationMutation") void this.runActivationMutation(String(m.command ?? ""), m.payload);
    if (m.type === "guidancePreview") void this.runGuidancePreview(m.payload);
    if (m.type === "listRegistryVersions") void this.runListRegistryVersions();
    if (m.type === "portabilityRun") void this.runPortability(String(m.kind ?? ""));
    if (m.type === "activationBulk") {
      const rawIds = m.activationIds;
      const activationIds = Array.isArray(rawIds) ? rawIds.map((id) => String(id)) : [];
      void this.runActivationBulk(String(m.mode ?? ""), activationIds);
    }
  }

  private async openArtifact(path: string): Promise<void> {
    const wv = this.opts.getWebview();
    if (!path.trim()) {
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Artifact path is missing." });
      return;
    }
    try {
      const uri = path.startsWith("/")
        ? vscode.Uri.file(path)
        : vscode.Uri.joinPath(
            this.opts.workspaceFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? this.opts.extensionUri,
            ...path.split(/[\\/]+/)
          );
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
      await wv?.postMessage({ type: "actionResult", ok: true, text: `Opened ${path}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async reportAction(action: string, targetId: string): Promise<void> {
    const wv = this.opts.getWebview();
    const label = action.replace(/^(artifact|activation)-/, "").replace(/-/g, " ");
    if (action === "artifact-hide-default" || action === "artifact-remove-override") {
      await wv?.postMessage({
        type: "actionResult",
        ok: false,
        text: `${label.charAt(0).toUpperCase()}${label.slice(1)} is not available in the current backend contract for ${targetId}.`
      });
      return;
    }
    await wv?.postMessage({
      type: "actionResult",
      ok: true,
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} selected for ${targetId}`
    });
  }

  private async collectMutationApproval(command: string, target: string, fallbackNote: string): Promise<{ actor: string; note: string } | null> {
    const webview = this.opts.getWebview();
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

  private async postMutationResult(
    command: string,
    result: Awaited<ReturnType<CommandClient["run"]>>,
    options: { openPath?: string; autoOpenFile?: boolean } = {}
  ): Promise<void> {
    const wv = this.opts.getWebview();
    const message = buildGuidanceMutationActionResultMessage(command, result);
    await wv?.postMessage(message);
    if (!message.ok) return;
    const openPath = options.openPath?.trim();
    if (options.autoOpenFile && openPath) {
      await this.openArtifact(openPath);
      await this.opts.reloadAfterMutations();
      return;
    }
    const actions = openPath ? ["Open File", "Refresh", "View Audit", "Preview"] : ["Refresh", "View Audit", "Preview"];
    const choice = await vscode.window.showInformationMessage(message.text, ...actions);
    if (choice === "Open File" && openPath) await this.openArtifact(openPath);
    if (choice === "Refresh") await this.opts.reloadAfterMutations();
    if (choice === "View Audit") await wv?.postMessage({ type: "selectTab", tab: "audit" });
    if (choice === "Preview") await wv?.postMessage({ type: "selectTab", tab: "preview" });
  }

  private concurrencyFromMessage(msg: Record<string, unknown>): {
    expectedActiveVersionId?: string;
    expectedRegistryDigest?: string;
  } {
    const raw = msg.concurrency;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const rec = raw as Record<string, unknown>;
    const out: { expectedActiveVersionId?: string; expectedRegistryDigest?: string } = {};
    const versionId = String(rec.expectedActiveVersionId ?? "").trim();
    const digest = String(rec.expectedRegistryDigest ?? "").trim();
    if (versionId) out.expectedActiveVersionId = versionId;
    if (digest) out.expectedRegistryDigest = digest;
    return out;
  }

  private suggestWorkspaceCopyArtifactId(sourceArtifactId: string): string {
    return `workspace.${sourceArtifactId.replace(/^cae\./, "").replace(/[^a-z0-9_.-]+/gi, ".")}.copy`;
  }

  private pathStemSlug(path: string): string {
    const stem = path.split("/").pop() ?? "";
    return stem.replace(/\.md$/i, "");
  }

  private async openLibraryIdentityDrawer(action: string, msg: Record<string, unknown>): Promise<void> {
    const webview = this.opts.getWebview();
    if (!webview) {
      return;
    }
    const concurrency = this.concurrencyFromMessage(msg);
    const mode: GuidanceLibraryIdentityDrawerMode = action === "library-duplicate" ? "duplicate" : "create";
    if (mode === "duplicate") {
      const sourceArtifactId = String(msg.artifactId ?? "").trim();
      if (!sourceArtifactId) {
        await webview.postMessage({ type: "actionResult", ok: false, text: "Source artifact id is missing." });
        return;
      }
      const title = String(msg.artifactTitle ?? "").trim();
      const artifactPath = String(msg.artifactPath ?? "").trim();
      this.libraryIdentitySession = {
        mode,
        sourceArtifactId,
        ...concurrency
      };
      const html = renderDrawerFormHtml(
        buildGuidanceLibraryIdentityDrawerSpec({
          mode,
          sourceArtifactId,
          defaultArtifactId: this.suggestWorkspaceCopyArtifactId(sourceArtifactId),
          defaultTitle: title ? `${title} Copy` : "Artifact Copy",
          defaultSlug: this.pathStemSlug(artifactPath)
        })
      );
      await webview.postMessage({ type: "wcDrawerOpen", html });
      return;
    }
    this.libraryIdentitySession = { mode, ...concurrency };
    const html = renderDrawerFormHtml(
      buildGuidanceLibraryIdentityDrawerSpec({
        mode,
        defaultArtifactType: "playbook"
      })
    );
    await webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async handleLibraryIdentityDrawerSubmit(values: unknown): Promise<boolean> {
    const session = this.libraryIdentitySession;
    if (!session) {
      return false;
    }
    const rec = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
    const strVals: Record<string, string> = {};
    for (const k of Object.keys(rec)) {
      strVals[k] = String(rec[k] ?? "");
    }
    const validated = validateGuidanceLibraryIdentitySubmit(session.mode, strVals);
    if (!validated.ok) {
      await this.opts.getWebview()?.postMessage({ type: "wcDrawerValidation", message: validated.error });
      return true;
    }
    const identity = validated.values;
    const command =
      session.mode === "create"
        ? "cae-create-workspace-artifact"
        : session.sourceArtifactId?.startsWith("workspace.")
          ? "cae-duplicate-artifact-to-workspace"
          : "cae-duplicate-default-artifact";
    const payload: Record<string, unknown> = {
      artifactId: identity.artifactId
    };
    if (session.mode === "create") {
      payload.artifactType = identity.artifactType;
      payload.title = identity.title;
    } else {
      payload.sourceArtifactId = session.sourceArtifactId;
      if (identity.title) payload.title = identity.title;
    }
    if (identity.slug) payload.slug = identity.slug;
    if (session.expectedActiveVersionId) payload.expectedActiveVersionId = session.expectedActiveVersionId;
    if (session.expectedRegistryDigest) payload.expectedRegistryDigest = session.expectedRegistryDigest;
    this.libraryIdentitySession = undefined;
    await this.opts.getWebview()?.postMessage({ type: "wcDrawerClose" });
    const approval = await this.collectMutationApproval(
      command,
      session.mode === "duplicate" ? String(session.sourceArtifactId ?? identity.artifactId) : identity.artifactId,
      session.mode === "duplicate" ? "Guidance library duplicate" : "Guidance library create"
    );
    if (!approval) {
      await this.opts.getWebview()?.postMessage({ type: "actionResult", ok: false, text: "Library mutation cancelled." });
      return true;
    }
    await this.runApprovedLibraryMutation({ command, payload }, approval);
    return true;
  }

  private async runApprovedLibraryMutation(
    mutation: { command: string; payload: Record<string, unknown> },
    approval: { actor: string; note: string }
  ): Promise<void> {
    const wv = this.opts.getWebview();
    const payload = { ...mutation.payload };
    payload.schemaVersion = 1;
    payload.actor = approval.actor;
    payload.note = approval.note;
    payload.caeMutationApproval = { confirmed: true, rationale: approval.note };
    try {
      const result = await this.opts.client.run(mutation.command, payload);
      await this.postMutationResult(mutation.command, result, {
        openPath: this.resultArtifactPath(result),
        autoOpenFile: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private resultArtifactPath(result: Awaited<ReturnType<CommandClient["run"]>>): string | undefined {
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
    const p = (data as Record<string, unknown>).path;
    return typeof p === "string" && p.trim() ? p.trim() : undefined;
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
    const wv = this.opts.getWebview();
    const allowed = new Set([
      "cae-create-workspace-artifact",
      "cae-update-workspace-artifact",
      "cae-duplicate-default-artifact",
      "cae-duplicate-artifact-to-workspace",
      "cae-retire-workspace-artifact"
    ]);
    if (!allowed.has(command)) {
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Unsupported artifact mutation." });
      return;
    }
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    const target = String(payload.artifactId ?? payload.sourceArtifactId ?? "");
    const approval = await this.collectMutationApproval(
      command,
      target,
      typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : "Guidance artifact editor"
    );
    if (!approval) {
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Artifact mutation cancelled." });
      return;
    }
    payload.schemaVersion = 1;
    payload.actor = approval.actor;
    payload.note = approval.note;
    payload.caeMutationApproval = { confirmed: true, rationale: approval.note };
    try {
      const result = await this.opts.client.run(command, payload);
      await this.postMutationResult(command, result, { openPath: this.resultArtifactPath(result) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runActivationMutation(command: string, rawPayload: unknown): Promise<void> {
    const wv = this.opts.getWebview();
    const allowed = new Set(["cae-create-draft-activation", "cae-update-draft-activation"]);
    if (!allowed.has(command)) {
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Unsupported activation mutation." });
      return;
    }
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    const activation =
      payload.activation && typeof payload.activation === "object" && !Array.isArray(payload.activation)
        ? (payload.activation as Record<string, unknown>)
        : {};
    const activationId = String(payload.activationId ?? activation.activationId ?? "");
    const approval = await this.collectMutationApproval(
      command,
      activationId,
      typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : "Guidance activation editor"
    );
    if (!approval) {
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Activation save cancelled." });
      return;
    }
    payload.schemaVersion = 1;
    payload.actor = approval.actor;
    payload.note = approval.note;
    payload.caeMutationApproval = { confirmed: true, rationale: approval.note };
    try {
      const result = await this.opts.client.run(command, payload);
      const warnings = Array.isArray((result.data as Record<string, unknown> | undefined)?.warnings)
        ? ((result.data as Record<string, unknown>).warnings as unknown[]).length
        : 0;
      await this.postMutationResult(command, {
        ...result,
        message: result.ok === true ? `${command} completed${warnings ? ` with ${warnings} warning(s).` : "."}` : result.message
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runActivationAction(action: string, activationId: string, previewEvidence: unknown): Promise<void> {
    const wv = this.opts.getWebview();
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
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Activation mutation cancelled." });
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
      const result = await this.opts.client.run(command, payload);
      await this.postMutationResult(command, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "actionResult", ok: false, text: message });
    }
  }

  private async runGuidancePreview(rawPayload: unknown): Promise<void> {
    const wv = this.opts.getWebview();
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
    payload.schemaVersion = 1;
    try {
      const result = await this.opts.client.run("cae-guidance-preview", payload);
      await wv?.postMessage({ type: "previewResult", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await wv?.postMessage({ type: "previewResult", result: { ok: false, code: "extension-error", message } });
    }
  }

  private async runListRegistryVersions(): Promise<void> {
    const webview = this.opts.getWebview();
    if (!webview) return;
    try {
      const result = await this.opts.client.run("cae-list-registry-versions", { schemaVersion: 1 });
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
    const webview = this.opts.getWebview();
    if (!webview) return;
    const root = this.opts.workspaceFolder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
      if (kind === "portability-reconcile") {
        const result = await this.opts.client.run("cae-reconcile-defaults", { schemaVersion: 1 });
        await webview.postMessage({ type: "portabilityResult", result });
        return;
      }
      if (kind === "portability-export") {
        const result = await this.opts.client.run("cae-export-guidance-pack", { schemaVersion: 1 });
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
        const result = await this.opts.client.run("cae-import-guidance-pack-dry-run", {
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
    const wv = this.opts.getWebview();
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
      await wv?.postMessage({ type: "actionResult", ok: false, text: "Bulk activation change cancelled." });
      return;
    }
    for (const activationId of ids) {
      const payload: Record<string, unknown> = {
        schemaVersion: 1,
        actor: approval.actor,
        activationId,
        note: approval.note,
        caeMutationApproval: { confirmed: true, rationale: approval.note }
      };
      try {
        const result = await this.opts.client.run(command, payload);
        if (result.ok !== true) {
          await wv?.postMessage({
            type: "actionResult",
            ok: false,
            text: `${command} failed for ${activationId}: ${String(result.message ?? result.code ?? "error")}`
          });
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await wv?.postMessage({ type: "actionResult", ok: false, text: `${command} threw for ${activationId}: ${message}` });
        return;
      }
    }
    await wv?.postMessage({ type: "actionResult", ok: true, text: `${command} completed for ${ids.length} activation(s).` });
    await this.opts.reloadAfterMutations();
  }

  private async runValidation(): Promise<void> {
    const webview = this.opts.getWebview();
    if (!webview) return;
    try {
      const result = await this.opts.client.run("cae-registry-validate", { schemaVersion: 1 });
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
}
