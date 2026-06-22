import assert from "node:assert/strict";
import test from "node:test";

import { loadPersona, listPersonaIds } from "./harness/user-simulation/lib/load-persona.mjs";
import {
  loadScenario,
  listScenarioIds,
  VALID_CONTEXT_MODES
} from "./harness/user-simulation/lib/load-scenario.mjs";
import { runUserSimulationScenario } from "./harness/user-simulation/lib/run-scenario.mjs";
import { simulateCompleteReleaseFlow } from "./harness/user-simulation/lib/simulate-complete-release.mjs";

test("user simulation personas load and validate", () => {
  const ids = listPersonaIds();
  assert.deepEqual(ids.sort(), ["expert-engineer", "pm-nontechnical"]);
  for (const id of ids) {
    const persona = loadPersona(id);
    assert.ok(persona.goals.length > 0);
    assert.ok(persona.behaviorProfile.length > 0);
    assert.ok(persona.successCriteria.length > 0);
  }
});

test("user simulation scenarios load and include MCP context modes", () => {
  const ids = listScenarioIds();
  assert.ok(ids.includes("complete-release-completed-only"));
  const scenario = loadScenario("complete-release-completed-only");
  assert.equal(scenario.entryPoint, "dashboard-complete-and-release");
  assert.equal(scenario.phaseKey, "134");
  assert.deepEqual(scenario.personaIds, ["pm-nontechnical", "expert-engineer"]);
  for (const mode of scenario.contextModes) {
    assert.ok(VALID_CONTEXT_MODES.has(mode));
  }
  assert.ok(scenario.contextModes.includes("mcp"));
  assert.ok(scenario.contextModes.includes("cli"));
  assert.ok(scenario.contextModes.includes("mcp-fallback"));
});

test("complete-release scenario runs CLI, MCP, and MCP-fallback comparably", async () => {
  const report = await runUserSimulationScenario({
    scenarioId: "complete-release-completed-only"
  });

  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.summary.errorCount, 0);
  assert.equal(report.summary.verdictComparable, true);
  assert.equal(report.tracesByMode.cli.verdict, "ready-to-ship");
  assert.equal(report.tracesByMode.mcp.verdict, "ready-to-ship");
  assert.equal(report.tracesByMode["mcp-fallback"].verdict, "ready-to-ship");
});

test("MCP mode uses orchestration tool and avoids broad CLI discovery", async () => {
  const scenario = loadScenario("complete-release-completed-only");
  const trace = await simulateCompleteReleaseFlow({ scenario, contextMode: "mcp" });

  assert.deepEqual(trace.mcpToolsCalled, [
    "workflow-cannon.agent_start",
    "workflow-cannon.phase-release-orchestration-state"
  ]);
  assert.deepEqual(trace.commandsRun, []);
  const bootstrap = trace.steps.find((step) => step.kind === "mcp-bootstrap");
  assert.equal(bootstrap.recommendedMcpTool, "workflow-cannon.phase-release-orchestration-state");
  assert.match(bootstrap.recommendedCliCommand, /phase-release-orchestration-state/);
  const orchestration = trace.steps.find((step) => step.kind === "mcp-orchestration");
  assert.ok(orchestration.hasRefs);
  assert.ok(orchestration.freshness);
});

test("MCP fallback records explicit fallback before CLI orchestration", async () => {
  const scenario = loadScenario("complete-release-completed-only");
  const trace = await simulateCompleteReleaseFlow({ scenario, contextMode: "mcp-fallback" });

  assert.ok(trace.fallbackEvents.some((event) => event.code === "MCP_UNAVAILABLE"));
  assert.ok(trace.fallbackEvents.some((event) => event.code === "CLI_FALLBACK"));
  assert.deepEqual(trace.commandsRun, ["phase-release-orchestration-state"]);
  assert.equal(trace.verdict, "ready-to-ship");
});

test("PM and expert persona UX evaluators pass for MCP mode", async () => {
  const report = await runUserSimulationScenario({
    scenarioId: "complete-release-completed-only",
    contextModes: ["mcp"]
  });

  for (const run of report.personaRuns) {
    const ux = run.evaluations.ux.mcp;
    assert.equal(ux.passed, true, `${run.personaId}: ${JSON.stringify(ux.findings)}`);
  }
});
