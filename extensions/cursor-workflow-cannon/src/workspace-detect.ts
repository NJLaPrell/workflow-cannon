import * as vscode from "vscode";
import { findWorkflowCannonRootFromPaths } from "./workspace-detect-core.js";

/** First workspace folder that has a Workflow Cannon manifest. */
export function findWorkflowCannonRoot(): string | null {
  const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  return findWorkflowCannonRootFromPaths(roots);
}
