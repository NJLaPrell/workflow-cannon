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
  getProjectConfigPath,
  getUserConfigFilePath,
  KIT_CONFIG_DEFAULTS,
  loadUserLayer,
  mergeConfigLayers,
  MODULE_CONFIG_CONTRIBUTIONS,
  normalizeConfigForExport,
  PROJECT_CONFIG_REL,
  resolveWorkspaceConfigWithLayers,
  stableStringifyConfig,
  type ConfigLayer,
  type ConfigLayerId,
  type EffectiveWorkspaceConfig,
  type ExplainConfigResult,
  type ResolveWorkspaceConfigOptions
} from "./workspace-kit-config.js";
export {
  appendPolicyTrace,
  getExtraSensitiveModuleCommandsFromEffective,
  getOperationIdForCommand,
  isSensitiveModuleCommand,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
  parsePolicyApprovalFromEnv,
  POLICY_TRACE_SCHEMA_VERSION,
  resolveActor,
  resolvePolicyOperationIdForCommand,
  type PolicyOperationId,
  type PolicyTraceRecord,
  type PolicyTraceRecordInput
} from "./policy.js";
export {
  getSessionGrant,
  loadSessionPolicyDocument,
  recordSessionGrant,
  resolveSessionId,
  SESSION_POLICY_SCHEMA_VERSION,
  type SessionPolicyDocument,
  type SessionPolicyGrant
} from "./session-policy.js";
export {
  assertWritableKey,
  getConfigKeyMetadata,
  getConfigRegistryExport,
  listConfigMetadata,
  validatePersistedConfigDocument,
  validateValueForMetadata,
  type ConfigKeyExposure,
  type ConfigKeyMetadata,
  type ConfigValueType
} from "./config-metadata.js";
export {
  appendConfigMutation,
  CONFIG_MUTATIONS_SCHEMA_VERSION,
  summarizeForEvidence,
  type ConfigMutationRecord
} from "./config-mutations.js";
export { generateConfigReferenceDocs, runWorkspaceConfigCli, type ConfigCliIo } from "./config-cli.js";
export {
  LINEAGE_SCHEMA_VERSION,
  lineageCorrelationRoot,
  type LineageAppPayload,
  type LineageCorrPayload,
  type LineageDecPayload,
  type LineageEvent,
  type LineageEventType,
  type LineageRecPayload
} from "./lineage-contract.js";
export {
  appendLineageEvent,
  newLineageEventId,
  queryLineageChain,
  readLineageEvents
} from "./lineage-store.js";

export type CoreRuntimeVersion = "0.1";
