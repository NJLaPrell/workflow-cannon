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
  const allowed = new Set(["schemaVersion", "core", "tasks", "documentation", "policy", "modules"]);
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
      if (k !== "storeRelativePath") {
        throw new Error(`config-invalid(${label}): unknown tasks.${k}`);
      }
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
    if (typeof mods !== "object" || mods === null || Array.isArray(mods) || Object.keys(mods).length > 0) {
      throw new Error(`config-invalid(${label}): modules must be absent or an empty object`);
    }
  }
}

export function getConfigRegistryExport(): typeof REGISTRY {
  return REGISTRY;
}
