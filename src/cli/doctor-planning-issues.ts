import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { readWorkspaceStatusSnapshot } from "../modules/task-engine/dashboard-status.js";
import { resolveCanonicalPhase } from "../modules/task-engine/phase-resolution.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import { defaultRegistryModules } from "../modules/index.js";

export type DoctorPlanningIssue = { path: string; reason: string };

export async function collectDoctorKitPhaseIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorPlanningIssue[]> {
  const workspaceStatus = await readWorkspaceStatusSnapshot(cwd);
  const r = resolveCanonicalPhase({ effectiveConfig: effective, workspaceStatus });
  if (r.statusYamlMatchesConfig === false) {
    return [
      {
        path: "kit.currentPhaseNumber vs docs/maintainers/data/workspace-kit-status.yaml",
        reason: "kit-phase-config-status-yaml-mismatch"
      }
    ];
  }
  return [];
}

/** Resolve layered config and run SQLite planning persistence checks for `workspace-kit doctor`. */
export async function collectDoctorPlanningPersistenceIssues(
  cwd: string
): Promise<DoctorPlanningIssue[]> {
  try {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
    const persistence = validatePlanningPersistenceForDoctor(cwd, effective);
    const phaseIssues = await collectDoctorKitPhaseIssues(cwd, effective);
    return [...persistence, ...phaseIssues];
  } catch (err) {
    return [
      {
        path: "workspace-config",
        reason: `config-resolution-failed: ${(err as Error).message}`
      }
    ];
  }
}
