import fs from "node:fs";
import path from "node:path";

import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { resolveLatestPlanArtifactVersion } from "../../core/planning/plan-artifact-storage.js";
import {
  PLAN_DOCUMENT_OUTPUT_DIR,
  renderPlanDocumentMarkdown,
  resolvePlanDocumentOutputPath
} from "../../core/planning/render-plan-document-markdown.js";
import { readIdeaPlanArtifactVersion } from "../ideas/idea-plan-artifact-storage.js";

export async function runGeneratePlanDocument(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const planId = typeof args.planId === "string" ? args.planId.trim() : "";
  if (!planId) {
    return { ok: false, code: "invalid-run-args", message: "generate-plan-document requires planId" };
  }

  const dryRun = args.dryRun === true;
  const versionArg = typeof args.version === "number" && Number.isInteger(args.version) && args.version >= 1
    ? args.version
    : undefined;
  const latestVersion = resolveLatestPlanArtifactVersion(ctx.workspacePath, planId);
  if (latestVersion === null) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `Unified plan document ${planId} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId }
    };
  }
  const targetVersion = versionArg ?? latestVersion;
  const document = readIdeaPlanArtifactVersion(ctx.workspacePath, planId, targetVersion);
  if (!document) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `Unified plan document ${planId} version ${targetVersion} not found or not a valid IdeaPlan envelope`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion, latestVersion }
    };
  }

  const { markdown, summary } = renderPlanDocumentMarkdown(ctx.workspacePath, document);
  const outputPath = resolvePlanDocumentOutputPath(ctx.workspacePath, document);
  const outputRelative = path.relative(ctx.workspacePath, outputPath);

  if (!dryRun) {
    fs.mkdirSync(path.join(ctx.workspacePath, PLAN_DOCUMENT_OUTPUT_DIR), { recursive: true });
    const temp = `${outputPath}.tmp`;
    fs.writeFileSync(temp, markdown, "utf8");
    fs.renameSync(temp, outputPath);
  }

  return {
    ok: true,
    code: dryRun ? "plan-document-render-preview" : "plan-document-generated",
    message: dryRun
      ? `Rendered plan document preview for ${planId} version ${targetVersion}`
      : `Wrote plan document for ${planId} version ${targetVersion}`,
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId,
      version: targetVersion,
      latestVersion,
      ideaId: document.ideaId,
      status: document.status,
      dryRun,
      outputPath: outputRelative,
      renderSummary: summary
    }
  };
}
