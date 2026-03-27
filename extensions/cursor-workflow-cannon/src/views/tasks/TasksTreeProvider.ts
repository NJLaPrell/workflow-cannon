import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";

type TaskEntity = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  phase?: string;
};

type WkGroup = { kind: "group"; label: string; status: string; tasks: TaskEntity[] };
type WkTask = { kind: "task"; task: TaskEntity };
type WkNode = WkGroup | WkTask;

const STATUS_ORDER = ["ready", "in_progress", "blocked", "proposed", "completed", "cancelled"];

export class TasksTreeProvider implements vscode.TreeDataProvider<WkNode> {
  private _onDidChange = new vscode.EventEmitter<WkNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(
    private readonly client: CommandClient,
    onKitStateChanged: vscode.Event<void>
  ) {
    onKitStateChanged(() => this.refresh());
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: WkNode): vscode.TreeItem {
    if (element.kind === "group") {
      const ti = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      ti.id = `g:${element.status}`;
      ti.iconPath = new vscode.ThemeIcon("list-tree");
      return ti;
    }
    const t = element.task;
    const ti = new vscode.TreeItem(t.id, vscode.TreeItemCollapsibleState.None);
    ti.description = t.title;
    ti.tooltip = `${t.status}${t.priority ? ` · ${t.priority}` : ""}\n${t.title}`;
    ti.contextValue = "wkcTask";
    ti.command = {
      command: "workflowCannon.task.pickAction",
      title: "Task actions",
      arguments: [t.id]
    };
    return ti;
  }

  getChildren(element?: WkNode): vscode.ProviderResult<WkNode[]> {
    if (!element) {
      return this.loadRoots();
    }
    if (element.kind === "group") {
      return element.tasks.map((task) => ({ kind: "task" as const, task }));
    }
    return [];
  }

  private async loadRoots(): Promise<WkNode[]> {
    const r = await this.client.run("list-tasks", {});
    if (!r.ok || !r.data || !Array.isArray((r.data as { tasks?: unknown }).tasks)) {
      return [];
    }
    const tasks = (r.data as { tasks: TaskEntity[] }).tasks;
    const byStatus = new Map<string, TaskEntity[]>();
    for (const s of STATUS_ORDER) {
      byStatus.set(s, []);
    }
    for (const t of tasks) {
      const bucket = byStatus.get(t.status) ?? [];
      bucket.push(t);
      byStatus.set(t.status, bucket);
    }
    const out: WkGroup[] = [];
    for (const status of STATUS_ORDER) {
      const list = byStatus.get(status) ?? [];
      if (list.length === 0) {
        continue;
      }
      out.push({
        kind: "group",
        status,
        label: `${status} (${list.length})`,
        tasks: list
      });
    }
    return out;
  }
}
