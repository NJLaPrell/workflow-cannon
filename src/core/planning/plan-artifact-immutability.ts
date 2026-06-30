import fs from "node:fs";
import type { PlanArtifactStatus, PlanArtifactV1 } from "./plan-artifact-v1.js";
import { getPlanArtifactStoragePaths, readPlanArtifactVersion, resolveLatestPlanArtifactVersion } from "./plan-artifact-storage.js";
export const IMMUTABLE_PLAN_ARTIFACT_STATUSES: readonly PlanArtifactStatus[] = ["accepted","finalized","superseded"];
export function isPlanArtifactStatusImmutable(status: PlanArtifactStatus): boolean { return IMMUTABLE_PLAN_ARTIFACT_STATUSES.includes(status); }
export type PlanArtifactVersionSummary = { version: number; status: PlanArtifactStatus; immutable: boolean; storagePath: string; updatedAt: string; planRef: string; };
export type PlanArtifactLineageSummary = { planRef: string; sourceIdeaId?: string; previousPlanArtifacts: string[]; chatSessionRef?: string; };
export class PlanArtifactVersionImmutableError extends Error {
  readonly code = "plan-artifact-version-immutable" as const; readonly planId: string; readonly version: number; readonly status: PlanArtifactStatus;
  constructor(planId: string, version: number, status: PlanArtifactStatus) {
    super(`PlanArtifact ${planId} version ${version} is ${status} and cannot be overwritten`);
    this.name = "PlanArtifactVersionImmutableError"; this.planId = planId; this.version = version; this.status = status;
  }
}
function listVersionNumbers(planDirAbsolute: string): number[] {
  if (!fs.existsSync(planDirAbsolute)) return [];
  const versions: number[] = [];
  for (const name of fs.readdirSync(planDirAbsolute)) { const m = /^artifact\.v(\d+)\.json$/.exec(name); if (m) versions.push(Number(m[1])); }
  return versions.sort((a,b)=>a-b);
}
export function listPlanArtifactVersionSummaries(workspacePath: string, planId: string): PlanArtifactVersionSummary[] {
  const paths = getPlanArtifactStoragePaths(workspacePath, planId); const summaries: PlanArtifactVersionSummary[] = [];
  for (const version of listVersionNumbers(paths.planDirAbsolute)) {
    const artifact = readPlanArtifactVersion(workspacePath, planId, version); if (!artifact) continue;
    summaries.push({ version: artifact.version, status: artifact.status, immutable: isPlanArtifactStatusImmutable(artifact.status), storagePath: paths.artifactFileRelative(artifact.version), updatedAt: artifact.provenance.updatedAt, planRef: artifact.planRef });
  }
  return summaries;
}
export function summarizePlanArtifactLineage(artifact: PlanArtifactV1): PlanArtifactLineageSummary {
  const previousPlanArtifacts = Array.isArray(artifact.provenance.previousPlanArtifacts) ? artifact.provenance.previousPlanArtifacts.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0) : [];
  const sourceIdeaId = typeof artifact.provenance.sourceIdeaId === "string" && artifact.provenance.sourceIdeaId.trim() ? artifact.provenance.sourceIdeaId.trim() : undefined;
  const chatSessionRef = typeof artifact.provenance.chatSessionRef === "string" && artifact.provenance.chatSessionRef.trim() ? artifact.provenance.chatSessionRef.trim() : undefined;
  return { planRef: artifact.planRef, ...(sourceIdeaId ? { sourceIdeaId } : {}), previousPlanArtifacts, ...(chatSessionRef ? { chatSessionRef } : {}) };
}
export function findImmutablePlanArtifactVersion(workspacePath: string, planId: string, version: number): PlanArtifactVersionImmutableError | null {
  const existing = readPlanArtifactVersion(workspacePath, planId, version);
  if (!existing || !isPlanArtifactStatusImmutable(existing.status)) return null;
  return new PlanArtifactVersionImmutableError(planId, version, existing.status);
}
export function assertPlanArtifactVersionWritable(workspacePath: string, planId: string, version: number): void {
  const conflict = findImmutablePlanArtifactVersion(workspacePath, planId, version); if (conflict) throw conflict;
}
