import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { listPlanArtifactVersionSummaries, summarizePlanArtifactLineage } from "../../core/planning/plan-artifact-immutability.js";
import { readLatestPlanArtifact, readPlanArtifactVersion } from "../../core/planning/plan-artifact-storage.js";
function parseVersion(raw: unknown): number | undefined { return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined; }
export async function runGetPlanArtifact(args: Record<string, unknown>, ctx: ModuleLifecycleContext): Promise<ModuleCommandResult> {
  const planId = typeof args.planId === "string" ? args.planId.trim() : "";
  if (!planId) return { ok: false, code: "invalid-run-args", message: "get-plan-artifact requires planId" };
  const versions = listPlanArtifactVersionSummaries(ctx.workspacePath, planId);
  if (versions.length === 0) return { ok: false, code: "plan-artifact-not-found", message: `PlanArtifact ${planId} not found`, data: { schemaVersion: 1, responseSchemaVersion: 1, planId } };
  const latestVersion = versions[versions.length - 1]!.version;
  const targetVersion = parseVersion(args.version) ?? latestVersion;
  const loaded = readPlanArtifactVersion(ctx.workspacePath, planId, targetVersion);
  if (!loaded) return { ok: false, code: "plan-artifact-not-found", message: `PlanArtifact ${planId} version ${targetVersion} not found`, data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion, latestVersion } };
  const latest = readLatestPlanArtifact(ctx.workspacePath, planId);
  return { ok: true, code: "plan-artifact-retrieved", message: `PlanArtifact ${planId} version ${targetVersion} retrieved`, data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion, latestVersion, planRef: loaded.planRef, status: loaded.status, immutable: versions.find((row) => row.version === targetVersion)?.immutable ?? false, storagePath: versions.find((row) => row.version === targetVersion)?.storagePath, versions, lineage: summarizePlanArtifactLineage(loaded), ...(latest ? { latestLineage: summarizePlanArtifactLineage(latest) } : {}), ...(args.includeArtifact === false ? {} : { artifact: loaded }) } };
}
