import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getHarnessRoot } from "./harness-paths.mjs";
import { assertValidScenario } from "./validate-schema.mjs";

const VALID_CONTEXT_MODES = new Set(["cli", "mcp", "mcp-fallback"]);

function readJson(relativePath) {
  const absolute = path.join(getHarnessRoot(), relativePath);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

export function loadScenario(scenarioId) {
  const scenario = readJson(path.join("scenarios", `${scenarioId}.json`));
  if (scenario.id !== scenarioId) {
    throw new Error(`scenario:${scenarioId}: file id '${scenario.id}' does not match filename`);
  }
  assertValidScenario(scenario, `scenario:${scenarioId}`);
  for (const mode of scenario.contextModes) {
    if (!VALID_CONTEXT_MODES.has(mode)) {
      throw new Error(`scenario:${scenarioId}: invalid contextMode '${mode}'`);
    }
  }
  return scenario;
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
