import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { harnessPath } from "./harness-paths.mjs";

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });

function compileSchema(relativePath) {
  const schema = JSON.parse(readFileSync(harnessPath(relativePath), "utf8"));
  return ajv.compile(schema);
}

const validatePersona = compileSchema("persona.schema.json");
const validateScenario = compileSchema("scenario.schema.json");

function formatErrors(validateFn, label) {
  return validateFn.errors?.map((row) => `${row.instancePath || "/"} ${row.message}`).join("; ") ?? label;
}

export function assertValidPersona(persona, sourceLabel) {
  if (!validatePersona(persona)) {
    throw new Error(`${sourceLabel}: persona schema validation failed: ${formatErrors(validatePersona, "invalid")}`);
  }
  return persona;
}

export function assertValidScenario(scenario, sourceLabel) {
  if (!validateScenario(scenario)) {
    throw new Error(`${sourceLabel}: scenario schema validation failed: ${formatErrors(validateScenario, "invalid")}`);
  }
  return scenario;
}
