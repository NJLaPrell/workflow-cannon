import fs from "node:fs";
import path from "node:path";

export function isWorkflowCannonWorkspace(rootPath: string): boolean {
  return fs.existsSync(path.join(rootPath, ".workspace-kit", "manifest.json"));
}

export function findWorkflowCannonRootFromPaths(paths: string[]): string | null {
  for (const root of paths) {
    if (isWorkflowCannonWorkspace(root)) {
      return root;
    }
  }
  return null;
}
