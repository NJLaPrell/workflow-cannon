import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let slugSet: Set<string> | null = null;

function resolveFeatureTaxonomyPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const fromPackageRoot = join(here, "..", "..", "..", "src", "modules", "documentation", "data", "feature-taxonomy.json");
  if (existsSync(fromPackageRoot)) {
    return fromPackageRoot;
  }
  return join(here, "..", "..", "..", "..", "src", "modules", "documentation", "data", "feature-taxonomy.json");
}

function loadKnownFeatureSlugs(): Set<string> {
  if (slugSet) {
    return slugSet;
  }
  slugSet = loadKnownFeatureSlugsFromJsonFile();
  return slugSet;
}

/** Load taxonomy slugs from shipped `feature-taxonomy.json` (no memo — prefer `loadKnownFeatureSlugs()` for hot path). */
export function loadKnownFeatureSlugsFromJsonFile(): Set<string> {
  const path = resolveFeatureTaxonomyPath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as { features?: Array<{ slug?: string }> };
  const next = new Set<string>();
  for (const f of raw.features ?? []) {
    if (typeof f.slug === "string" && f.slug.length > 0) {
      next.add(f.slug);
    }
  }
  return next;
}

/** Advisory warnings for slugs not present in the known set (registry or JSON fallback). */
export function collectUnknownFeatureSlugWarnings(
  features: string[] | undefined,
  knownSlugs?: Set<string>
): string[] {
  if (!features?.length) {
    return [];
  }
  const known = knownSlugs ?? loadKnownFeatureSlugs();
  const unknown = features.filter((s) => !known.has(s));
  if (unknown.length === 0) {
    return [];
  }
  return [`unknown feature slug(s) not in taxonomy: ${unknown.join(", ")}`];
}
