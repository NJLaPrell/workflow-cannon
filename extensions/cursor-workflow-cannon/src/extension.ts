import * as vscode from "vscode";
import { findWorkflowCannonRoot } from "./workspace-detect.js";
import { CommandClient } from "./runtime/command-client.js";
import { StateWatcher } from "./runtime/state-watcher.js";
import { DashboardViewProvider } from "./views/dashboard/DashboardViewProvider.js";
import { TasksTreeProvider } from "./views/tasks/TasksTreeProvider.js";
import { ConfigViewProvider } from "./views/config/ConfigViewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
  const root = findWorkflowCannonRoot();
  if (!root) {
    return;
  }

  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
  if (!folder) {
    return;
  }

  const client = new CommandClient(root);
  const kitStateEmitter = new vscode.EventEmitter<void>();
  const onKitStateChanged = kitStateEmitter.event;

  const watcher = new StateWatcher(folder, () => kitStateEmitter.fire());
  watcher.start();
  context.subscriptions.push(watcher);

  const dashboard = new DashboardViewProvider(context.extensionUri, client, onKitStateChanged);
  const configView = new ConfigViewProvider(context.extensionUri, client, onKitStateChanged);
  const tasks = new TasksTreeProvider(client, onKitStateChanged);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, dashboard),
    vscode.window.registerWebviewViewProvider(ConfigViewProvider.viewId, configView),
    vscode.window.createTreeView("workflowCannon.tasks", { treeDataProvider: tasks, showCollapseAll: true })
  );

  const runTransition = async (taskId: string, action: string) => {
    const rationale =
      (await vscode.window.showInputBox({
        prompt: `Policy rationale for run-transition: ${action} on ${taskId}`,
        placeHolder: "Shown in policy trace / approval"
      })) ?? "vscode-extension";
    const r = await client.run("run-transition", {
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

  context.subscriptions.push(
    vscode.commands.registerCommand("workflowCannon.openDashboard", async () => {
      await vscode.commands.executeCommand("workflowCannon.dashboard.focus");
    }),
    vscode.commands.registerCommand("workflowCannon.refreshDashboard", () => dashboard.refresh()),
    vscode.commands.registerCommand("workflowCannon.refreshTasks", () => tasks.refresh()),
    vscode.commands.registerCommand("workflowCannon.showReadyQueue", async () => {
      const r = await client.run("list-tasks", { status: "ready" });
      if (!r.ok) {
        await vscode.window.showErrorMessage(String(r.message ?? r.code));
        return;
      }
      const list = (r.data?.tasks as { id: string; title: string }[]) ?? [];
      const pick = list.map((t) => `${t.id} — ${t.title}`);
      await vscode.window.showQuickPick(pick, { title: "Ready tasks" });
    }),
    vscode.commands.registerCommand("workflowCannon.validateConfig", async () => {
      const r = await client.config(["validate"]);
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
      const gr = await client.run("get-task", { taskId: id, historyLimit: 5 });
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
    })
  );
}

export function deactivate(): void {}
