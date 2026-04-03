import * as vscode from "vscode";
import { findWorkflowCannonRoot } from "./workspace-detect.js";
import { CommandClient } from "./runtime/command-client.js";
import { StateWatcher } from "./runtime/state-watcher.js";
import { DashboardViewProvider } from "./views/dashboard/DashboardViewProvider.js";
import { TasksTreeProvider } from "./views/tasks/TasksTreeProvider.js";
import { TasksTreeDragController } from "./views/tasks/TasksTreeDragController.js";
import { ConfigViewProvider } from "./views/config/ConfigViewProvider.js";
import { buildTaskDetailMarkdown } from "./task-detail-markdown.js";

function readWorkflowCannonNodeSetting(): string | undefined {
  return vscode.workspace.getConfiguration("workflowCannon").get<string>("nodeExecutable")?.trim() || undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const root = findWorkflowCannonRoot();
  const folder = root ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root)) : undefined;
  const client = root
    ? new CommandClient(root, { resolveNodeExecutable: readWorkflowCannonNodeSetting })
    : undefined;
  const kitStateEmitter = new vscode.EventEmitter<void>();
  const onKitStateChanged = kitStateEmitter.event;

  let dashboard: DashboardViewProvider | undefined;
  let configView: ConfigViewProvider | undefined;
  let tasks: TasksTreeProvider | undefined;

  if (client && folder) {
    const watcher = new StateWatcher(folder, () => kitStateEmitter.fire());
    watcher.start();
    context.subscriptions.push(watcher);

    dashboard = new DashboardViewProvider(context.extensionUri, client, onKitStateChanged);
    configView = new ConfigViewProvider(context.extensionUri, client, onKitStateChanged);
    tasks = new TasksTreeProvider(client, onKitStateChanged);
    const tasksDnd = new TasksTreeDragController(client, () => kitStateEmitter.fire());

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, dashboard),
      vscode.window.registerWebviewViewProvider(ConfigViewProvider.viewId, configView),
      vscode.window.createTreeView("workflowCannon.tasks", {
        treeDataProvider: tasks,
        showCollapseAll: true,
        dragAndDropController: tasksDnd
      })
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
    const ok = await vscode.window.showWarningMessage(
      `Apply transition '${action}' to ${taskId}?`,
      { modal: true },
      "Apply"
    );
    if (ok !== "Apply") {
      return;
    }
    const rationale =
      (await vscode.window.showInputBox({
        prompt: `Policy rationale for run-transition: ${action} on ${taskId}`,
        placeHolder: "Shown in policy trace / approval"
      })) ?? "vscode-extension";
    const r = await runtime.run("run-transition", {
      taskId,
      action,
      policyApproval: { confirmed: true, rationale }
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
    } else {
      await vscode.window.showInformationMessage(r.message ?? "Transition OK");
      kitStateEmitter.fire();
    }
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
    statusBar.command = "workflowCannon.openDashboard";
    const updateStatusBar = async () => {
      const r = await client.run("dashboard-summary", {});
      if (!r.ok) {
        statusBar.text = "$(warning) WC: unavailable";
        statusBar.tooltip = String(r.message ?? r.code ?? "dashboard-summary failed");
        statusBar.show();
        return;
      }
      const ready = Number((r.data as Record<string, unknown>)?.readyQueueCount ?? 0);
      statusBar.text = `$(checklist) WC ready: ${ready}`;
      statusBar.tooltip = "Workflow Cannon ready queue count";
      statusBar.show();
    };
    void updateStatusBar();
    onKitStateChanged(() => {
      void updateStatusBar();
    });
    context.subscriptions.push(statusBar);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("workflowCannon.openDashboard", async () => {
      await vscode.commands.executeCommand("workflowCannon.dashboard.focus");
    }),
    vscode.commands.registerCommand("workflowCannon.refreshDashboard", () => {
      if (!dashboard) {
        void requireClient();
        return;
      }
      dashboard.refresh();
    }),
    vscode.commands.registerCommand("workflowCannon.refreshTasks", () => {
      if (!tasks) {
        void requireClient();
        return;
      }
      tasks.refresh();
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
    })
  );
}

export function deactivate(): void {}
