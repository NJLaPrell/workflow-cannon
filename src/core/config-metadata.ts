/**
 * Canonical metadata for user-facing workspace config keys (Phase 2b).
 * CLI, explain, and generated docs consume this registry.
 */

export type ConfigKeyExposure = "public" | "maintainer" | "internal";

export type ConfigValueType = "string" | "boolean" | "number" | "object" | "array";

export type ConfigKeyMetadata = {
  key: string;
  type: ConfigValueType;
  description: string;
  default: unknown;
  /** If set, value must equal one of these (after type coercion). */
  allowedValues?: unknown[];
  domainScope: "project" | "user" | "runtime" | "internal";
  owningModule: string;
  sensitive: boolean;
  requiresRestart: boolean;
  requiresApproval: boolean;
  exposure: ConfigKeyExposure;
  /** Persisted layers that may store this key */
  writableLayers: ("project" | "user")[];
};

const REGISTRY: Record<string, ConfigKeyMetadata> = {
  "tasks.storeRelativePath": {
    key: "tasks.storeRelativePath",
    type: "string",
    description: "Relative path (from workspace root) to the task engine JSON state file.",
    default: ".workspace-kit/tasks/state.json",
    domainScope: "project",
    owningModule: "task-engine",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "tasks.wishlistStoreRelativePath": {
    key: "tasks.wishlistStoreRelativePath",
    type: "string",
    description:
      "Relative path (from workspace root) to the Wishlist JSON store when persistenceBackend is json.",
    default: ".workspace-kit/wishlist/state.json",
    domainScope: "project",
    owningModule: "task-engine",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "tasks.persistenceBackend": {
    key: "tasks.persistenceBackend",
    type: "string",
    description:
      "Task + wishlist persistence: sqlite (default) or json (opt-out for legacy workflows).",
    default: "sqlite",
    allowedValues: ["json", "sqlite"],
    domainScope: "project",
    owningModule: "task-engine",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "tasks.sqliteDatabaseRelativePath": {
    key: "tasks.sqliteDatabaseRelativePath",
    type: "string",
    description:
      "Relative path (from workspace root) to the SQLite file when persistenceBackend is sqlite.",
    default: ".workspace-kit/tasks/workspace-kit.db",
    domainScope: "project",
    owningModule: "task-engine",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "tasks.strictValidation": {
    key: "tasks.strictValidation",
    type: "boolean",
    description:
      "When true, task mutations validate the full active task set before persistence and fail on invalid task records.",
    default: false,
    domainScope: "project",
    owningModule: "task-engine",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "modules.enabled": {
    key: "modules.enabled",
    type: "array",
    description:
      "When non-empty, only these module ids are enabled (whitelist); then modules.disabled subtracts. When empty, all modules use registration.enabledByDefault.",
    default: [],
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "modules.disabled": {
    key: "modules.disabled",
    type: "array",
    description:
      "Module ids to disable after computing the candidate enabled set (default-by-flag or modules.enabled whitelist).",
    default: [],
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "kit.currentPhaseNumber": {
    key: "kit.currentPhaseNumber",
    type: "number",
    description:
      "Optional positive integer marking the maintainer’s current kit phase number. When set, queue-health and phase hints prefer this over parsing docs/maintainers/data/workspace-kit-status.yaml. Must agree with that YAML when both are set (workspace-kit doctor warns on mismatch).",
    default: 0,
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "kit.currentPhaseLabel": {
    key: "kit.currentPhaseLabel",
    type: "string",
    description:
      "Optional human-readable phase label (for explain-config / operator context); does not replace task.phase strings.",
    default: "",
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "planning.defaultQuestionDepth": {
    key: "planning.defaultQuestionDepth",
    type: "string",
    description:
      "Planning interview depth mode: minimal (critical only), guided (critical + static follow-ups), or adaptive (context-driven follow-ups).",
    default: "adaptive",
    allowedValues: ["minimal", "guided", "adaptive"],
    domainScope: "project",
    owningModule: "planning",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "planning.hardBlockCriticalUnknowns": {
    key: "planning.hardBlockCriticalUnknowns",
    type: "boolean",
    description:
      "When true, planning finalize requests fail until critical unknown questions are answered.",
    default: true,
    domainScope: "project",
    owningModule: "planning",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "planning.adaptiveFinalizePolicy": {
    key: "planning.adaptiveFinalizePolicy",
    type: "string",
    description:
      "Controls finalize handling for unresolved adaptive follow-up questions: off (ignore), warn (allow finalize with warnings), block (deny finalize).",
    default: "off",
    allowedValues: ["off", "warn", "block"],
    domainScope: "project",
    owningModule: "planning",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "planning.rulePacks": {
    key: "planning.rulePacks",
    type: "object",
    description:
      "Optional object overrides for planning rule packs by workflow type (`baseQuestions` and `adaptiveQuestions`).",
    default: {},
    domainScope: "project",
    owningModule: "planning",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "policy.extraSensitiveModuleCommands": {
    key: "policy.extraSensitiveModuleCommands",
    type: "array",
    description:
      "Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.",
    default: [],
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: true,
    requiresRestart: false,
    requiresApproval: true,
    exposure: "maintainer",
    writableLayers: ["project"]
  },
  "improvement.transcripts.sourcePath": {
    key: "improvement.transcripts.sourcePath",
    type: "string",
    description:
      "Optional relative path to transcript JSONL source. When empty, sync uses discoveryPaths (repo-relative, then Cursor global ~/.cursor/projects/<slug>/agent-transcripts).",
    default: "",
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "improvement.transcripts.archivePath": {
    key: "improvement.transcripts.archivePath",
    type: "string",
    description: "Relative local archive path where synced transcript JSONL files are copied.",
    default: "agent-transcripts",
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "public",
    writableLayers: ["project", "user"]
  },
  "improvement.cadence.minIntervalMinutes": {
    key: "improvement.cadence.minIntervalMinutes",
    type: "number",
    description: "Minimum minutes between one-shot ingest recommendation generation runs.",
    default: 15,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.cadence.skipIfNoNewTranscripts": {
    key: "improvement.cadence.skipIfNoNewTranscripts",
    type: "boolean",
    description: "Skip recommendation generation when transcript sync copies no new files.",
    default: true,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.cadence.maxRecommendationCandidatesPerRun": {
    key: "improvement.cadence.maxRecommendationCandidatesPerRun",
    type: "number",
    description:
      "Upper bound on new improvement tasks created per generate-recommendations run (safety cap; direct runs still respect dedupe).",
    default: 500,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.transcripts.maxFilesPerSync": {
    key: "improvement.transcripts.maxFilesPerSync",
    type: "number",
    description: "Maximum JSONL transcript files processed per sync (deterministic order).",
    default: 5000,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.transcripts.maxBytesPerFile": {
    key: "improvement.transcripts.maxBytesPerFile",
    type: "number",
    description: "Skip transcript files larger than this many bytes during sync.",
    default: 50_000_000,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.transcripts.maxTotalScanBytes": {
    key: "improvement.transcripts.maxTotalScanBytes",
    type: "number",
    description: "Approximate cap on total bytes read for hashing during one sync.",
    default: 500_000_000,
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.transcripts.discoveryPaths": {
    key: "improvement.transcripts.discoveryPaths",
    type: "array",
    description:
      "Ordered relative paths tried when improvement.transcripts.sourcePath is unset (first existing wins). After these, sync tries Cursor global ~/.cursor/projects/<slug>/agent-transcripts.",
    default: [],
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "improvement.hooks.afterTaskCompleted": {
    key: "improvement.hooks.afterTaskCompleted",
    type: "string",
    description:
      "Optional background transcript sync after task-engine transition to completed: off (default), sync, or ingest (ingest requires WORKSPACE_KIT_POLICY_APPROVAL in env).",
    default: "off",
    allowedValues: ["off", "sync", "ingest"],
    domainScope: "project",
    owningModule: "improvement",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "responseTemplates.enforcementMode": {
    key: "responseTemplates.enforcementMode",
    type: "string",
    description:
      "`advisory`: unknown template ids, invalid default/override ids, and explicit-vs-directive template conflicts emit warnings only. `strict`: same conditions fail the command (`response-template-invalid` or `response-template-conflict`) after the module runs; use for CI governance.",
    default: "advisory",
    allowedValues: ["advisory", "strict"],
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "responseTemplates.defaultTemplateId": {
    key: "responseTemplates.defaultTemplateId",
    type: "string",
    description: "Builtin response template id applied when a run does not specify one.",
    default: "default",
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  },
  "responseTemplates.commandOverrides": {
    key: "responseTemplates.commandOverrides",
    type: "object",
    description: "Map of module command name to builtin response template id.",
    default: {},
    domainScope: "project",
    owningModule: "workspace-kit",
    sensitive: false,
    requiresRestart: false,
    requiresApproval: false,
    exposure: "maintainer",
    writableLayers: ["project", "user"]
  }
};

export function getConfigKeyMetadata(key: string): ConfigKeyMetadata | undefined {
  return REGISTRY[key];
}

export function listConfigMetadata(options?: {
  exposure?: "public" | "maintainer" | "internal" | "all";
}): ConfigKeyMetadata[] {
  const exposure = options?.exposure ?? "public";
  const order = ["public", "maintainer", "internal"] as const;
  const maxIdx = exposure === "all" ? 2 : order.indexOf(exposure as (typeof order)[number]);
  const allowed = maxIdx < 0 ? new Set<ConfigKeyExposure>(["public"]) : new Set(order.slice(0, maxIdx + 1));
  return Object.values(REGISTRY)
    .filter((m) => allowed.has(m.exposure))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function assertWritableKey(key: string): ConfigKeyMetadata {
  const meta = REGISTRY[key];
  if (!meta) {
    const err = new Error(`config-unknown-key: '${key}' is not a registered config key`);
    (err as Error & { code?: string }).code = "config-unknown-key";
    throw err;
  }
  if (meta.exposure === "internal") {
    const err = new Error(`config-internal-key: '${key}' is internal and not user-writable`);
    (err as Error & { code?: string }).code = "config-internal-key";
    throw err;
  }
  return meta;
}

export function validateValueForMetadata(meta: ConfigKeyMetadata, value: unknown): void {
  if (meta.type === "array") {
    if (!Array.isArray(value)) {
      throw typeError(meta.key, "array", value);
    }
    if (meta.key === "policy.extraSensitiveModuleCommands") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "improvement.transcripts.discoveryPaths") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "modules.enabled" || meta.key === "modules.disabled") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    return;
  }
  if (meta.type === "string" && typeof value !== "string") {
    throw typeError(meta.key, "string", value);
  }
  if (meta.type === "boolean" && typeof value !== "boolean") {
    throw typeError(meta.key, "boolean", value);
  }
  if (meta.type === "number" && typeof value !== "number") {
    throw typeError(meta.key, "number", value);
  }
  if (meta.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw typeError(meta.key, "object", value);
    }
    if (meta.key === "responseTemplates.commandOverrides") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof k !== "string" || !k.trim()) {
          throw new Error(`config-type-error(${meta.key}): keys must be non-empty strings`);
        }
        if (typeof v !== "string" || !v.trim()) {
          throw new Error(`config-type-error(${meta.key}): values must be non-empty strings`);
        }
      }
    }
  }
  if (meta.allowedValues && meta.allowedValues.length > 0) {
    if (!meta.allowedValues.some((v) => deepEqualLoose(v, value))) {
      throw new Error(
        `config-constraint(${meta.key}): value not in allowed set: ${JSON.stringify(meta.allowedValues)}`
      );
    }
  }
}

function typeError(key: string, expected: string, got: unknown): Error {
  return new Error(
    `config-type-error(${key}): expected ${expected}, got ${got === null ? "null" : typeof got}`
  );
}

function deepEqualLoose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Validate top-level shape of persisted kit config files (strict unknown-key rejection).
 */
export function validatePersistedConfigDocument(
  data: Record<string, unknown>,
  label: string
): void {
  const allowed = new Set([
    "schemaVersion",
    "core",
    "tasks",
    "documentation",
    "policy",
    "improvement",
    "responseTemplates",
    "modules",
    "kit"
  ]);
  for (const k of Object.keys(data)) {
    if (!allowed.has(k)) {
      throw new Error(`config-invalid(${label}): unknown top-level key '${k}'`);
    }
  }
  if (data.schemaVersion !== undefined && typeof data.schemaVersion !== "number") {
    throw new Error(`config-invalid(${label}): schemaVersion must be a number`);
  }
  const tasks = data.tasks;
  if (tasks !== undefined) {
    if (typeof tasks !== "object" || tasks === null || Array.isArray(tasks)) {
      throw new Error(`config-invalid(${label}): tasks must be an object`);
    }
    const t = tasks as Record<string, unknown>;
    for (const k of Object.keys(t)) {
      if (
        k !== "storeRelativePath" &&
        k !== "wishlistStoreRelativePath" &&
        k !== "persistenceBackend" &&
        k !== "sqliteDatabaseRelativePath"
      ) {
        throw new Error(`config-invalid(${label}): unknown tasks.${k}`);
      }
    }
    if (t.storeRelativePath !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.storeRelativePath"]!, t.storeRelativePath);
    }
    if (t.wishlistStoreRelativePath !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.wishlistStoreRelativePath"]!, t.wishlistStoreRelativePath);
    }
    if (t.persistenceBackend !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.persistenceBackend"]!, t.persistenceBackend);
    }
    if (t.sqliteDatabaseRelativePath !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.sqliteDatabaseRelativePath"]!, t.sqliteDatabaseRelativePath);
    }
  }
  const policy = data.policy;
  if (policy !== undefined) {
    if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
      throw new Error(`config-invalid(${label}): policy must be an object`);
    }
    const p = policy as Record<string, unknown>;
    for (const k of Object.keys(p)) {
      if (k !== "extraSensitiveModuleCommands") {
        throw new Error(`config-invalid(${label}): unknown policy.${k}`);
      }
    }
    if (p.extraSensitiveModuleCommands !== undefined) {
      validateValueForMetadata(REGISTRY["policy.extraSensitiveModuleCommands"]!, p.extraSensitiveModuleCommands);
    }
  }
  const core = data.core;
  if (core !== undefined) {
    if (typeof core !== "object" || core === null || Array.isArray(core) || Object.keys(core).length > 0) {
      throw new Error(`config-invalid(${label}): core must be an empty object when present`);
    }
  }
  const doc = data.documentation;
  if (doc !== undefined) {
    if (typeof doc !== "object" || doc === null || Array.isArray(doc) || Object.keys(doc).length > 0) {
      throw new Error(`config-invalid(${label}): documentation must be an empty object when present`);
    }
  }
  const mods = data.modules;
  if (mods !== undefined) {
    if (typeof mods !== "object" || mods === null || Array.isArray(mods)) {
      throw new Error(`config-invalid(${label}): modules must be an object`);
    }
    const m = mods as Record<string, unknown>;
    for (const k of Object.keys(m)) {
      if (k !== "enabled" && k !== "disabled") {
        throw new Error(`config-invalid(${label}): unknown modules.${k}`);
      }
    }
    if (m.enabled !== undefined) {
      validateValueForMetadata(REGISTRY["modules.enabled"]!, m.enabled);
    }
    if (m.disabled !== undefined) {
      validateValueForMetadata(REGISTRY["modules.disabled"]!, m.disabled);
    }
  }
  const kit = data.kit;
  if (kit !== undefined) {
    if (typeof kit !== "object" || kit === null || Array.isArray(kit)) {
      throw new Error(`config-invalid(${label}): kit must be an object`);
    }
    const k = kit as Record<string, unknown>;
    for (const key of Object.keys(k)) {
      if (key !== "currentPhaseNumber" && key !== "currentPhaseLabel") {
        throw new Error(`config-invalid(${label}): unknown kit.${key}`);
      }
    }
    if (k.currentPhaseNumber !== undefined) {
      validateValueForMetadata(REGISTRY["kit.currentPhaseNumber"]!, k.currentPhaseNumber);
      const n = k.currentPhaseNumber;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
        throw new Error(`config-invalid(${label}): kit.currentPhaseNumber must be a positive integer`);
      }
    }
    if (k.currentPhaseLabel !== undefined) {
      validateValueForMetadata(REGISTRY["kit.currentPhaseLabel"]!, k.currentPhaseLabel);
    }
  }
  const improvement = data.improvement;
  if (improvement !== undefined) {
    if (typeof improvement !== "object" || improvement === null || Array.isArray(improvement)) {
      throw new Error(`config-invalid(${label}): improvement must be an object`);
    }
    const imp = improvement as Record<string, unknown>;
    for (const k of Object.keys(imp)) {
      if (k !== "transcripts" && k !== "cadence" && k !== "hooks") {
        throw new Error(`config-invalid(${label}): unknown improvement.${k}`);
      }
    }
    if (imp.transcripts !== undefined) {
      if (
        typeof imp.transcripts !== "object" ||
        imp.transcripts === null ||
        Array.isArray(imp.transcripts)
      ) {
        throw new Error(`config-invalid(${label}): improvement.transcripts must be an object`);
      }
      const tr = imp.transcripts as Record<string, unknown>;
      for (const k of Object.keys(tr)) {
        if (
          k !== "sourcePath" &&
          k !== "archivePath" &&
          k !== "maxFilesPerSync" &&
          k !== "maxBytesPerFile" &&
          k !== "maxTotalScanBytes" &&
          k !== "discoveryPaths"
        ) {
          throw new Error(`config-invalid(${label}): unknown improvement.transcripts.${k}`);
        }
      }
      if (tr.sourcePath !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.sourcePath"]!, tr.sourcePath);
      }
      if (tr.archivePath !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.archivePath"]!, tr.archivePath);
      }
      if (tr.maxFilesPerSync !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxFilesPerSync"]!, tr.maxFilesPerSync);
      }
      if (tr.maxBytesPerFile !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxBytesPerFile"]!, tr.maxBytesPerFile);
      }
      if (tr.maxTotalScanBytes !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxTotalScanBytes"]!, tr.maxTotalScanBytes);
      }
      if (tr.discoveryPaths !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.discoveryPaths"]!, tr.discoveryPaths);
      }
    }
    if (imp.cadence !== undefined) {
      if (typeof imp.cadence !== "object" || imp.cadence === null || Array.isArray(imp.cadence)) {
        throw new Error(`config-invalid(${label}): improvement.cadence must be an object`);
      }
      const cd = imp.cadence as Record<string, unknown>;
      for (const k of Object.keys(cd)) {
        if (k !== "minIntervalMinutes" && k !== "skipIfNoNewTranscripts" && k !== "maxRecommendationCandidatesPerRun") {
          throw new Error(`config-invalid(${label}): unknown improvement.cadence.${k}`);
        }
      }
      if (cd.minIntervalMinutes !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.minIntervalMinutes"]!,
          cd.minIntervalMinutes
        );
      }
      if (cd.skipIfNoNewTranscripts !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.skipIfNoNewTranscripts"]!,
          cd.skipIfNoNewTranscripts
        );
      }
      if (cd.maxRecommendationCandidatesPerRun !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.maxRecommendationCandidatesPerRun"]!,
          cd.maxRecommendationCandidatesPerRun
        );
      }
    }
    if (imp.hooks !== undefined) {
      if (typeof imp.hooks !== "object" || imp.hooks === null || Array.isArray(imp.hooks)) {
        throw new Error(`config-invalid(${label}): improvement.hooks must be an object`);
      }
      const hk = imp.hooks as Record<string, unknown>;
      for (const k of Object.keys(hk)) {
        if (k !== "afterTaskCompleted") {
          throw new Error(`config-invalid(${label}): unknown improvement.hooks.${k}`);
        }
      }
      if (hk.afterTaskCompleted !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.hooks.afterTaskCompleted"]!,
          hk.afterTaskCompleted
        );
      }
    }
  }
  const responseTemplates = data.responseTemplates;
  if (responseTemplates !== undefined) {
    if (
      typeof responseTemplates !== "object" ||
      responseTemplates === null ||
      Array.isArray(responseTemplates)
    ) {
      throw new Error(`config-invalid(${label}): responseTemplates must be an object`);
    }
    const rt = responseTemplates as Record<string, unknown>;
    for (const k of Object.keys(rt)) {
      if (k !== "enforcementMode" && k !== "defaultTemplateId" && k !== "commandOverrides") {
        throw new Error(`config-invalid(${label}): unknown responseTemplates.${k}`);
      }
    }
    if (rt.enforcementMode !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.enforcementMode"]!, rt.enforcementMode);
    }
    if (rt.defaultTemplateId !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.defaultTemplateId"]!, rt.defaultTemplateId);
    }
    if (rt.commandOverrides !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.commandOverrides"]!, rt.commandOverrides);
    }
  }
}

export function getConfigRegistryExport(): typeof REGISTRY {
  return REGISTRY;
}
