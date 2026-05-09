/**
 * Default-registry reconciliation read model (CAEUX-P2-04 / T100089).
 */

import { stableStringifyForCaeDigest } from "./cae-registry-load.js";
import type { CaeLoadedRegistry, CaeRegistryArtifactRow } from "./cae-registry-load.js";
import { classifyCaeArtifactIdNamespace } from "./workspace-artifact-conventions.js";

function rowDigest(row: CaeRegistryArtifactRow): string {
  return stableStringifyForCaeDigest(row);
}

/** `workspace.foo` → `cae.foo` pairing heuristic (same stem after prefix). */
export function defaultArtifactIdForWorkspaceClone(workspaceArtifactId: string): string | null {
  const id = workspaceArtifactId.trim();
  if (!id.startsWith("workspace.")) return null;
  return `cae.${id.slice("workspace.".length)}`;
}

export type CaeReconcileDefaultsAction = {
  kind: "compare_defaults" | "adopt_package_default" | "duplicate_package_default" | "review_workspace_clone";
  artifactId: string;
  note: string;
};

export type CaeReconcileDefaultsReport = {
  schemaVersion: 1;
  packageRegistryDigest: string;
  activeRegistryDigest: string;
  newDefaultsInPackage: string[];
  missingDefaultsOnActive: string[];
  changedDefaults: Array<{ artifactId: string; packageDigest: string; activeDigest: string }>;
  hiddenDefaultsInPackage: string[];
  workspaceCloneCandidates: Array<{
    workspaceArtifactId: string;
    pairedDefaultArtifactId: string | null;
    packageDefaultDigest: string | null;
    workspaceDigest: string;
  }>;
  recommendedActions: CaeReconcileDefaultsAction[];
};

function collectHiddenDefaults(pkg: CaeLoadedRegistry): string[] {
  const out: string[] = [];
  for (const [id, row] of pkg.artifactById) {
    if (classifyCaeArtifactIdNamespace(id) !== "default") continue;
    const meta = row.metadata as Record<string, unknown> | undefined;
    const hidden = meta && (meta.hidden === true || meta.visibility === "hidden");
    if (hidden) out.push(id);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function buildCaeReconcileDefaultsReport(
  packageRegistry: CaeLoadedRegistry,
  activeRegistry: CaeLoadedRegistry
): CaeReconcileDefaultsReport {
  const pkg = packageRegistry;
  const act = activeRegistry;

  const newDefaults: string[] = [];
  const missing: string[] = [];
  const changed: CaeReconcileDefaultsReport["changedDefaults"] = [];
  const cloneCandidates: CaeReconcileDefaultsReport["workspaceCloneCandidates"] = [];
  const actions: CaeReconcileDefaultsAction[] = [];

  for (const [id, row] of pkg.artifactById) {
    if (classifyCaeArtifactIdNamespace(id) !== "default") continue;
    const activeRow = act.artifactById.get(id);
    if (!activeRow) {
      newDefaults.push(id);
      actions.push({
        kind: "adopt_package_default",
        artifactId: id,
        note: "Package ships a new default artifact id not present on the active registry version."
      });
      continue;
    }
    const pd = rowDigest(row);
    const ad = rowDigest(activeRow);
    if (pd !== ad) {
      changed.push({ artifactId: id, packageDigest: pd, activeDigest: ad });
      actions.push({
        kind: "compare_defaults",
        artifactId: id,
        note: "Default artifact differs between package seed JSON and active SQLite registry."
      });
    }
  }

  for (const [id, row] of act.artifactById) {
    if (classifyCaeArtifactIdNamespace(id) !== "default") continue;
    if (!pkg.artifactById.has(id)) {
      missing.push(id);
    }
  }

  for (const [wsId, wsRow] of act.artifactById) {
    if (classifyCaeArtifactIdNamespace(wsId) !== "workspace") continue;
    const paired = defaultArtifactIdForWorkspaceClone(wsId);
    if (!paired || !pkg.artifactById.has(paired)) {
      continue;
    }
    const pkgRow = pkg.artifactById.get(paired)!;
    const wd = rowDigest(wsRow);
    const pd = rowDigest(pkgRow);
    if (wd === pd) continue;
    cloneCandidates.push({
      workspaceArtifactId: wsId,
      pairedDefaultArtifactId: paired,
      packageDefaultDigest: pd,
      workspaceDigest: wd
    });
    actions.push({
      kind: "review_workspace_clone",
      artifactId: wsId,
      note: `Workspace artifact diverges from paired package default '${paired}'.`
    });
  }

  const hiddenDefaultsInPackage = collectHiddenDefaults(pkg);

  return {
    schemaVersion: 1,
    packageRegistryDigest: pkg.registryDigest,
    activeRegistryDigest: act.registryDigest,
    newDefaultsInPackage: newDefaults.sort((a, b) => a.localeCompare(b)),
    missingDefaultsOnActive: missing.sort((a, b) => a.localeCompare(b)),
    changedDefaults: changed.sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    hiddenDefaultsInPackage,
    workspaceCloneCandidates: cloneCandidates.sort((a, b) => a.workspaceArtifactId.localeCompare(b.workspaceArtifactId)),
    recommendedActions: actions
  };
}
