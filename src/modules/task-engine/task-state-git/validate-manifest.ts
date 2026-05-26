import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { TaskStateGitManifestV1 } from "./types.js";
import manifestSchema from "./schemas/task-state-manifest.v1.json" with { type: "json" };
import { TASK_STATE_GIT_BRANCH, TASK_STATE_ROOT_DIR } from "./constants.js";
import { digestTaskStateCanonicalJson } from "./integrity.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

let compiled: ValidateFunction | null = null;

function loadValidator(): ValidateFunction {
  if (compiled) {
    return compiled;
  }
  const ajv = new Ajv2020Ctor({ strict: false, allErrors: true }) as {
    compile: (schema: object) => ValidateFunction;
  };
  compiled = ajv.compile(manifestSchema as object);
  return compiled;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) {
    return ["validation failed"];
  }
  return errors.map((e) => {
    const p = e.instancePath?.length ? e.instancePath : "(root)";
    return `${p}: ${e.message ?? e.keyword ?? "error"}`;
  });
}

export function manifestBodyForDigest(manifest: TaskStateGitManifestV1): Omit<TaskStateGitManifestV1, "manifestDigest"> {
  const { manifestDigest: _omit, ...rest } = manifest;
  return rest;
}

export function computeManifestDigest(manifest: TaskStateGitManifestV1): string {
  return digestTaskStateCanonicalJson(manifestBodyForDigest(manifest));
}

export function validateTaskStateGitManifest(
  input: unknown,
  options?: { verifyManifestDigest?: boolean }
): { ok: true; data: TaskStateGitManifestV1 } | { ok: false; errors: string[] } {
  const validate = loadValidator();
  if (!validate(input)) {
    return { ok: false, errors: formatAjvErrors(validate.errors) };
  }
  const data = input as TaskStateGitManifestV1;
  const errors: string[] = [];
  if (data.branch !== TASK_STATE_GIT_BRANCH) {
    errors.push(`branch: expected ${TASK_STATE_GIT_BRANCH}, got ${data.branch}`);
  }
  if (data.root !== TASK_STATE_ROOT_DIR) {
    errors.push(`root: expected ${TASK_STATE_ROOT_DIR}, got ${data.root}`);
  }
  if (options?.verifyManifestDigest && data.manifestDigest) {
    const expected = computeManifestDigest(data);
    if (data.manifestDigest !== expected) {
      errors.push(`manifestDigest: expected ${expected}, got ${data.manifestDigest}`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data };
}

export function taskStateManifestSchemaRelativePath(): string {
  return "src/modules/task-engine/task-state-git/schemas/task-state-manifest.v1.json";
}
