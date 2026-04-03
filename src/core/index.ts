export {
  ModuleRegistry,
  ModuleRegistryError,
  validateModuleSet,
  type ModuleActivationEntry,
  type ModuleActivationReport,
  type ModuleRegistryOptions
} from "./module-registry.js";
export {
  moduleRegistryOptionsFromEffectiveConfig,
  pickModuleContractWorkspacePath,
  resolveRegistryAndConfig
} from "./module-registry-resolve.js";
export {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  UNKNOWN_COMMAND_SAMPLE_LIMIT,
  formatUnknownCommandMessage,
  type ModuleCommandDescriptor,
  type ModuleCommandRouterOptions
} from "./module-command-router.js";
export {
  buildAgentInstructionSurface,
  classifyInstructionExecution,
  isInstructionExecutableForRegistry,
  type AgentInstructionDegradation,
  type AgentInstructionSurfacePayload,
  type AgentInstructionSurfaceRow
} from "./agent-instruction-surface.js";
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
  readProjectConfigDocument,
  resolveWorkspaceConfigWithLayers,
  stableStringifyConfig,
  writeProjectConfigDocument,
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
  getPolicySensitivityForBuiltinCommand,
  isSensitiveModuleCommand,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
  parsePolicyApprovalFromEnv,
  POLICY_APPROVAL_HUMAN_DOC,
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
  parseTemplateDirectiveFromText
} from "./instruction-template-mapper.js";
export {
  RESPONSE_TEMPLATE_CONTRACT_VERSION,
  MAX_TEMPLATE_WARNING_LENGTH,
  truncateTemplateWarning,
  type ResponseTemplateDefinition,
  type ResponseTemplateEnforcementMode
} from "./response-template-contract.js";
export {
  allBuiltinDefinitions,
  getResponseTemplateDefinition,
  listBuiltinResponseTemplateIds
} from "./response-template-registry.js";
export { applyResponseTemplateApplication } from "./response-template-shaping.js";
export {
  buildIngestTranscriptsArgsForHook,
  maybeSpawnTranscriptHookAfterCompletion,
  readAfterTaskCompletedHook,
  resolveWorkspaceKitCli
} from "./transcript-completion-hook.js";
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
  CONFIG_FACET_IDS,
  isConfigFacetId,
  listKeysForConfigFacet,
  type ConfigFacetId
} from "./config-facets.js";
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
export { UnifiedStateDb, type ModuleStateRow } from "./state/unified-state-db.js";
export {
  KIT_SQLITE_USER_VERSION,
  TASK_ENGINE_TASKS_TABLE,
  prepareKitSqliteDatabase,
  readKitSqliteUserVersion
} from "./state/workspace-kit-sqlite.js";

export type CoreRuntimeVersion = "0.1";
