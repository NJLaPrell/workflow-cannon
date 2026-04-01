/**
 * Allowlisted config key groupings for bounded `explain-config` facet output.
 * Facet ids match the first path segment of registered keys in `config-metadata`.
 */

import { listConfigMetadata } from "./config-metadata.js";

export const CONFIG_FACET_IDS = [
  "tasks",
  "planning",
  "improvement",
  "kit",
  "modules",
  "policy",
  "responseTemplates"
] as const;

export type ConfigFacetId = (typeof CONFIG_FACET_IDS)[number];

const FACET_SET = new Set<string>(CONFIG_FACET_IDS);

export function isConfigFacetId(raw: string): raw is ConfigFacetId {
  return FACET_SET.has(raw);
}

/** Sorted dotted paths for this facet (subset of the config registry). */
export function listKeysForConfigFacet(facet: string): string[] | null {
  if (!isConfigFacetId(facet)) {
    return null;
  }
  const prefix = `${facet}.`;
  return listConfigMetadata({ exposure: "all" })
    .filter((m) => m.key.startsWith(prefix))
    .map((m) => m.key)
    .sort();
}
