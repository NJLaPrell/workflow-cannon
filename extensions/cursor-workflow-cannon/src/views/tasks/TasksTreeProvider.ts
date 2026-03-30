import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import { groupTasksByStatus } from "./grouping.js";

type TaskEntity = { id: string; title: string; status: string; priority?: string; phase?: string };
type WishlistRow = { id: string; title: string };

type WkGroup = { kind: "group"; label: string; status: string; tasks: TaskEntity[] };
type WkTask = { kind: "task"; task: TaskEntity };
type WkWishlistGroup = { kind: "wishlist-group"; items: WishlistRow[] };
type WkWishlistItem = { kind: "wishlist-item"; item: WishlistRow };
type WkNode = WkGroup | WkTask | WkWishlistGroup | WkWishlistItem;

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
    if (element.kind === "wishlist-group") {
      const n = element.items.length;
      const ti = new vscode.TreeItem(
        `Wishlist — open (${n})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      ti.id = "g:wishlist-open";
      ti.iconPath = new vscode.ThemeIcon("lightbulb");
      ti.description = "W### · ideation until convert-wishlist";
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
    ti.description = t.title;
    ti.tooltip = `${t.status}${t.priority ? ` · ${t.priority}` : ""}\n${t.title}`;
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
      return element.tasks.map((task) => ({ kind: "task" as const, task }));
    }
    if (element.kind === "wishlist-group") {
      return element.items.map((item) => ({ kind: "wishlist-item" as const, item }));
    }
    return [];
  }

  private async loadRoots(): Promise<WkNode[]> {
    const [taskRes, wishRes] = await Promise.all([
      this.client.run("list-tasks", {}),
      this.client.run("list-wishlist", { status: "open" })
    ]);

    const roots: WkNode[] = [];

    if (taskRes.ok && taskRes.data && Array.isArray((taskRes.data as { tasks?: unknown }).tasks)) {
      const tasks = (taskRes.data as { tasks: TaskEntity[] }).tasks;
      roots.push(
        ...groupTasksByStatus(tasks).map((g) => ({
          kind: "group" as const,
          status: g.status,
          label: g.label,
          tasks: g.tasks
        }))
      );
    }

    if (wishRes.ok && wishRes.data && Array.isArray((wishRes.data as { items?: unknown }).items)) {
      const items = (wishRes.data as { items: WishlistRow[] }).items.filter(
        (i) => typeof i?.id === "string" && typeof i?.title === "string"
      );
      if (items.length > 0) {
        roots.push({ kind: "wishlist-group", items });
      }
    }

    return roots;
  }
}
