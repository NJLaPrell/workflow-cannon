import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  const absolute = path.join(HARNESS_ROOT, relativePath);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

function assertPersonaShape(persona, sourceLabel) {
  const required = ["id", "title", "goals", "behaviorProfile", "successCriteria"];
  for (const key of required) {
    if (persona[key] === undefined || persona[key] === null) {
      throw new Error(`${sourceLabel}: missing required persona field '${key}'`);
    }
  }
  if (!Array.isArray(persona.goals) || persona.goals.length === 0) {
    throw new Error(`${sourceLabel}: persona.goals must be a non-empty array`);
  }
  return persona;
}

export function loadPersona(personaId) {
  const persona = readJson(path.join("personas", `${personaId}.json`));
  return assertPersonaShape(persona, `persona:${personaId}`);
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
