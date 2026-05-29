import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { findWorkflowCannonRoot } from "./workspace-detect.js";
import { CommandClient } from "./runtime/command-client.js";
import { StateWatcher } from "./runtime/state-watcher.js";
import { DashboardViewProvider } from "./views/dashboard/DashboardViewProvider.js";
import { GuidancePanel } from "./views/guidance/GuidancePanel.js";
import { StatusDashboardPanel } from "./views/status/StatusDashboardPanel.js";
import { prefillCursorChat } from "./cursor-chat-prefill.js";
import { buildTaskDetailMarkdown } from "./task-detail-markdown.js";
import { buildWishlistIntakeAgentPrompt } from "./wishlist-chat-prompt.js";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildImprovementTriagePrompt,
  buildPhaseNotesDiscoveryPrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "./playbook-chat-prompts.js";
import { confirmAndRunTransition } from "./run-transition-with-approval.js";
import { kitRunTraceHooks, logWc } from "./runtime/workflow-cannon-log.js";
import { TaskStateSyncCoordinator } from "./runtime/task-state-sync-coordinator.js";
import { registerGitTaskStateSyncListener } from "./runtime/git-task-state-sync-listener.js";
import { buildLeaseUiState, leaseActionLabel, type LeaseActionKind } from "./lease-status-ui.js";

function readWorkflowCannonNodeSetting(): string | undefined {
  return vscode.workspace.getConfiguration("workflowCannon").get<string>("nodeExecutable")?.trim() || undefined;
}

function readTaskStateSyncSettings(): { enabled: boolean; intervalMs: number } {
  const cfg = vscode.workspace.getConfiguration("workflowCannon");
  const enabled = cfg.get<boolean>("taskStateSync.enabled") !== false;
  const minutes = cfg.get<number>("taskStateSync.intervalMinutes");
  const intervalMinutes = typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0 ? minutes : 5;
  return {
    enabled,
    intervalMs: enabled && intervalMinutes > 0 ? intervalMinutes * 60_000 : 0
  };
}

const TASK_STATE_SYNC_POLICY_APPROVAL = {
  confirmed: true as const,
  rationale: "VS Code extension background task-state sync (workflow-cannon)"
};

async function runLeaseAction(
  runtime: CommandClient,
  action: LeaseActionKind,
  agentSessionId: string,
  notifyChanged: () => void
): Promise<void> {
  if (action === "inspect") {
    const status = await runtime.run("workspace-edit-status", { agentSessionId });
    if (!status.ok) {
      await vscode.window.showErrorMessage(String(status.message ?? status.code ?? "workspace-edit-status failed"));
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(status.data ?? status, null, 2)
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }

  const policyApproval = {
    confirmed: true,
    rationale: `VS Code lease action: ${action}`
  };
  let result;
  if (action === "claim") {
    const taskId = (await vscode.window.showInputBox({ prompt: "Optional task id for this lease" }))?.trim();
    result = await runtime.run("claim-workspace-edit-lease", {
      agentSessionId,
      taskId: taskId && taskId.length > 0 ? taskId : undefined,
      leaseTtlSeconds: 1800,
      policyApproval
    });
  } else if (action === "release") {
    result = await runtime.run("release-workspace-edit-lease", { agentSessionId, policyApproval });
  } else {
    result = await runtime.run("release-workspace-edit-lease", { recoverStaleLease: true, policyApproval });
  }

  if (!result.ok) {
    await vscode.window.showErrorMessage(String(result.message ?? result.code ?? "Lease action failed"));
    return;
  }
  notifyChanged();
  await vscode.window.showInformationMessage(String(result.message ?? result.code ?? "Lease action completed"));
}

export function activate(context: vscode.ExtensionContext): void {
  const root = findWorkflowCannonRoot();
  const folder = root ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root)) : undefined;
  const client = root
    ? new CommandClient(root, {
        extensionRoot: context.extensionUri.fsPath,
        resolveNodeExecutable: readWorkflowCannonNodeSetting,
        ...kitRunTraceHooks()
      })
    : undefined;
  const kitStateEmitter = new vscode.EventEmitter<void>();
  const onKitStateChanged = kitStateEmitter.event;
  const leaseSessionKey = "workflowCannon.workspaceEditLease.agentSessionId";
  const existingLeaseSessionId = context.globalState.get<string>(leaseSessionKey);
  const leaseAgentSessionId = existingLeaseSessionId && existingLeaseSessionId.trim().length > 0
    ? existingLeaseSessionId
    : `vscode:${randomUUID()}`;
  if (!existingLeaseSessionId) {
    void context.globalState.update(leaseSessionKey, leaseAgentSessionId);
  }

  let dashboard: DashboardViewProvider | undefined;
  let guidancePanel: GuidancePanel | undefined;
  let statusDashboard: StatusDashboardPanel | undefined;
  let taskStateSync: TaskStateSyncCoordinator | undefined;

  if (client && folder) {
    dashboard = new DashboardViewProvider(
      context.extensionUri,
      client,
      onKitStateChanged,
      () => kitStateEmitter.fire(),
      () => taskStateSync?.isSyncing() ?? false
    );
    const watcher = new StateWatcher(
      folder,
      () => kitStateEmitter.fire(),
      () => dashboard?.scheduleConfigTabRefresh()
    );
    watcher.start();
    context.subscriptions.push(watcher);
    const taskStateSyncSettings = readTaskStateSyncSettings();
    taskStateSync = new TaskStateSyncCoordinator({
      run: (command, args) => client.run(command, args),
      policyApproval: () => TASK_STATE_SYNC_POLICY_APPROVAL,
      onSyncStart: () => kitStateEmitter.fire(),
      onSynced: (result) => {
        if (result.ok && (result.action === "hydrated" || result.action === "applied")) {
          kitStateEmitter.fire();
        }
      },
      log: (message) => logWc("task-state-sync", message),
      intervalMs: taskStateSyncSettings.intervalMs,
      debounceMs: 2_000
    });
    if (taskStateSyncSettings.enabled) {
      taskStateSync.start();
      taskStateSync.requestSync("activate");
      registerGitTaskStateSyncListener(folder, taskStateSync, context.subscriptions);
    }
    context.subscriptions.push({ dispose: () => taskStateSync?.stop() });
    guidancePanel = new GuidancePanel(context.extensionUri, client, onKitStateChanged, folder);
    statusDashboard = new StatusDashboardPanel(context.extensionUri, client, onKitStateChanged);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, dashboard)
    );
  }

  const requireClient = (): CommandClient | undefined => {
    if (client) {
      return client;
    }
    void vscode.window.showErrorMessage(
      "Workflow Cannon workspace not detected. Open the repository root containing .workspace-kit/manifest.json."
    );
    return undefined;
  };

  const runTransition = async (taskId: string, action: string) => {
    const runtime = requireClient();
    if (!runtime) {
      return;
    }
    await confirmAndRunTransition(runtime, () => kitStateEmitter.fire(), taskId, action);
  };

  const showTaskDetail = async (taskId: string) => {
    const runtime = requireClient();
    if (!runtime) {
      return;
    }
    const r = await runtime.run("get-task", { taskId, historyLimit: 25 });
    if (!r.ok) {
      await vscode.window.showErrorMessage(r.message ?? "Failed to get task detail");
      return;
    }
    const task = (r.data?.task as Record<string, unknown>) ?? {};
    const recent = (r.data?.recentTransitions as Record<string, unknown>[]) ?? [];
    const allowed = (r.data?.allowedActions as Record<string, unknown>[]) ?? [];
    const md = buildTaskDetailMarkdown({ task, allowedActions: allowed, recentTransitions: recent });
    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: md
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

  const showWishlistDetail = async (wishlistId: string) => {
    const runtime = requireClient();
    if (!runtime) {
      return;
    }
    const r = await runtime.run("get-wishlist", { wishlistId });
    if (!r.ok) {
      await vscode.window.showErrorMessage(r.message ?? "Failed to get wishlist item");
      return;
    }
    const item = (r.data?.item as Record<string, unknown>) ?? {};
    const lines = [
      `# ${String(item.id ?? wishlistId)} — ${String(item.title ?? "")}`,
      "",
      `- Status: ${String(item.status ?? "")}`,
      "",
      "## Problem",
      String(item.problemStatement ?? ""),
      "",
      "## Expected outcome",
      String(item.expectedOutcome ?? ""),
      "",
      "## Impact",
      String(item.impact ?? ""),
      "",
      "## Constraints",
      String(item.constraints ?? ""),
      "",
      "## Success signals",
      String(item.successSignals ?? ""),
      "",
      "## Requestor / evidence",
      `- Requestor: ${String(item.requestor ?? "")}`,
      `- Evidence: ${String(item.evidenceRef ?? "")}`
    ];
    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: lines.join("\n")
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

  if (client) {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    statusBar.name = "Workflow Cannon";
    statusBar.command = "workflowCannon.lease.pickAction";
    const updateStatusBar = async () => {
      const r = await client.run("dashboard-summary", {});
      if (!r.ok) {
        statusBar.text = "$(warning) WC: unavailable";
        statusBar.tooltip = String(r.message ?? r.code ?? "dashboard-summary failed");
        statusBar.show();
        return;
      }
      const ready = Number((r.data as Record<string, unknown>)?.readyQueueCount ?? 0);
      const sys = (r.data as Record<string, unknown>)?.systemStatus as Record<string, unknown> | undefined;
      const coord = sys?.coordination as Record<string, unknown> | undefined;
      const posture = typeof coord?.posture === "string" ? coord.posture : "—";
      const lease = coord?.lease && typeof coord.lease === "object" ? (coord.lease as Record<string, unknown>) : null;
      const leaseUi = buildLeaseUiState({ leaseStatus: lease, suspectFlags: coord?.suspectFlags });
      statusBar.text = `${leaseUi.statusBarText} · ${posture} · rdy ${ready}`;
      statusBar.tooltip = `${leaseUi.tooltip}\nWorkflow Cannon coordination ${posture}; ready queue ${ready}.`;
      statusBar.show();
    };
    let behaviorRuleSyncTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleEffectiveBehaviorRuleSync = (): void => {
      if (behaviorRuleSyncTimer) {
        clearTimeout(behaviorRuleSyncTimer);
      }
      behaviorRuleSyncTimer = setTimeout(() => {
        behaviorRuleSyncTimer = undefined;
        void client.run("sync-effective-behavior-cursor-rule", {}).then((r) => {
          if (!r.ok && process.env.WORKSPACE_KIT_DEBUG_EXTENSION === "1") {
            logWc("extension", `sync-effective-behavior-cursor-rule FAIL ${String(r.code ?? "")} ${String(r.message ?? "")}`);
          }
        });
      }, 1500);
    };
    void updateStatusBar();
    onKitStateChanged(() => {
      void updateStatusBar();
      scheduleEffectiveBehaviorRuleSync();
    });
    context.subscriptions.push(statusBar);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("workflowCannon.openDashboard", async () => {
      await vscode.commands.executeCommand("workflowCannon.dashboard.focus");
    }),
    vscode.commands.registerCommand("workflowCannon.openStatusDashboard", () => {
      if (!statusDashboard) {
        void requireClient();
        return;
      }
      statusDashboard.open();
    }),
    vscode.commands.registerCommand("workflowCannon.openGuidancePanel", () => {
      if (!guidancePanel) {
        void requireClient();
        return;
      }
      guidancePanel.open();
    }),
    vscode.commands.registerCommand("workflowCannon.refreshDashboard", () => {
      if (!dashboard) {
        void requireClient();
        return;
      }
      dashboard.refresh();
    }),
    vscode.commands.registerCommand("workflowCannon.refreshTasks", () => {
      if (!dashboard) {
        void requireClient();
        return;
      }
      dashboard.refresh();
    }),
    vscode.commands.registerCommand("workflowCannon.syncTaskState", async () => {
      if (!taskStateSync) {
        void requireClient();
        return;
      }
      const result = await taskStateSync.syncNow("command");
      if (!result.ok) {
        await vscode.window.showErrorMessage(
          String(result.message ?? result.code ?? "Task-state sync failed")
        );
        return;
      }
      if (result.action === "skipped") {
        await vscode.window.showWarningMessage(
          String(result.message ?? "Task-state sync skipped (conflict)")
        );
        return;
      }
      await vscode.window.showInformationMessage(
        result.action === "none"
          ? "Task-state projection is already current"
          : `Task-state sync complete (${result.action})`
      );
    }),
    vscode.commands.registerCommand("workflowCannon.showReadyQueue", async () => {
      const runtime = requireClient();
      if (!runtime) {
        return;
      }
      let r = await runtime.run("list-tasks", { status: "ready", type: "improvement" });
      if (!r.ok) {
        await vscode.window.showErrorMessage(String(r.message ?? r.code));
        return;
      }
      let list = (r.data?.tasks as { id: string; title: string }[]) ?? [];
      let title = "Ready improvement tasks";
      if (list.length === 0) {
        r = await runtime.run("list-tasks", { status: "ready" });
        if (!r.ok) {
          await vscode.window.showErrorMessage(String(r.message ?? r.code));
          return;
        }
        list = (r.data?.tasks as { id: string; title: string }[]) ?? [];
        title = "Ready tasks";
      }
      const pick = list.map((t) => `${t.id} — ${t.title}`);
      await vscode.window.showQuickPick(pick, { title });
    }),
    vscode.commands.registerCommand("workflowCannon.lease.pickAction", async () => {
      const runtime = requireClient();
      if (!runtime) {
        return;
      }
      const status = await runtime.run("workspace-edit-status", { agentSessionId: leaseAgentSessionId });
      if (!status.ok) {
        await vscode.window.showErrorMessage(String(status.message ?? status.code ?? "workspace-edit-status failed"));
        return;
      }
      const leaseStatus = (status.data?.leaseStatus as Record<string, unknown> | undefined) ?? null;
      const ui = buildLeaseUiState({ leaseStatus });
      const pick = await vscode.window.showQuickPick(
        ui.actions.map((action) => ({ label: leaseActionLabel(action), action })),
        { title: `Workspace edit lease: ${ui.kind}` }
      );
      if (!pick) {
        return;
      }
      await runLeaseAction(runtime, pick.action, leaseAgentSessionId, () => kitStateEmitter.fire());
    }),
    vscode.commands.registerCommand("workflowCannon.lease.inspect", async () => {
      const runtime = requireClient();
      if (!runtime) {
        return;
      }
      const status = await runtime.run("workspace-edit-status", { agentSessionId: leaseAgentSessionId });
      if (!status.ok) {
        await vscode.window.showErrorMessage(String(status.message ?? status.code ?? "workspace-edit-status failed"));
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(status.data ?? status, null, 2)
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
    vscode.commands.registerCommand("workflowCannon.lease.claim", async () => {
      const runtime = requireClient();
      if (runtime) await runLeaseAction(runtime, "claim", leaseAgentSessionId, () => kitStateEmitter.fire());
    }),
    vscode.commands.registerCommand("workflowCannon.lease.release", async () => {
      const runtime = requireClient();
      if (runtime) await runLeaseAction(runtime, "release", leaseAgentSessionId, () => kitStateEmitter.fire());
    }),
    vscode.commands.registerCommand("workflowCannon.lease.recover", async () => {
      const runtime = requireClient();
      if (runtime) await runLeaseAction(runtime, "recover", leaseAgentSessionId, () => kitStateEmitter.fire());
    }),
    vscode.commands.registerCommand("workflowCannon.validateConfig", async () => {
      const runtime = requireClient();
      if (!runtime) {
        return;
      }
      const r = await runtime.config(["validate"]);
      await vscode.window.showInformationMessage(
        r.stdout.trim().slice(0, 800) || `config validate exit ${r.code}`
      );
    }),
    vscode.commands.registerCommand("workflowCannon.task.pickAction", async (taskId?: string) => {
      const id =
        taskId ??
        (await vscode.window.showInputBox({ prompt: "Task id (e.g. T296)" }))?.trim();
      if (!id) {
        return;
      }
      const runtime = requireClient();
      if (!runtime) {
        return;
      }
      const gr = await runtime.run("get-task", { taskId: id, historyLimit: 5 });
      if (!gr.ok) {
        await vscode.window.showErrorMessage(gr.message ?? "get-task failed");
        return;
      }
      const allowed = (gr.data?.allowedActions as { action: string; targetStatus: string }[]) ?? [];
      if (allowed.length === 0) {
        await vscode.window.showInformationMessage("No allowed actions for current status.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        allowed.map((a) => ({ label: a.action, description: `→ ${a.targetStatus}`, action: a.action })),
        { title: `Transition ${id}` }
      );
      if (!pick) {
        return;
      }
      await runTransition(id, pick.action);
    }),
    vscode.commands.registerCommand("workflowCannon.task.showDetail", async (taskId?: string) => {
      if (!taskId) return;
      await showTaskDetail(taskId);
    }),
    vscode.commands.registerCommand("workflowCannon.wishlist.showDetail", async (wishlistId?: string) => {
      if (!wishlistId) return;
      await showWishlistDetail(wishlistId);
    }),
    vscode.commands.registerCommand("workflowCannon.task.start", async (taskId?: string) => {
      if (!taskId) return;
      await runTransition(taskId, "start");
    }),
    vscode.commands.registerCommand("workflowCannon.task.complete", async (taskId?: string) => {
      if (!taskId) return;
      await runTransition(taskId, "complete");
    }),
    vscode.commands.registerCommand("workflowCannon.task.block", async (taskId?: string) => {
      if (!taskId) return;
      await runTransition(taskId, "block");
    }),
    vscode.commands.registerCommand("workflowCannon.task.pause", async (taskId?: string) => {
      if (!taskId) return;
      await runTransition(taskId, "pause");
    }),
    vscode.commands.registerCommand("workflowCannon.task.unblock", async (taskId?: string) => {
      if (!taskId) return;
      await runTransition(taskId, "unblock");
    }),
    vscode.commands.registerCommand("workflowCannon.chat.prefillWishlistFlow", async (wishlistId?: string) => {
      const id = typeof wishlistId === "string" ? wishlistId.trim() : "";
      const prompt = buildWishlistIntakeAgentPrompt(id.length > 0 ? { wishlistId: id } : undefined);
      await prefillCursorChat(prompt);
    }),
    vscode.commands.registerCommand("workflowCannon.chat.generateFeatures", async () => {
      await prefillCursorChat(GENERATE_FEATURES_SLASH_TEXT, { newChat: true });
    }),
    vscode.commands.registerCommand("workflowCannon.chat.phaseNotesDiscovery", async () => {
      await prefillCursorChat(buildPhaseNotesDiscoveryPrompt(), { newChat: true });
    }),
    vscode.commands.registerCommand("workflowCannon.chat.prefillImprovementTriage", async (taskId?: string) => {
      const id = typeof taskId === "string" ? taskId.trim() : "";
      const prompt = buildImprovementTriagePrompt(id.length > 0 ? { taskId: id } : undefined);
      await prefillCursorChat(prompt);
    }),
    vscode.commands.registerCommand("workflowCannon.chat.prefillTaskToPhaseBranch", async (taskId?: string) => {
      const id = typeof taskId === "string" ? taskId.trim() : "";
      const prompt = buildTaskToPhaseBranchPrompt(id.length > 0 ? { taskId: id } : undefined);
      await prefillCursorChat(prompt);
    }),
    vscode.commands.registerCommand("workflowCannon.chat.prefillTranscriptChurnResearch", async (taskId?: string) => {
      const id = typeof taskId === "string" ? taskId.trim() : "";
      const prompt = buildTranscriptChurnResearchPrompt(id.length > 0 ? { taskId: id } : undefined);
      await prefillCursorChat(prompt, { newChat: true });
    })
  );
}

export function deactivate(): void {}
