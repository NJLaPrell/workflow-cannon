import { loadPersona } from "./load-persona.mjs";
import { loadScenario } from "./load-scenario.mjs";
import { simulateCompleteReleaseFlow } from "./simulate-complete-release.mjs";
import { evaluateEfficiency } from "./evaluators/efficiency-evaluator.mjs";
import { evaluateUx } from "./evaluators/ux-evaluator.mjs";
import { evaluateResponse } from "./evaluators/response-evaluator.mjs";

export async function runUserSimulationScenario({
  scenarioId,
  personaIds,
  contextModes,
  dryRun = false
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
    ...personaRuns.flatMap((run) =>
      modes.flatMap((mode) => [
        ...(run.evaluations.efficiency[mode]?.findings ?? []),
        ...(run.evaluations.ux[mode]?.findings ?? [])
      ])
    )
  ];
  const errors = allFindings.filter((row) => row.severity === "error");

  return {
    ok: errors.length === 0,
    scenarioId: scenario.id,
    phaseKey: scenario.phaseKey,
    contextModes: modes,
    personaIds: personas.map((row) => row.id),
    dryRun,
    tracesByMode,
    personaRuns,
    responseEvaluation,
    summary: {
      errorCount: errors.length,
      warningCount: allFindings.filter((row) => row.severity === "warn").length,
      verdictComparable:
        responseEvaluation.passed &&
        modes.includes("cli") &&
        modes.includes("mcp")
    }
  };
}

export { loadPersona, loadScenario, simulateCompleteReleaseFlow };
