import * as vscode from "vscode";
import fs from "node:fs";
import path from "node:path";

/** First workspace folder that has a Workflow Cannon manifest. */
export function findWorkflowCannonRoot(): string | null {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const manifest = path.join(folder.uri.fsPath, ".workspace-kit", "manifest.json");
    if (fs.existsSync(manifest)) {
      return folder.uri.fsPath;
    }
  }
  return null;
}
