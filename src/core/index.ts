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
  looksLikePackageManagerBanner,
  parseWorkspaceKitJsonStdout,
  type WorkspaceKitJsonParseFailure,
  type WorkspaceKitJsonParseOptions,
  type WorkspaceKitJsonParseSuccess
} from "./cli-json-output.js";
export {
  buildAgentInstructionSurface,
  classifyInstructionExecution,
  isInstructionExecutableForRegistry,
  type AgentInstructionDegradation,
  type AgentInstructionSurfaceCae,
  type AgentInstructionSurfacePayload,
  type AgentInstructionSurfaceRow,
  type BuildAgentInstructionSurfaceOptions
} from "./agent-instruction-surface.js";
export {
  CAE_ENFORCEMENT_BLOCK_ALLOWLIST,
  findCaeEnforcementBlock
} from "./cae/cae-enforcement-allowlist.js";
export { noopCaeTracePersistence, type CaeTracePersistencePort } from "./cae/cae-persistence-port.js";
export { mergeCaeIntoCommandResult, runCaeCliPreflight } from "./cae/cae-run-preflight.js";
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
  writeModuleScopedConfigDocument,
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
export {
  applyResponseTemplateApplication,
  resolveContextualResponseTemplateId
} from "./response-template-shaping.js";
export {
  buildIngestTranscriptsArgsForHook,
  maybeSpawnTranscriptHookAfterCompletion,
  readAfterTaskCompletedHook,
  releaseTranscriptHookLockFromEnv,
  resolveWorkspaceKitCli,
  TRANSCRIPT_HOOK_LOCK_ENV_VAR
} from "./transcript-completion-hook.js";
export {
  assertWritableKey,
  getConfigKeyMetadata,
  getConfigRegistryExport,
  listConfigMetadata,
  validateModuleScopedConfigDocument,
  validatePersistedConfigDocument,
  validateValueForMetadata,
  type ConfigKeyExposure,
  type ConfigKeyMetadata,
  type ConfigValueType
} from "./config-metadata.js";
export {
  buildAuditRecord,
  extractTaskIdsFromText,
  getGithubDeliveryMeta,
  getInvocationCommentBody,
  getIssueCommentBody,
  getRepositoryFullName,
  isRepositoryAllowed,
  parseCannonSlashCommand,
  resolveRouteKind,
  verifyGithubWebhookSignatureSha256,
  type GithubInvocationAuditRecord,
  type GithubInvocationRouteKind
} from "./github-invocation.js";
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
