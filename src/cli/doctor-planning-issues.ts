import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import { defaultRegistryModules } from "../modules/index.js";

export type DoctorPlanningIssue = { path: string; reason: string };

/** Resolve layered config and run SQLite planning persistence checks for `workspace-kit doctor`. */
export async function collectDoctorPlanningPersistenceIssues(
  cwd: string
): Promise<DoctorPlanningIssue[]> {
  try {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
    return validatePlanningPersistenceForDoctor(cwd, effective);
  } catch (err) {
    return [
      {
        path: "workspace-config",
        reason: `config-resolution-failed: ${(err as Error).message}`
      }
    ];
  }
}
