import { ModuleRegistry } from "../core/module-registry.js";
import { resolveWorkspaceConfigWithLayers } from "../core/workspace-kit-config.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import { defaultRegistryModules } from "../modules/index.js";

export type DoctorPlanningIssue = { path: string; reason: string };

/** Resolve layered config and run SQLite planning persistence checks for `workspace-kit doctor`. */
export async function collectDoctorPlanningPersistenceIssues(
  cwd: string
): Promise<DoctorPlanningIssue[]> {
  try {
    const registry = new ModuleRegistry(defaultRegistryModules);
    const { effective } = await resolveWorkspaceConfigWithLayers({
      workspacePath: cwd,
      registry,
      invocationConfig: {}
    });
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
