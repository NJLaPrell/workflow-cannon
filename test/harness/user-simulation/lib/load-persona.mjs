import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assertValidPersona } from "./validate-schema.mjs";
import { HARNESS_ROOT, harnessPath } from "./harness-paths.mjs";

function readJson(relativePath) {
  return JSON.parse(readFileSync(harnessPath(relativePath), "utf8"));
}

export function loadPersona(personaId) {
  const persona = readJson(path.join("personas", `${personaId}.json`));
  if (persona.id !== personaId) {
    throw new Error(`persona:${personaId}: file id '${persona.id}' does not match filename`);
  }
  return assertValidPersona(persona, `persona:${personaId}`);
}

export function listPersonaIds() {
  return readdirSync(path.join(HARNESS_ROOT, "personas"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

export function loadAllPersonas() {
  return listPersonaIds().map((id) => loadPersona(id));
}

export function getHarnessRoot() {
  return HARNESS_ROOT;
}