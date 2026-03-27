import * as vscode from "vscode";

/** Debounce refresh when `.workspace-kit` task or config files change. */
export class StateWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly onChange: () => void
  ) {}

  start(): void {
    const patterns = [".workspace-kit/tasks/state.json", ".workspace-kit/config.json"];
    for (const p of patterns) {
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceFolder, p));
      this.disposables.push(w);
      w.onDidChange(() => this.fireDebounced());
      w.onDidCreate(() => this.fireDebounced());
      w.onDidDelete(() => this.fireDebounced());
    }
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
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
