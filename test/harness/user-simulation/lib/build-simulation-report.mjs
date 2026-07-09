/**
 * Build actionable simulation reports from harness run output.
 * Does not mutate production task state — improvement payloads are dry-run templates only.
 */
function findingRow({ scenarioId, personaId, contextMode, step, finding }) {
  return {
    scenarioId,
    personaId: personaId ?? null,
    contextMode: contextMode ?? null,
    step: step ?? finding.step ?? null,
    severity: finding.severity,
    code: finding.code,
    message: finding.message,
    evidence: finding.evidence ?? null
  };
}

function improvementPayload({ scenarioId, personaId, finding }) {
  return {
    dryRun: true,
    kind: finding.severity === "error" ? "defect" : "improvement",
    title: `[user-simulation] ${finding.code} (${scenarioId})`,
    summary: finding.message,
    metadata: {
      source: "user-simulation-harness",
      scenarioId,
      personaId: personaId ?? null,
      findingCode: finding.code,
      evidence: finding.evidence ?? null
    },
    suggestedCommand: null
  };
}

export function buildSimulationReport(runReport) {
  const rows = [];
  const payloads = [];

  const pushFinding = (finding, meta = {}) => {
    rows.push(
      findingRow({
        scenarioId: runReport.scenarioId,
        personaId: meta.personaId,
        contextMode: meta.contextMode,
        step: meta.step,
        finding
      })
    );
    if (finding.severity === "error" || finding.severity === "warn") {
      payloads.push(
        improvementPayload({
          scenarioId: runReport.scenarioId,
          personaId: meta.personaId,
          finding
        })
      );
    }
  };

  for (const finding of runReport.responseEvaluation?.findings ?? []) {
    pushFinding(finding, { step: "response-evaluation" });
  }

  for (const state of Object.entries(runReport.stateEvaluation ?? {})) {
    const [mode, evaluation] = state;
    for (const finding of evaluation?.findings ?? []) {
      pushFinding(finding, { contextMode: mode, step: "state-evaluation" });
    }
  }

  for (const run of runReport.personaRuns ?? []) {
    for (const [mode, evaluation] of Object.entries(run.evaluations?.ux ?? {})) {
      for (const finding of evaluation?.findings ?? []) {
        pushFinding(finding, { personaId: run.personaId, contextMode: mode, step: "ux-evaluation" });
      }
    }
    for (const [mode, evaluation] of Object.entries(run.evaluations?.efficiency ?? {})) {
      for (const finding of evaluation?.findings ?? []) {
        pushFinding(finding, { personaId: run.personaId, contextMode: mode, step: "efficiency-evaluation" });
      }
    }
  }

  const errors = rows.filter((row) => row.severity === "error");

  return {
    schemaVersion: 1,
    scenarioId: runReport.scenarioId,
    phaseKey: runReport.phaseKey,
    ok: runReport.ok === true && errors.length === 0,
    dryRun: true,
    summary: {
      findingCount: rows.length,
      errorCount: errors.length,
      warningCount: rows.filter((row) => row.severity === "warn").length,
      improvementPayloadCount: payloads.length
    },
    findings: rows,
    improvementPayloads: payloads,
    metrics: runReport.metrics ?? null
  };
}
