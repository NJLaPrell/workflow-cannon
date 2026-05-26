import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { TaskStateEventEnvelopeV1 } from "./types.js";
import envelopeSchema from "./schemas/task-state-event-envelope.v1.json" with { type: "json" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv/dist/2020 default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

let compiled: ValidateFunction | null = null;

function loadValidator(): ValidateFunction {
  if (compiled) {
    return compiled;
  }
  const ajv = new Ajv2020Ctor({ strict: false, allErrors: true }) as {
    compile: (schema: object) => ValidateFunction;
  };
  compiled = ajv.compile(envelopeSchema as object);
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

const ENVELOPE_ONLY_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "sequence",
  "parentEventId",
  "recordedAt",
  "actor",
  "clientMutationId",
  "command",
  "workspace"
]);

function envelopeOnlyInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const out: Record<string, unknown> = {};
  for (const key of ENVELOPE_ONLY_KEYS) {
    if (key in (input as Record<string, unknown>)) {
      out[key] = (input as Record<string, unknown>)[key];
    }
  }
  return out;
}

export function validateTaskStateEventEnvelope(
  input: unknown
): { ok: true; data: TaskStateEventEnvelopeV1 } | { ok: false; errors: string[] } {
  const validate = loadValidator();
  const slice = envelopeOnlyInput(input);
  if (!validate(slice)) {
    return { ok: false, errors: formatAjvErrors(validate.errors) };
  }
  const extra =
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.keys(input as Record<string, unknown>).filter((k) => !ENVELOPE_ONLY_KEYS.has(k))
      : [];
  if (extra.length > 0) {
    return { ok: false, errors: [`(root): unexpected properties for envelope-only validation: ${extra.join(", ")}`] };
  }
  return { ok: true, data: slice as TaskStateEventEnvelopeV1 };
}

export function taskStateEventEnvelopeSchemaRelativePath(): string {
  return "src/modules/task-engine/task-state-events/schemas/task-state-event-envelope.v1.json";
}
