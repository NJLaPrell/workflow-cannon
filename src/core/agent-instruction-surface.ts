import type { ModuleInstructionEntry, WorkflowModule } from "../contracts/module-contract.js";
import type { ModuleActivationReport, ModuleRegistry } from "./module-registry.js";

export type AgentInstructionDegradation =
  | { kind: "executable" }
  | { kind: "module_disabled" }
  | { kind: "peer_disabled"; missingPeers: string[] };

export type AgentInstructionSurfaceRow = {
  commandName: string;
  moduleId: string;
  /** Repo-relative path to the instruction markdown file. */
  instructionPath: string;
  executable: boolean;
  degradation: AgentInstructionDegradation;
};

export type AgentInstructionSurfacePayload = {
  schemaVersion: 1;
  commands: AgentInstructionSurfaceRow[];
  activationReport: ModuleActivationReport;
};

/**
 * Classifies whether an instruction can be executed via the command router for the
 * current enabled module set (owning module enabled + all requiresPeers enabled).
 */
export function classifyInstructionExecution(
  mod: WorkflowModule,
  entry: ModuleInstructionEntry,
  registry: ModuleRegistry
): AgentInstructionDegradation {
  const moduleId = mod.registration.id;
  if (!registry.isModuleEnabled(moduleId)) {
    return { kind: "module_disabled" };
  }
  const requires = entry.requiresPeers ?? [];
  const missing = requires.filter((peerId) => !registry.isModuleEnabled(peerId));
  if (missing.length > 0) {
    return { kind: "peer_disabled", missingPeers: missing };
  }
  return { kind: "executable" };
}

export function isInstructionExecutableForRegistry(
  mod: WorkflowModule,
  entry: ModuleInstructionEntry,
  registry: ModuleRegistry
): boolean {
  return classifyInstructionExecution(mod, entry, registry).kind === "executable";
}

/**
 * Full catalog for agents: every declared instruction, with executable vs documentation-only.
 */
export function buildAgentInstructionSurface(
  allModules: WorkflowModule[],
  registry: ModuleRegistry
): AgentInstructionSurfacePayload {
  const commands: AgentInstructionSurfaceRow[] = [];
  for (const mod of allModules) {
    const moduleId = mod.registration.id;
    const { directory, entries } = mod.registration.instructions;
    for (const entry of entries) {
      const degradation = classifyInstructionExecution(mod, entry, registry);
      const instructionPath = `${directory}/${entry.file}`.replace(/\\/g, "/");
      commands.push({
        commandName: entry.name,
        moduleId,
        instructionPath,
        executable: degradation.kind === "executable",
        degradation
      });
    }
  }
  commands.sort((a, b) => a.commandName.localeCompare(b.commandName));
  return {
    schemaVersion: 1,
    commands,
    activationReport: registry.getActivationReport()
  };
}
