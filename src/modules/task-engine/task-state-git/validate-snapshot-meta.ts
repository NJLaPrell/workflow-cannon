import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { TaskStateGitSnapshotMetaV1 } from "./types.js";
import snapshotMetaSchema from "./schemas/task-state-snapshot-meta.v1.json" with { type: "json" };

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
  compiled = ajv.compile(snapshotMetaSchema as object);
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

export function validateTaskStateGitSnapshotMeta(
  input: unknown
): { ok: true; data: TaskStateGitSnapshotMetaV1 } | { ok: false; errors: string[] } {
  const validate = loadValidator();
  if (!validate(input)) {
    return { ok: false, errors: formatAjvErrors(validate.errors) };
  }
  return { ok: true, data: input as TaskStateGitSnapshotMetaV1 };
}

export function taskStateSnapshotMetaSchemaRelativePath(): string {
  return "src/modules/task-engine/task-state-git/schemas/task-state-snapshot-meta.v1.json";
}
