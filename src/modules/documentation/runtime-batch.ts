import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { DocumentationBatchResult, DocumentationGenerateOptions, DocumentationGenerateResult } from "./types.js";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { listViewModels, loadViewModel } from "./view-models.js";
import { loadRuntimeConfig } from "./runtime-config.js";

type GenerateAllDocumentsArgs = {
  options?: DocumentationGenerateOptions;
};

export async function runGenerateAllDocuments(
  args: GenerateAllDocumentsArgs,
  ctx: ModuleLifecycleContext,
  generateOne: (args: { documentType?: string; options?: DocumentationGenerateOptions }, ctx: ModuleLifecycleContext) => Promise<DocumentationGenerateResult>
): Promise<DocumentationBatchResult> {
  const config = await loadRuntimeConfig(ctx.workspacePath);
  const workspaceViewsRoot = resolve(ctx.workspacePath, "src/modules/documentation/views");
  const useWorkspaceViews = existsSync(workspaceViewsRoot);
  const workItems: Array<{ documentType: string }> = [];
  if (useWorkspaceViews) {
    const viewFiles = await listViewModels(ctx.workspacePath);
    for (const viewFile of viewFiles) {
      const view = await loadViewModel(ctx.workspacePath, viewFile);
      workItems.push({ documentType: view.target });
    }
  } else {
    const templatesDir = resolve(config.sourceRoot, config.templatesRoot);
    const listTemplateFiles = async (dir: string, baseDir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const absPath = resolve(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await listTemplateFiles(absPath, baseDir)));
        if (entry.isFile() && entry.name.endsWith(".md")) files.push(absPath.slice(baseDir.length + 1).split("\\").join("/"));
      }
      return files;
    };
    for (const templateFile of (await listTemplateFiles(templatesDir, templatesDir)).sort()) {
      workItems.push({ documentType: templateFile });
    }
  }
  const results: DocumentationGenerateResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const batchOptions: DocumentationGenerateOptions = {
    ...args.options,
    overwriteAi: args.options?.overwriteAi ?? false,
    overwriteHuman: args.options?.overwriteHuman ?? true,
    strict: args.options?.strict ?? false
  };

  for (const item of workItems) {
    const result = await generateOne({ documentType: item.documentType, options: batchOptions }, ctx);
    results.push(result);
    if (!result.ok) failed += 1;
    else if (result.evidence.filesWritten.length > 0) succeeded += 1;
    else skipped += 1;
  }

  return {
    ok: failed === 0,
    results,
    summary: {
      total: workItems.length,
      succeeded,
      failed,
      skipped,
      timestamp: new Date().toISOString()
    }
  };
}
