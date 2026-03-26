export type ModuleCapability =
  | "documentation"
  | "task-engine"
  | "planning"
  | "improvement"
  | "approvals"
  | "diagnostics"
  | "migration";

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
};

export type ModuleInstructionContract = {
  /**
   * Directory containing markdown instruction files for this module.
   */
  directory: string;
  entries: ModuleInstructionEntry[];
};

export type ModuleEvent = {
  type: string;
  payload?: Record<string, unknown>;
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

export type ModuleCommandResult = {
  ok: boolean;
  code: string;
  message?: string;
  data?: Record<string, unknown>;
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
  capabilities: ModuleCapability[];
  dependsOn: string[];
  enabledByDefault: boolean;
  config: ModuleDocumentContract;
  state: ModuleDocumentContract;
  instructions: ModuleInstructionContract;
};

export interface WorkflowModule {
  registration: ModuleRegistration;
  onInstall?(ctx: ModuleLifecycleContext): Promise<void>;
  onConfigChange?(ctx: ModuleLifecycleContext): Promise<void>;
  onStart?(ctx: ModuleLifecycleContext): Promise<void>;
  onStop?(ctx: ModuleLifecycleContext): Promise<void>;
  onEvent?(event: ModuleEvent, ctx: ModuleLifecycleContext): Promise<void>;
  onCommand?(command: ModuleCommand, ctx: ModuleLifecycleContext): Promise<ModuleCommandResult>;
}
