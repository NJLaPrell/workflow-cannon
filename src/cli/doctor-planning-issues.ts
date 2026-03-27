import { ModuleRegistry } from "../core/module-registry.js";
import { resolveWorkspaceConfigWithLayers } from "../core/workspace-kit-config.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import { documentationModule } from "../modules/documentation/index.js";
import { taskEngineModule } from "../modules/task-engine/index.js";
import { approvalsModule } from "../modules/approvals/index.js";
import { planningModule } from "../modules/planning/index.js";
import { improvementModule } from "../modules/improvement/index.js";
import { workspaceConfigModule } from "../modules/workspace-config/index.js";

const defaultRegistryModules = [
  workspaceConfigModule,
  documentationModule,
  taskEngineModule,
  approvalsModule,
  planningModule,
  improvementModule
];

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
