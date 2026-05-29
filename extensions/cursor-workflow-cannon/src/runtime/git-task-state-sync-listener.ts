import * as vscode from "vscode";
import type { TaskStateSyncCoordinator } from "./task-state-sync-coordinator.js";
import { logWc } from "./workflow-cannon-log.js";

type GitRepositoryState = {
  HEAD?: { commit?: string | undefined };
  onDidChange: vscode.Event<void>;
};

type GitRepository = {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
};

type GitExtensionExports = {
  getAPI(version: 1): {
    repositories: readonly GitRepository[];
    onDidOpenRepository: vscode.Event<GitRepository>;
  };
};

function readGitHeadSyncOnChangeSetting(): boolean {
  return vscode.workspace.getConfiguration("workflowCannon").get<boolean>("taskStateSync.onGitHeadChange") !== false;
}

function normalizePath(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

/** Request task-state sync when vscode.git reports a new HEAD (pull, merge, rebase, checkout). */
export function registerGitTaskStateSyncListener(
  workspaceFolder: vscode.WorkspaceFolder,
  coordinator: TaskStateSyncCoordinator,
  disposables: vscode.Disposable[]
): void {
  if (!readGitHeadSyncOnChangeSetting()) {
    return;
  }

  const workspaceRoot = normalizePath(workspaceFolder.uri.fsPath);
  const headByRepo = new Map<string, string | undefined>();

  const wireRepository = (repo: GitRepository): void => {
    if (normalizePath(repo.rootUri.fsPath) !== workspaceRoot) {
      return;
    }
    const key = repo.rootUri.toString();
    headByRepo.set(key, repo.state.HEAD?.commit);

    disposables.push(
      repo.state.onDidChange(() => {
        const next = repo.state.HEAD?.commit;
        const prev = headByRepo.get(key);
        if (next && prev && next !== prev) {
          headByRepo.set(key, next);
          logWc("task-state-sync", `git HEAD changed ${prev.slice(0, 7)} → ${next.slice(0, 7)}`);
          coordinator.requestSync("git-head-changed");
        } else if (next !== prev) {
          headByRepo.set(key, next);
        }
      })
    );
  };

  void (async () => {
    try {
      const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
      if (!ext) {
        logWc("task-state-sync", "vscode.git not available — skipping HEAD listener");
        return;
      }
      const gitApi = ext.isActive ? ext.exports.getAPI(1) : (await ext.activate()).getAPI(1);
      for (const repo of gitApi.repositories) {
        wireRepository(repo);
      }
      disposables.push(gitApi.onDidOpenRepository(wireRepository));
    } catch (err) {
      logWc(
        "task-state-sync",
        `failed to attach git HEAD listener: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();
}
