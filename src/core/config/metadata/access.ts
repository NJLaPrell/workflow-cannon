/**
 * Config key registry access (Phase 77 / REF-008).
 * Validation logic stays in `../../config-metadata.ts`; this module holds the JSON-backed registry + lookups.
 */

import registryJson from "../../config-registry.json" with { type: "json" };

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

/** Canonical in-memory registry (read-only surface for validators). */
export const configMetadataRegistry = registryJson as Record<string, ConfigKeyMetadata>;

export function getConfigKeyMetadata(key: string): ConfigKeyMetadata | undefined {
  return configMetadataRegistry[key];
}

export function listConfigMetadata(options?: {
  exposure?: "public" | "maintainer" | "internal" | "all";
}): ConfigKeyMetadata[] {
  const exposure = options?.exposure ?? "public";
  const order = ["public", "maintainer", "internal"] as const;
  const maxIdx = exposure === "all" ? 2 : order.indexOf(exposure as (typeof order)[number]);
  const allowed = maxIdx < 0 ? new Set<ConfigKeyExposure>(["public"]) : new Set(order.slice(0, maxIdx + 1));
  return Object.values(configMetadataRegistry)
    .filter((m) => allowed.has(m.exposure))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function assertWritableKey(key: string): ConfigKeyMetadata {
  const meta = configMetadataRegistry[key];
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
