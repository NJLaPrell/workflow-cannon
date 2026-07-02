import fs from "node:fs";
import path from "node:path";

import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { resolveLatestPlanArtifactVersion, readPlanArtifactVersion } from "../../core/planning/plan-artifact-storage.js";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import {
  PLAN_DOCUMENT_OUTPUT_DIR,
  renderPlanDocumentMarkdown,
  resolvePlanDocumentOutputPath
} from "../../core/planning/render-plan-document-markdown.js";
import { readIdeaPlanArtifactVersion } from "../ideas/idea-plan-artifact-storage.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "../ideas/idea-plan-planning-init.js";
import type { IdeaPlanDocument, IdeaPlanStatus } from "../ideas/idea-plan-types.js";

function legacyStatusToIdeaPlanStatus(status: PlanArtifactV1["status"]): IdeaPlanStatus {
  switch (status) {
    case "reviewed":
      return "reviewed";
    case "accepted":
      return "accepted";
    case "finalized":
      return "delivered";
    default:
      return "planning";
  }
}

function ideaPlanDocumentFromLegacyArtifact(artifact: PlanArtifactV1): IdeaPlanDocumentWithPlanningPayload {
  const sourceIdeaId = typeof artifact.provenance.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "";
  const ideaId = /^I[0-9]+$/.test(sourceIdeaId) ? sourceIdeaId : "I000";
  return {
    schemaVersion: 1,
    planId: artifact.planId,
    version: artifact.version,
    planRef: artifact.planRef,
    status: legacyStatusToIdeaPlanStatus(artifact.status),
    ideaId,
    createdAt: artifact.provenance.createdAt,
    updatedAt: artifact.provenance.updatedAt,
    plan: {
      title: artifact.identity.title,
      summary: artifact.identity.summary,
      planningType: artifact.identity.planningType,
      wbsRowCount: artifact.wbs.length
    },
    identity: artifact.identity,
    goals: artifact.goals,
    nonGoals: artifact.nonGoals,
    userStories: artifact.userStories,
    valueAssessment: artifact.valueAssessment,
    riskAssessment: artifact.riskAssessment,
    technicalImpact: artifact.technicalImpact,
    architecture: artifact.architecture,
    uiUxDirection: artifact.uiUxDirection,
    testingStrategy: artifact.testingStrategy,
    implementationGuidance: artifact.implementationGuidance,
    whatNotToDo: artifact.whatNotToDo,
    assumptions: artifact.assumptions,
    openQuestions: artifact.openQuestions,
    wbs: artifact.wbs,
    phaseRecommendations: artifact.phaseRecommendations,
    taskGenerationPayloads: artifact.taskGenerationPayloads,
    provenance: artifact.provenance,
    ...(artifact.approvalRecord
      ? {
          acceptance: {
            acceptedAt: artifact.approvalRecord.approvedAt,
            acceptedBy: artifact.approvalRecord.approvedBy,
            acceptedVersion: artifact.approvalRecord.approvedVersion
          }
        }
      : {})
  };
}

function resolvePlanDocumentForRender(
  workspacePath: string,
  planId: string,
  version: number
): IdeaPlanDocument | null {
  const ideaPlan = readIdeaPlanArtifactVersion(workspacePath, planId, version);
  if (ideaPlan) {
    return ideaPlan;
  }
  const legacy = readPlanArtifactVersion(workspacePath, planId, version);
  if (!legacy?.identity) {
    return null;
  }
  return ideaPlanDocumentFromLegacyArtifact(legacy);
}

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
  const document = resolvePlanDocumentForRender(ctx.workspacePath, planId, targetVersion);
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
