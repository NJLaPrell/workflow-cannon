import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";

const SCHEMA_PATH = path.join(fileURLToPath(new URL("../../..", import.meta.url)), "schemas/skill-pack-manifest.schema.json");

type AjvLike = { compile: (schema: object) => ValidateFunction };

function createAjv(): AjvLike {
  const Ctor = AjvImport as unknown as new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvLike;
  /** strict:false — bundled schema uses `$schema` draft URL meta; Ajv 8 does not load that ref in strict mode. */
  return new Ctor({ allErrors: true, strict: false });
}

let validateManifest: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!validateManifest) {
    const raw = readFileSync(SCHEMA_PATH, "utf8");
    const schema = JSON.parse(raw) as Record<string, unknown>;
    delete schema.$schema;
    delete schema.$id;
    validateManifest = createAjv().compile(schema as object);
  }
  return validateManifest;
}

export type SidecarManifest = {
  skillPackManifestVersion: 1;
  id: string;
  version: string;
  displayName: string;
  instructionsRelPath: string;
  discoveryTags?: string[];
  declaredCommands?: string[];
  hookEventNames?: string[];
  policySensitivityHint?: "non-sensitive" | "sensitive" | "sensitive-with-dryrun";
};

export function validateSidecarJson(data: unknown): { ok: true; manifest: SidecarManifest } | { ok: false; message: string } {
  const v = getValidator();
  if (!v(data)) {
    const errs = (v.errors ?? []) as ErrorObject[];
    const msg = errs.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ");
    return { ok: false, message: msg || "manifest schema validation failed" };
  }
  return { ok: true, manifest: data as SidecarManifest };
}
