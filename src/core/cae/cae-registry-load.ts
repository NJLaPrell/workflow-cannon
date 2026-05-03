/**
 * Load and validate CAE artifact + activation registries (T858).
 * Paths are repo-relative from workspace root by default.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import registryEntrySchema from "../../../schemas/cae/registry-entry.v1.json" with { type: "json" };
import activationDefSchema from "../../../schemas/cae/activation-definition.schema.json" with { type: "json" };

/** Ajv v8 ESM/CJS interop — draft 2020-12 meta for CAE JSON schemas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv/dist/2020 default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

const DEFAULT_ARTIFACTS_REL = path.join(".ai", "cae", "registry", "artifacts.v1.json");
const DEFAULT_ACTIVATIONS_REL = path.join(".ai", "cae", "registry", "activations.v1.json");

export type CaeRegistryArtifactRow = Record<string, unknown>;
export type CaeRegistryActivationRow = Record<string, unknown>;

export type CaeLoadedRegistry = {
  artifacts: CaeRegistryArtifactRow[];
  activations: CaeRegistryActivationRow[];
  artifactById: Map<string, CaeRegistryArtifactRow>;
  activationById: Map<string, CaeRegistryActivationRow>;
  /** Stable content digest for cache keys (sha256 hex). */
  registryDigest: string;
};

export type LoadCaeRegistryOptions = {
  artifactsRelativePath?: string;
  activationsRelativePath?: string;
  /** When false, skip on-disk existence checks for artifact ref.path (tests). */
  verifyArtifactPaths?: boolean;
};

export type LoadCaeRegistryResult =
  | { ok: true; value: CaeLoadedRegistry }
  | { ok: false; code: string; message: string };

export type SingleRecordValidationResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const ajv = new Ajv2020Ctor({ allErrors: true, strict: false });
const validateArtifact = ajv.compile(registryEntrySchema as object) as ValidateFunction;
const validateActivation = ajv.compile(activationDefSchema as object) as ValidateFunction;

function readJsonFile(abs: string): { err: LoadCaeRegistryResult } | { doc: Record<string, unknown> } {
  let raw: string;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return { err: { ok: false, code: "cae-registry-read-error", message: `Cannot read file: ${abs}` } };
  }
  try {
    return { doc: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { err: { ok: false, code: "cae-registry-invalid-json", message: `Invalid JSON: ${abs}` } };
  }
}

/** Deterministic JSON for hashing (sorted object keys at every object depth). */
export function stableStringifyForCaeDigest(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringifyForCaeDigest(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForCaeDigest(obj[k])}`).join(",")}}`;
}

/**
 * Content-based registry digest: active **`versionId`** plus normalized artifact + activation rows (**CAE_PLAN B3 / T894**).
 * JSON seed path uses **`JSON_REGISTRY_DIGEST_VERSION_ID`** instead of a SQLite version row.
 */
export const JSON_REGISTRY_DIGEST_VERSION_ID = "json-registry:v1";

export function digestCaeRegistryContent(
  versionId: string,
  artifacts: CaeRegistryArtifactRow[],
  activations: CaeRegistryActivationRow[]
): string {
  const arts = [...artifacts].sort((a, b) => String(a.artifactId).localeCompare(String(b.artifactId)));
  const acts = [...activations].sort((a, b) => String(a.activationId).localeCompare(String(b.activationId)));
  const payload = {
    schemaVersion: 1,
    versionId,
    artifacts: arts.map((row) => stableStringifyForCaeDigest(row)),
    activations: acts.map((row) => stableStringifyForCaeDigest(row))
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Verify every artifact `ref.path` resolves inside `workspaceRoot` and exists on disk.
 * Rejects empty paths, absolute paths, and `..` escapes (**Phase 70 / T892**).
 */
export function verifyCaeArtifactRefPathsExist(
  workspaceRoot: string,
  artifacts: CaeRegistryArtifactRow[]
): LoadCaeRegistryResult | null {
  const root = path.resolve(workspaceRoot);
  for (const row of artifacts) {
    const ref = row.ref as Record<string, unknown> | undefined;
    const p = ref && typeof ref.path === "string" ? ref.path.trim() : "";
    if (!p) {
      return { ok: false, code: "cae-artifact-missing", message: "Registry row missing ref.path" };
    }
    if (path.isAbsolute(p)) {
      return {
        ok: false,
        code: "cae-artifact-path-invalid",
        message: `Artifact ref.path must be repo-relative, not absolute: ${p}`
      };
    }
    const abs = path.resolve(root, p);
    const relToRoot = path.relative(root, abs);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      return {
        ok: false,
        code: "cae-artifact-path-invalid",
        message: `Artifact ref.path escapes workspace root: ${p}`
      };
    }
    if (!fs.existsSync(abs)) {
      return {
        ok: false,
        code: "cae-artifact-missing",
        message: `Artifact ref.path not found: ${p}`
      };
    }
  }
  return null;
}

/**
 * Load default CAE registry files under the workspace root.
 */
export function loadCaeRegistry(
  workspaceRoot: string,
  options?: LoadCaeRegistryOptions
): LoadCaeRegistryResult {
  const artRel = options?.artifactsRelativePath ?? DEFAULT_ARTIFACTS_REL;
  const actRel = options?.activationsRelativePath ?? DEFAULT_ACTIVATIONS_REL;
  const artifactsAbs = path.join(workspaceRoot, artRel);
  const activationsAbs = path.join(workspaceRoot, actRel);

  const artRead = readJsonFile(artifactsAbs);
  if ("err" in artRead) return artRead.err;
  const artDoc = artRead.doc;
  const artifactsRaw = artDoc.artifacts;
  if (!Array.isArray(artifactsRaw)) {
    return { ok: false, code: "cae-registry-schema-invalid", message: "artifacts.v1.json missing artifacts array" };
  }

  const artifacts: CaeRegistryArtifactRow[] = [];
  for (let i = 0; i < artifactsRaw.length; i++) {
    const row = artifactsRaw[i];
    if (!validateArtifact(row)) {
      return {
        ok: false,
        code: "cae-registry-schema-invalid",
        message: `Artifact row ${i}: ${ajv.errorsText(validateArtifact.errors)}`
      };
    }
    artifacts.push(row as CaeRegistryArtifactRow);
  }

  const actRead = readJsonFile(activationsAbs);
  if ("err" in actRead) return actRead.err;
  const actDoc = actRead.doc;
  const activationsRaw = actDoc.activations;
  if (!Array.isArray(activationsRaw)) {
    return {
      ok: false,
      code: "cae-activations-schema-invalid",
      message: "activations.v1.json missing activations array"
    };
  }

  const activations: CaeRegistryActivationRow[] = [];
  for (let i = 0; i < activationsRaw.length; i++) {
    const row = activationsRaw[i];
    if (!validateActivation(row)) {
      return {
        ok: false,
        code: "cae-activations-schema-invalid",
        message: `Activation row ${i}: ${ajv.errorsText(validateActivation.errors)}`
      };
    }
    activations.push(row as CaeRegistryActivationRow);
  }

  const artifactById = new Map<string, CaeRegistryArtifactRow>();
  for (const row of artifacts) {
    const id = row.artifactId as string;
    if (artifactById.has(id)) {
      return { ok: false, code: "cae-registry-schema-invalid", message: `Duplicate artifactId: ${id}` };
    }
    artifactById.set(id, row);
  }

  const activationById = new Map<string, CaeRegistryActivationRow>();
  for (const row of activations) {
    const id = row.activationId as string;
    if (activationById.has(id)) {
      return { ok: false, code: "cae-activations-schema-invalid", message: `Duplicate activationId: ${id}` };
    }
    activationById.set(id, row);
  }

  for (const act of activations) {
    const refs = act.artifactRefs as Array<{ artifactId?: string }> | undefined;
    if (!refs?.length) continue;
    for (const r of refs) {
      const aid = r.artifactId;
      if (aid && !artifactById.has(aid)) {
        return {
          ok: false,
          code: "cae-registry-schema-invalid",
          message: `Activation references unknown artifactId: ${aid}`
        };
      }
    }
  }

  const verifyPaths = options?.verifyArtifactPaths !== false;
  if (verifyPaths) {
    const v = verifyCaeArtifactRefPathsExist(workspaceRoot, artifacts);
    if (v) return v;
  }

  const registryDigest = digestCaeRegistryContent(JSON_REGISTRY_DIGEST_VERSION_ID, artifacts, activations);

  return {
    ok: true,
    value: {
      artifacts,
      activations,
      artifactById,
      activationById,
      registryDigest
    }
  };
}

/** Validate a single artifact object (registry-entry schema). */
export function validateSingleCaeArtifactRecord(
  record: unknown
): SingleRecordValidationResult<CaeRegistryArtifactRow> {
  if (!validateArtifact(record)) {
    return {
      ok: false,
      code: "cae-registry-schema-invalid",
      message: ajv.errorsText(validateArtifact.errors)
    };
  }
  return { ok: true, value: record as CaeRegistryArtifactRow };
}

/** Validate a single activation object (activation-definition schema). */
export function validateSingleCaeActivationRecord(
  record: unknown
): SingleRecordValidationResult<CaeRegistryActivationRow> {
  if (!validateActivation(record)) {
    return {
      ok: false,
      code: "cae-activations-schema-invalid",
      message: ajv.errorsText(validateActivation.errors)
    };
  }
  return { ok: true, value: record as CaeRegistryActivationRow };
}

/** In-memory overlay for preview/tests — does not persist or mutate kit SQLite registries. */
export function appendValidatedCaeRegistryOverlay(
  base: CaeLoadedRegistry,
  appendedArtifacts: CaeRegistryArtifactRow[],
  appendedActivations: CaeRegistryActivationRow[],
  digestSeed: string
):
  | { ok: false; code: string; message: string }
  | { ok: true; value: CaeLoadedRegistry } {
  const seenArt = new Set<string>([...base.artifactById.keys()]);
  const seenAct = new Set<string>([...base.activationById.keys()]);
  for (const row of appendedArtifacts) {
    const id = typeof row.artifactId === "string" ? row.artifactId.trim() : "";
    if (!id || seenArt.has(id)) {
      return { ok: false, code: "cae-registry-schema-invalid", message: `Overlay artifact duplicate or missing artifactId` };
    }
    seenArt.add(id);
  }
  for (const row of appendedActivations) {
    const id = typeof row.activationId === "string" ? row.activationId.trim() : "";
    if (!id || seenAct.has(id)) {
      return { ok: false, code: "cae-registry-schema-invalid", message: `Overlay activation duplicate or missing activationId` };
    }
    seenAct.add(id);
  }
  const artifacts = [...base.artifacts, ...appendedArtifacts];
  const activations = [...base.activations, ...appendedActivations];
  const artifactById = new Map(base.artifactById);
  for (const row of appendedArtifacts) {
    artifactById.set(String(row.artifactId), row);
  }
  const activationById = new Map(base.activationById);
  for (const row of appendedActivations) {
    activationById.set(String(row.activationId), row);
  }
  for (const act of appendedActivations) {
    const refs = act.artifactRefs as Array<{ artifactId?: string }> | undefined;
    if (!refs?.length) continue;
    for (const r of refs) {
      const aid = r.artifactId;
      if (aid && !artifactById.has(aid)) {
        return {
          ok: false,
          code: "cae-registry-schema-invalid",
          message: `Overlay activation references unknown artifactId: ${aid}`
        };
      }
    }
  }
  const versionIdForDigest = `${JSON_REGISTRY_DIGEST_VERSION_ID}:cae-overlay:${digestSeed}:${base.registryDigest.slice(0, 32)}`;
  const registryDigest = digestCaeRegistryContent(versionIdForDigest, artifacts, activations);
  return {
    ok: true,
    value: {
      artifacts,
      activations,
      artifactById,
      activationById,
      registryDigest
    }
  };
}