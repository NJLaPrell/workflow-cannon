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

function digestRegistry(artifactIds: string[], activationIds: string[]): string {
  const payload = JSON.stringify({
    artifactIds: [...artifactIds].sort((a, b) => a.localeCompare(b)),
    activationIds: [...activationIds].sort((a, b) => a.localeCompare(b))
  });
  return createHash("sha256").update(payload).digest("hex");
}

function verifyRefsExist(workspaceRoot: string, artifacts: CaeRegistryArtifactRow[]): LoadCaeRegistryResult | null {
  for (const row of artifacts) {
    const ref = row.ref as Record<string, unknown> | undefined;
    const p = ref && typeof ref.path === "string" ? ref.path : "";
    if (!p) {
      return { ok: false, code: "cae-artifact-missing", message: "Registry row missing ref.path" };
    }
    const abs = path.join(workspaceRoot, p);
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
    const v = verifyRefsExist(workspaceRoot, artifacts);
    if (v) return v;
  }

  const registryDigest = digestRegistry(
    [...artifactById.keys()],
    [...activationById.keys()]
  );

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
