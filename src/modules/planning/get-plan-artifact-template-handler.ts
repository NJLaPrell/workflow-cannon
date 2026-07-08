import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { validatePlanArtifactDocument } from "../../core/planning/validate-plan-artifact.js";
import planArtifactKernelTemplate from "./fixtures/kernel/plan-artifact-template.v1.json" with { type: "json" };

export const PLAN_ARTIFACT_KERNEL_TEMPLATE_REL = "fixtures/kernel/plan-artifact-template.v1.json";

export async function runGetPlanArtifactTemplate(
  _args: Record<string, unknown>,
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const validation = validatePlanArtifactDocument(planArtifactKernelTemplate, {
    workspaceRoot: ctx.workspacePath
  });
  if (!validation.ok) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      message: "PlanArtifact kernel template failed schema validation",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        templateSource: PLAN_ARTIFACT_KERNEL_TEMPLATE_REL,
        errors: validation.errors
      }
    };
  }

  return {
    ok: true,
    code: "plan-artifact-template-retrieved",
    message: "PlanArtifact template retrieved",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      templateSource: PLAN_ARTIFACT_KERNEL_TEMPLATE_REL,
      artifact: validation.artifact
    }
  };
}
