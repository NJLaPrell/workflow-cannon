export type ModuleCapability =
  | "documentation"
  | "task-engine"
  | "planning"
  | "improvement"
  | "approvals"
  | "diagnostics"
  | "migration"
  | "agent-behavior"
  | "skills"
  | "subagents"
  | "team-execution";

export type ModuleDocumentContract = {
  path: string;
  format: "md";
  description?: string;
};

export type ModuleInstructionEntry = {
  /**
   * Function-like instruction name, e.g. "document-project".
   */
  name: string;
  /**
   * Markdown instruction file path under the module instruction directory.
   */
  file: string;
  description?: string;
  /**
   * Other module ids that must be enabled for this command to be registered in the
   * command router (in addition to the owning module). Empty/omitted = no extra peers.
   */
  requiresPeers?: string[];
};

export type ModuleInstructionContract = {
  /**
   * Directory containing markdown instruction files for this module.
   */
  directory: string;
  entries: ModuleInstructionEntry[];
};

export type ModuleCommand = {
  name: string;
  args?: Record<string, unknown>;
};

/** Structured response-template application record (Phase 6b); mirrored in core for shaping. */
export type ResponseTemplateApplicationMeta = {
  requestedTemplateId: string | null;
  appliedTemplateId: string | null;
  enforcementMode: "advisory" | "strict";
  warnings: string[];
  telemetry?: {
    resolveNs: number;
    warningCount: number;
  };
};

/** Optional machine-oriented recovery hints; additive for JSON consumers (Phase 52). */
export type CliRemediation = {
  instructionPath?: string;
  docPath?: string;
  docAnchors?: string[];
};

export type ModuleCommandResult = {
  ok: boolean;
  code: string;
  message?: string;
  data?: Record<string, unknown>;
  /** Repo-relative docs / instruction paths when `ok` is false (additive). */
  remediation?: CliRemediation;
  /** Advisory response-template shaping metadata; always present for `workspace-kit run` JSON output when enabled. */
  responseTemplate?: ResponseTemplateApplicationMeta;
};

/** Subset of module registry used for config layer ordering (avoids core↔contracts cycles). */
export type ConfigRegistryView = {
  getStartupOrder(): ReadonlyArray<{ registration: { id: string } }>;
};

export type ModuleLifecycleContext = {
  runtimeVersion: string;
  workspacePath: string;
  /** Merged workspace config (kit → modules → project → env → invocation). */
  effectiveConfig?: Record<string, unknown>;
  /** Resolved actor for policy traces (see phase2 workbook). */
  resolvedActor?: string;
  /** CLI supplies registry for explain-config and config resolution. */
  moduleRegistry?: ConfigRegistryView;
};

export type ModuleRegistration = {
  id: string;
  version: string;
  contractVersion: "1";
  stateSchema: number;
  capabilities: ModuleCapability[];
  dependsOn: string[];
  /**
   * Other modules this module integrates with when present; unlike dependsOn,
   * missing optional peers do not block registry construction or enablement.
   */
  optionalPeers?: string[];
  enabledByDefault: boolean;
  config: ModuleDocumentContract;
  instructions: ModuleInstructionContract;
};

export interface WorkflowModule {
  registration: ModuleRegistration;
  onCommand?(command: ModuleCommand, ctx: ModuleLifecycleContext): Promise<ModuleCommandResult>;
}
