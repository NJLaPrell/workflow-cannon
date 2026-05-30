/**
 * Workspace identity + planning store facts for `dashboard-summary.systemStatus`.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardPlanningStoreSummary,
  DashboardWorkspaceIdentity
} from "../../../contracts/dashboard-summary-run.js";
import type { DashboardCanonicalBackendSummary } from "../../../contracts/dashboard-summary-run.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { resolveCanonicalBackend } from "../persistence/canonical-backend-config.js";

export async function buildDashboardWorkspaceIdentity(workspacePath: string): Promise<DashboardWorkspaceIdentity> {
  const projectContextPath = path.join(workspacePath, ".workspace-kit", "generated", "project-context.json");
  let projectName: string | null = null;
  try {
    const raw = await fs.readFile(projectContextPath, "utf8");
    const j = JSON.parse(raw) as { projectName?: string };
    if (typeof j.projectName === "string" && j.projectName.trim().length > 0) {
      projectName = j.projectName.trim();
    }
  } catch {
    /* optional generated file */
  }

  const rootPkgPath = path.join(workspacePath, "package.json");
  let packageName: string | null = null;
  let rootPackageVersion: string | null = null;
  try {
    const raw = await fs.readFile(rootPkgPath, "utf8");
    const j = JSON.parse(raw) as { name?: string; version?: string };
    if (typeof j.name === "string" && j.name.trim().length > 0) {
      packageName = j.name.trim();
    }
    if (typeof j.version === "string" && j.version.trim().length > 0) {
      rootPackageVersion = j.version.trim();
    }
  } catch {
    /* missing or invalid */
  }

  const wkPkgPath = path.join(
    workspacePath,
    "node_modules",
    "@workflow-cannon",
    "workspace-kit",
    "package.json"
  );
  let workspaceKitVersion: string | null = null;
  try {
    const raw = await fs.readFile(wkPkgPath, "utf8");
    const j = JSON.parse(raw) as { version?: string };
    if (typeof j.version === "string" && j.version.trim().length > 0) {
      workspaceKitVersion = j.version.trim();
    }
  } catch {
    /* dev checkout without npm install, etc. */
  }

  return {
    schemaVersion: 1,
    projectName,
    packageName,
    workspaceKitVersion,
    rootPackageVersion
  };
}

export function buildDashboardPlanningStoreSummary(ctx: ModuleLifecycleContext): DashboardPlanningStoreSummary {
  return {
    schemaVersion: 1,
    backend: "sqlite",
    databaseRelativePath: planningSqliteDatabaseRelativePath(ctx)
  };
}

export function buildDashboardCanonicalBackendSummary(
  ctx: ModuleLifecycleContext
): DashboardCanonicalBackendSummary {
  const resolved = resolveCanonicalBackend(ctx.effectiveConfig as Record<string, unknown> | undefined);
  return {
    schemaVersion: 1,
    type: resolved.type,
    backendId: resolved.backendId,
    canonicalAuthority: resolved.canonicalAuthority,
    configSource: resolved.configSource,
    configConflict: resolved.configConflict,
    hostedImplemented: resolved.hostedImplemented
  };
}
