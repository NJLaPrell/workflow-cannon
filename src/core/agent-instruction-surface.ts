import { createHash } from "node:crypto";
import type { ModuleInstructionEntry, WorkflowModule } from "../contracts/module-contract.js";
import { buildCaeAdvisoryInstructionSurfaceBlock } from "./cae/cae-instruction-surface-advisory.js";
import { buildErrorRemediationCatalog } from "./cli-remediation.js";
import type { ModuleActivationReport, ModuleRegistry } from "./module-registry.js";
import {
  isSensitiveModuleCommandForEffective,
  resolvePolicyOperationIdForCommand
} from "./policy.js";

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
  /** When `effectiveConfig` was supplied to the builder and the row is executable: Tier A/B sensitive runs need JSON `policyApproval`. */
  jsonApprovalRequired?: boolean;
  /** Stable operation id when sensitivity is registered (often absent for Tier C). */
  policyOperationId?: string | null;
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

export type AgentInstructionSurfaceCommandCounts = {
  total: number;
  executable: number;
  documentationOnly: number;
};

/** Full instruction catalog — every declared row (token-heavy). */
export type AgentInstructionSurfacePayloadFull = {
  schemaVersion: 1;
  /** Absent or `full` — default machine projection. */
  projection?: "full";
  commands: AgentInstructionSurfaceRow[];
  activationReport: ModuleActivationReport;
  /** Stable `code` values with repo-relative doc/instruction hints (Phase 52). */
  errorRemediationCatalog: ErrorRemediationCatalogPayload;
  /** Present when `kit.cae.enabled` + `kit.cae.advisoryInstructionSurface` are true. */
  cae?: AgentInstructionSurfaceCae;
};

/**
 * Digest-only projection: compare `instructionSurfaceDigest` to a cached full payload;
 * when unchanged, agents skip reloading `commands[]`.
 */
export type AgentInstructionSurfacePayloadLean = {
  schemaVersion: 1;
  projection: "lean";
  instructionSurfaceDigest: string;
  commandCounts: AgentInstructionSurfaceCommandCounts;
  activationReport: ModuleActivationReport;
  errorRemediationCatalog: ErrorRemediationCatalogPayload;
  cae?: AgentInstructionSurfaceCae;
};

export type AgentInstructionSurfacePayload =
  | AgentInstructionSurfacePayloadFull
  | AgentInstructionSurfacePayloadLean;

export function isAgentInstructionSurfaceFull(
  surface: AgentInstructionSurfacePayload
): surface is AgentInstructionSurfacePayloadFull {
  return surface.projection !== "lean";
}

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
  /** When `"lean"`, omit `commands` and return a stable digest for cache checks (Phase 76). */
  projection?: "full" | "lean";
};

function stableInstructionRowJSON(row: AgentInstructionSurfaceRow): string {
  const degradation =
    row.degradation.kind === "peer_disabled"
      ? {
          kind: row.degradation.kind,
          missingPeers: [...row.degradation.missingPeers].sort()
        }
      : { kind: row.degradation.kind };
  const base: Record<string, unknown> = {
    commandName: row.commandName,
    degradation,
    executable: row.executable,
    instructionPath: row.instructionPath,
    moduleId: row.moduleId
  };
  if (row.jsonApprovalRequired !== undefined) {
    base.jsonApprovalRequired = row.jsonApprovalRequired;
  }
  if (row.policyOperationId !== undefined) {
    base.policyOperationId = row.policyOperationId;
  }
  return JSON.stringify(base);
}

/** Stable digest over the sorted command row set (for lean projection cache hits). */
export function digestAgentInstructionSurfaceCommands(commands: AgentInstructionSurfaceRow[]): string {
  const body = commands.map(stableInstructionRowJSON).join("\n");
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function collectInstructionSurfaceRows(
  allModules: WorkflowModule[],
  registry: ModuleRegistry,
  effectiveConfig?: Record<string, unknown>
): AgentInstructionSurfaceRow[] {
  const commands: AgentInstructionSurfaceRow[] = [];
  for (const mod of allModules) {
    const moduleId = mod.registration.id;
    const { directory, entries } = mod.registration.instructions;
    for (const entry of entries) {
      const degradation = classifyInstructionExecution(mod, entry, registry);
      const instructionPath = `${directory}/${entry.file}`.replace(/\\/g, "/");
      const executable = degradation.kind === "executable";
      const row: AgentInstructionSurfaceRow = {
        commandName: entry.name,
        moduleId,
        instructionPath,
        executable,
        degradation
      };
      if (effectiveConfig && executable) {
        row.jsonApprovalRequired = isSensitiveModuleCommandForEffective(
          entry.name,
          {},
          effectiveConfig
        );
        row.policyOperationId = resolvePolicyOperationIdForCommand(entry.name, effectiveConfig);
      }
      commands.push(row);
    }
  }
  commands.sort((a, b) => a.commandName.localeCompare(b.commandName));
  return commands;
}

export function buildAgentInstructionSurface(
  allModules: WorkflowModule[],
  registry: ModuleRegistry,
  options?: BuildAgentInstructionSurfaceOptions
): AgentInstructionSurfacePayload {
  const commands = collectInstructionSurfaceRows(allModules, registry, options?.effectiveConfig);
  const activationReport = registry.getActivationReport();
  const errorRemediationCatalog: ErrorRemediationCatalogPayload = {
    schemaVersion: 1,
    entries: buildErrorRemediationCatalog()
  };

  const ws = options?.workspacePath;
  const eff = options?.effectiveConfig;
  let cae: AgentInstructionSurfaceCae | undefined;
  if (ws && eff) {
    cae = buildCaeAdvisoryInstructionSurfaceBlock(ws, eff) ?? undefined;
  }

  if (options?.projection === "lean") {
    const executable = commands.filter((c) => c.executable).length;
    const lean: AgentInstructionSurfacePayloadLean = {
      schemaVersion: 1,
      projection: "lean",
      instructionSurfaceDigest: digestAgentInstructionSurfaceCommands(commands),
      commandCounts: {
        total: commands.length,
        executable,
        documentationOnly: commands.length - executable
      },
      activationReport,
      errorRemediationCatalog
    };
    if (cae) lean.cae = cae;
    return lean;
  }

  const full: AgentInstructionSurfacePayloadFull = {
    schemaVersion: 1,
    commands,
    activationReport,
    errorRemediationCatalog
  };
  if (cae) full.cae = cae;
  return full;
}
