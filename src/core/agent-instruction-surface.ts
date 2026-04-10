import type { ModuleInstructionEntry, WorkflowModule } from "../contracts/module-contract.js";
import { buildCaeAdvisoryInstructionSurfaceBlock } from "./cae/cae-instruction-surface-advisory.js";
import { buildErrorRemediationCatalog } from "./cli-remediation.js";
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

export type ErrorRemediationCatalogPayload = {
  schemaVersion: 1;
  entries: ReturnType<typeof buildErrorRemediationCatalog>;
};

/** Bounded CAE advisory block (**`T865`** / **`.ai/cae/advisory-surfacing.md`**). */
export type AgentInstructionSurfaceCae = {
  schemaVersion: 1;
  advisory: true;
  traceId?: string;
  summary: {
    policyCount: number;
    thinkCount: number;
    doCount: number;
    reviewCount: number;
    shadow: boolean;
  };
  issues: Array<{ code: string; detail?: string }>;
  truncated?: boolean;
  /** Optional diagnostic: trace event count from inline evaluate. */
  traceEventCount?: number;
};

export type AgentInstructionSurfacePayload = {
  schemaVersion: 1;
  commands: AgentInstructionSurfaceRow[];
  activationReport: ModuleActivationReport;
  /** Stable `code` values with repo-relative doc/instruction hints (Phase 52). */
  errorRemediationCatalog: ErrorRemediationCatalogPayload;
  /** Present when `kit.cae.enabled` + `kit.cae.advisoryInstructionSurface` are true. */
  cae?: AgentInstructionSurfaceCae;
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
export type BuildAgentInstructionSurfaceOptions = {
  workspacePath?: string;
  effectiveConfig?: Record<string, unknown>;
};

export function buildAgentInstructionSurface(
  allModules: WorkflowModule[],
  registry: ModuleRegistry,
  options?: BuildAgentInstructionSurfaceOptions
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
  const base: AgentInstructionSurfacePayload = {
    schemaVersion: 1,
    commands,
    activationReport: registry.getActivationReport(),
    errorRemediationCatalog: {
      schemaVersion: 1,
      entries: buildErrorRemediationCatalog()
    }
  };
  const ws = options?.workspacePath;
  const eff = options?.effectiveConfig;
  if (ws && eff) {
    const cae = buildCaeAdvisoryInstructionSurfaceBlock(ws, eff);
    if (cae) base.cae = cae;
  }
  return base;
}
