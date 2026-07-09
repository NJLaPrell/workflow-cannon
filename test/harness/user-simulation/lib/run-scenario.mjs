import { loadPersona } from "./load-persona.mjs";
import { loadScenario } from "./load-scenario.mjs";
import { simulateCompleteReleaseFlow } from "./simulate-complete-release.mjs";
import { evaluateEfficiency } from "./evaluators/efficiency-evaluator.mjs";
import { evaluateUx } from "./evaluators/ux-evaluator.mjs";
import { evaluateResponse } from "./evaluators/response-evaluator.mjs";
import { evaluateState } from "./evaluators/state-evaluator.mjs";
import { buildSimulationReport } from "./build-simulation-report.mjs";

export async function runUserSimulationScenario({
  scenarioId,
  personaIds,
  contextModes,
  dryRun = false,
  includeReport = false
}) {
  const scenario = loadScenario(scenarioId);
  const personas = (personaIds ?? scenario.personaIds).map((id) => loadPersona(id));
  const modes = contextModes ?? scenario.contextModes;

  const tracesByMode = {};
  for (const mode of modes) {
    if (dryRun) {
      tracesByMode[mode] = {
        contextMode: mode,
        scenarioId: scenario.id,
        phaseKey: scenario.phaseKey,
        dryRun: true,
        verdict: scenario.fixture.expectedVerdict
      };
      continue;
    }
    tracesByMode[mode] = await simulateCompleteReleaseFlow({ scenario, contextMode: mode });
  }

  const stateEvaluation = {};
  for (const mode of modes) {
    stateEvaluation[mode] = evaluateState({ scenario, trace: tracesByMode[mode] });
  }

  const personaRuns = [];
  for (const persona of personas) {
    const evaluations = {
      efficiency: {},
      ux: {}
    };
    for (const mode of modes) {
      const trace = tracesByMode[mode];
      evaluations.efficiency[mode] = evaluateEfficiency({ scenario, trace });
      evaluations.ux[mode] = evaluateUx({ persona, trace, scenario });
    }
    personaRuns.push({
      personaId: persona.id,
      evaluations
    });
  }

  const responseEvaluation = evaluateResponse({ scenario, tracesByMode });
  const allFindings = [
    ...responseEvaluation.findings,
    ...Object.values(stateEvaluation).flatMap((row) => row.findings ?? []),
    ...personaRuns.flatMap((run) =>
      modes.flatMap((mode) => [
        ...(run.evaluations.efficiency[mode]?.findings ?? []),
        ...(run.evaluations.ux[mode]?.findings ?? [])
      ])
    )
  ];
  const errors = allFindings.filter((row) => row.severity === "error");

  const metrics = Object.fromEntries(
    modes.map((mode) => [mode, tracesByMode[mode]?.metrics ?? null]).filter(([, value]) => value != null)
  );

  const report = {
    ok: errors.length === 0,
    scenarioId: scenario.id,
    phaseKey: scenario.phaseKey,
    contextModes: modes,
    personaIds: personas.map((row) => row.id),
    dryRun,
    tracesByMode,
    stateEvaluation,
    personaRuns,
    responseEvaluation,
    metrics,
    summary: {
      errorCount: errors.length,
      warningCount: allFindings.filter((row) => row.severity === "warn").length,
      verdictComparable:
        responseEvaluation.passed &&
        modes.includes("cli") &&
        modes.includes("mcp")
    }
  };

  if (includeReport) {
    report.simulationReport = buildSimulationReport(report);
  }

  return report;
}

export { loadPersona, loadScenario, simulateCompleteReleaseFlow, buildSimulationReport };
