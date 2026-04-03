import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolvePackagedSchemaPath(schemaFile: string): string {
  const nextToDist = join(moduleDir, "schemas", schemaFile);
  if (existsSync(nextToDist)) {
    return nextToDist;
  }
  const fromDistTree = join(moduleDir, "..", "..", "..", "src", "modules", "documentation", "schemas", schemaFile);
  if (existsSync(fromDistTree)) {
    return fromDistTree;
  }
  return nextToDist;
}

export type RoadmapData = {
  schemaVersion: number;
  title: string;
  subtitle: string;
  scope: string[];
  currentState: string[];
  featureTaxonomy: {
    enabled: boolean;
    intro: string;
    taxonomyFile: string;
  };
  phasePlanIntro: string;
  phaseSectionsFile: string;
  decisions: Array<{ decision: string; choice: string }>;
  executionEvidence: string[];
};

export type FeatureTaxonomyData = {
  schemaVersion: number;
  features: Array<{
    category: string;
    slug: string;
    name: string;
    covers: string;
  }>;
};

function loadSchema(name: "roadmap-data.schema.json" | "feature-taxonomy.schema.json"): object {
  const p = resolvePackagedSchemaPath(name);
  return JSON.parse(readFileSync(p, "utf8")) as object;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined, dataPath = ""): string[] {
  if (!errors?.length) {
    return dataPath ? [`${dataPath}: validation failed`] : ["validation failed"];
  }
  return errors.map((e) => {
    const p = e.instancePath?.length ? e.instancePath : "(root)";
    return `${p}: ${e.message ?? e.keyword ?? "error"}`;
  });
}

let roadmapValidate: ValidateFunction | null = null;
let taxonomyValidate: ValidateFunction | null = null;

type AjvLike = { compile: (schema: object) => ValidateFunction | null };

function createAjv(): AjvLike {
  const Ctor = AjvImport as unknown as new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvLike;
  return new Ctor({ allErrors: true, strict: false });
}

function getRoadmapValidate(): ValidateFunction {
  if (!roadmapValidate) {
    const compiled = createAjv().compile(loadSchema("roadmap-data.schema.json"));
    if (!compiled) {
      throw new Error("Failed to compile roadmap-data.schema.json");
    }
    roadmapValidate = compiled;
  }
  return roadmapValidate;
}

function getTaxonomyValidate(): ValidateFunction {
  if (!taxonomyValidate) {
    const compiled = createAjv().compile(loadSchema("feature-taxonomy.schema.json"));
    if (!compiled) {
      throw new Error("Failed to compile feature-taxonomy.schema.json");
    }
    taxonomyValidate = compiled;
  }
  return taxonomyValidate;
}

export function validateRoadmapData(input: unknown): { ok: true; data: RoadmapData } | { ok: false; errors: string[] } {
  const v = getRoadmapValidate();
  if (!v(input)) {
    return { ok: false, errors: formatAjvErrors(v.errors) };
  }
  return { ok: true, data: input as RoadmapData };
}

export function validateFeatureTaxonomyData(
  input: unknown
): { ok: true; data: FeatureTaxonomyData } | { ok: false; errors: string[] } {
  const v = getTaxonomyValidate();
  if (!v(input)) {
    return { ok: false, errors: formatAjvErrors(v.errors) };
  }
  const data = input as FeatureTaxonomyData;
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const f of data.features) {
    if (seen.has(f.slug)) {
      dups.push(f.slug);
    }
    seen.add(f.slug);
  }
  if (dups.length > 0) {
    return { ok: false, errors: [`duplicate taxonomy slug(s): ${[...new Set(dups)].join(", ")}`] };
  }
  return { ok: true, data };
}

export function documentationDataDir(sourceRoot: string): string {
  return join(sourceRoot, "src", "modules", "documentation", "data");
}

export function readAndValidateRoadmapData(
  sourceRoot: string
): { ok: true; data: RoadmapData; path: string } | { ok: false; errors: string[]; path: string } {
  const dir = documentationDataDir(sourceRoot);
  const path = join(dir, "roadmap-data.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    return { ok: false, errors: [`${path}: ${(e as Error).message}`], path };
  }
  const v = validateRoadmapData(parsed);
  if (!v.ok) {
    return { ok: false, errors: v.errors.map((err) => `${path}: ${err}`), path };
  }
  return { ok: true, data: v.data, path };
}

export function readAndValidateFeatureTaxonomyData(
  sourceRoot: string,
  taxonomyFileName: string
): { ok: true; data: FeatureTaxonomyData; path: string } | { ok: false; errors: string[]; path: string } {
  const dir = documentationDataDir(sourceRoot);
  const path = join(dir, taxonomyFileName);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    return { ok: false, errors: [`${path}: ${(e as Error).message}`], path };
  }
  const v = validateFeatureTaxonomyData(parsed);
  if (!v.ok) {
    return { ok: false, errors: v.errors.map((err) => `${path}: ${err}`), path };
  }
  return { ok: true, data: v.data, path };
}
