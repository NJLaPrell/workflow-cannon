export {
  ModuleRegistry,
  ModuleRegistryError,
  validateModuleSet,
  type ModuleRegistryOptions
} from "./module-registry.js";
export {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  type ModuleCommandDescriptor,
  type ModuleCommandRouterOptions
} from "./module-command-router.js";
export {
  buildBaseConfigLayers,
  deepMerge,
  envToConfigOverlay,
  explainConfigPath,
  getAtPath,
  KIT_CONFIG_DEFAULTS,
  mergeConfigLayers,
  MODULE_CONFIG_CONTRIBUTIONS,
  resolveWorkspaceConfigWithLayers,
  type ConfigLayer,
  type ConfigLayerId,
  type EffectiveWorkspaceConfig,
  type ExplainConfigResult,
  type ResolveWorkspaceConfigOptions
} from "./workspace-kit-config.js";
export {
  appendPolicyTrace,
  getOperationIdForCommand,
  isSensitiveModuleCommand,
  parsePolicyApproval,
  parsePolicyApprovalFromEnv,
  resolveActor,
  type PolicyOperationId,
  type PolicyTraceRecord
} from "./policy.js";

export type CoreRuntimeVersion = "0.1";
