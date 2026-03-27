import * as vscode from "vscode";
import fs from "node:fs/promises";
import path from "node:path";

/** Debounce refresh when `.workspace-kit` task or config files change. */
export class StateWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly dataWatchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private static readonly CONFIG_PATH = ".workspace-kit/config.json";
  private static readonly DEFAULT_TASK_STORE_PATH = ".workspace-kit/tasks/state.json";
  private static readonly DEFAULT_SQLITE_DB_PATH = ".workspace-kit/tasks/workspace-kit.db";

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly onChange: () => void
  ) {}

  start(): void {
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceFolder, StateWatcher.CONFIG_PATH)
    );
    this.disposables.push(configWatcher);
    const onConfigChanged = () => {
      void this.refreshDataWatchers();
      this.fireDebounced();
    };
    configWatcher.onDidChange(onConfigChanged);
    configWatcher.onDidCreate(onConfigChanged);
    configWatcher.onDidDelete(onConfigChanged);
    void this.refreshDataWatchers();
  }

  private async refreshDataWatchers(): Promise<void> {
    for (const watcher of this.dataWatchers) {
      watcher.dispose();
    }
    this.dataWatchers.length = 0;

    const patterns = await this.resolveWatchPatterns();
    for (const p of patterns) {
      if (p === StateWatcher.CONFIG_PATH) {
        continue;
      }
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceFolder, p));
      this.dataWatchers.push(w);
      w.onDidChange(() => this.fireDebounced());
      w.onDidCreate(() => this.fireDebounced());
      w.onDidDelete(() => this.fireDebounced());
    }
  }

  private async resolveWatchPatterns(): Promise<string[]> {
    const patterns = new Set<string>([
      StateWatcher.DEFAULT_TASK_STORE_PATH,
      StateWatcher.DEFAULT_SQLITE_DB_PATH,
      StateWatcher.CONFIG_PATH
    ]);
    const configPath = path.join(this.workspaceFolder.uri.fsPath, StateWatcher.CONFIG_PATH);
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const tasks = parsed.tasks;
      if (tasks && typeof tasks === "object" && !Array.isArray(tasks)) {
        const taskStoreRelativePath = (tasks as Record<string, unknown>).storeRelativePath;
        if (typeof taskStoreRelativePath === "string" && taskStoreRelativePath.trim().length > 0) {
          patterns.add(taskStoreRelativePath.trim());
        }
        const sqlitePath = (tasks as Record<string, unknown>).sqliteDatabaseRelativePath;
        if (typeof sqlitePath === "string" && sqlitePath.trim().length > 0) {
          patterns.add(sqlitePath.trim());
        }
      }
    } catch {
      /* no config or parse issue: keep safe defaults */
    }
    return [...patterns];
  }

  private fireDebounced(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.onChange();
    }, 400);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const watcher of this.dataWatchers) {
      watcher.dispose();
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
