import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { TaskStateEventV1 } from "./event-payloads.js";
import envelopeSchema from "./schemas/task-state-event-envelope.v1.json" with { type: "json" };
import eventSchema from "./schemas/task-state-event.v1.json" with { type: "json" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv/dist/2020 default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

let compiled: ValidateFunction | null = null;

function loadValidator(): ValidateFunction {
  if (compiled) {
    return compiled;
  }
  const ajv = new Ajv2020Ctor({ strict: false, allErrors: true }) as {
    addSchema: (schema: object) => void;
    compile: (schema: object) => ValidateFunction;
  };
  ajv.addSchema(envelopeSchema as object);
  compiled = ajv.compile(eventSchema as object);
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

export function validateTaskStateEvent(
  input: unknown
): { ok: true; data: TaskStateEventV1 } | { ok: false; errors: string[] } {
  const validate = loadValidator();
  if (!validate(input)) {
    return { ok: false, errors: formatAjvErrors(validate.errors) };
  }
  return { ok: true, data: input as TaskStateEventV1 };
}
