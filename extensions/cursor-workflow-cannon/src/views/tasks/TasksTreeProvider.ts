import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  buildTaskTreeRootsFromTasks,
  effectiveTaskType,
  type WkNode
} from "./build-task-tree.js";

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
      const collapsed =
        element.status === "completed" || element.status === "cancelled";
      const ti = new vscode.TreeItem(
        element.label,
        collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
      );
      ti.id = `g:${element.status}`;
      ti.iconPath = new vscode.ThemeIcon("list-tree");
      return ti;
    }
    if (element.kind === "wishlist-group") {
      const n = element.items.length;
      const ti = new vscode.TreeItem(
        `Wishlist — open (${n})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      ti.id = "g:wishlist-open";
      ti.iconPath = new vscode.ThemeIcon("lightbulb");
      ti.description = "wishlist_intake · ideation / intake (non-terminal)";
      return ti;
    }
    if (element.kind === "improvement-group") {
      const n = element.phaseBuckets.reduce((acc, b) => acc + b.tasks.length, 0);
      const ti = new vscode.TreeItem(`Improvements (${n})`, vscode.TreeItemCollapsibleState.Expanded);
      ti.id = "g:improvements-active";
      ti.iconPath = new vscode.ThemeIcon("wrench");
      ti.description = "type: improvement · proposed (T### or imp-*; triage backlog)";
      return ti;
    }
    if (element.kind === "phase-bucket") {
      const terminalParent =
        element.parentSegment === "completed" || element.parentSegment === "cancelled";
      const ti = new vscode.TreeItem(
        element.label,
        terminalParent ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
      );
      ti.id = `pb:${element.parentSegment}:${element.phaseKey ?? "none"}`;
      ti.iconPath = new vscode.ThemeIcon("folder");
      return ti;
    }
    if (element.kind === "wishlist-item") {
      const w = element.item;
      const ti = new vscode.TreeItem(w.id, vscode.TreeItemCollapsibleState.None);
      ti.description = w.title;
      ti.tooltip = `wishlist · open\n${w.title}`;
      ti.contextValue = "wkcWishlist";
      ti.iconPath = new vscode.ThemeIcon("symbol-interface");
      ti.command = {
        command: "workflowCannon.wishlist.showDetail",
        title: "Wishlist detail",
        arguments: [w.id]
      };
      return ti;
    }
    const t = element.task;
    const ti = new vscode.TreeItem(t.id, vscode.TreeItemCollapsibleState.None);
    const eff = effectiveTaskType(t);
    const typeSuffix = eff ? ` · ${eff}` : "";
    ti.description = `${t.title}${typeSuffix}`;
    ti.tooltip = `${t.status}${t.priority ? ` · ${t.priority}` : ""}${typeSuffix}\n${t.title}`;
    ti.contextValue = "wkcTask";
    ti.command = {
      command: "workflowCannon.task.showDetail",
      title: "Task detail",
      arguments: [t.id]
    };
    return ti;
  }

  getChildren(element?: WkNode): vscode.ProviderResult<WkNode[]> {
    if (!element) {
      return this.loadRoots();
    }
    if (element.kind === "group") {
      return element.phaseBuckets;
    }
    if (element.kind === "wishlist-group") {
      return element.items.map((item) => ({ kind: "wishlist-item" as const, item }));
    }
    if (element.kind === "improvement-group") {
      return element.phaseBuckets;
    }
    if (element.kind === "phase-bucket") {
      return element.tasks.map((task) => ({ kind: "task" as const, task }));
    }
    return [];
  }

  private async loadRoots(): Promise<WkNode[]> {
    const [taskRes, dashRes] = await Promise.all([
      this.client.run("list-tasks", {}),
      this.client.run("dashboard-summary", {})
    ]);

    if (!taskRes.ok || !taskRes.data || !Array.isArray((taskRes.data as { tasks?: unknown }).tasks)) {
      return [];
    }

    const tasks = (taskRes.data as { tasks: unknown[] }).tasks;
    let workspace: { currentKitPhase: string | null; nextKitPhase: string | null } | null = null;
    if (dashRes.ok && dashRes.data && typeof dashRes.data === "object") {
      const ws = (dashRes.data as { workspaceStatus?: Record<string, unknown> }).workspaceStatus;
      if (ws && typeof ws === "object") {
        workspace = {
          currentKitPhase:
            typeof ws.currentKitPhase === "string" ? ws.currentKitPhase : null,
          nextKitPhase: typeof ws.nextKitPhase === "string" ? ws.nextKitPhase : null
        };
      }
    }
    return buildTaskTreeRootsFromTasks(tasks, workspace);
  }
}
