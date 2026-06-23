import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getHarnessRoot } from "./load-persona.mjs";

const VALID_CONTEXT_MODES = new Set(["cli", "mcp", "mcp-fallback"]);

function readJson(relativePath) {
  const absolute = path.join(getHarnessRoot(), relativePath);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

function assertScenarioShape(scenario, sourceLabel) {
  const required = [
    "id",
    "title",
    "entryPoint",
    "phaseKey",
    "personaIds",
    "contextModes",
    "fixture",
    "efficiency"
  ];
  for (const key of required) {
    if (scenario[key] === undefined || scenario[key] === null) {
      throw new Error(`${sourceLabel}: missing required scenario field '${key}'`);
    }
  }
  if (!Array.isArray(scenario.contextModes) || scenario.contextModes.length === 0) {
    throw new Error(`${sourceLabel}: scenario.contextModes must be a non-empty array`);
  }
  for (const mode of scenario.contextModes) {
    if (!VALID_CONTEXT_MODES.has(mode)) {
      throw new Error(`${sourceLabel}: invalid contextMode '${mode}'`);
    }
  }
  if (!scenario.fixture?.expectedVerdict) {
    throw new Error(`${sourceLabel}: fixture.expectedVerdict is required`);
  }
  return scenario;
}

export function loadScenario(scenarioId) {
  const scenario = readJson(path.join("scenarios", `${scenarioId}.json`));
  return assertScenarioShape(scenario, `scenario:${scenarioId}`);
}

export function listScenarioIds() {
  return readdirSync(path.join(getHarnessRoot(), "scenarios"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

export function loadAllScenarios() {
  return listScenarioIds().map((id) => loadScenario(id));
}

export { VALID_CONTEXT_MODES };
