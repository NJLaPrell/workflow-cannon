export type ModuleCapability =
  | "task-engine"
  | "planning"
  | "improvement"
  | "approvals"
  | "diagnostics"
  | "migration";

export type ModuleEvent = {
  type: string;
  payload?: Record<string, unknown>;
};

export type ModuleCommand = {
  name: string;
  args?: Record<string, unknown>;
};

export type ModuleCommandResult = {
  ok: boolean;
  code: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type ModuleLifecycleContext = {
  runtimeVersion: string;
  workspacePath: string;
};

export type ModuleRegistration = {
  id: string;
  version: string;
  contractVersion: "1";
  capabilities: ModuleCapability[];
  dependsOn: string[];
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
