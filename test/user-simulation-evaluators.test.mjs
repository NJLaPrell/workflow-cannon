import assert from "node:assert/strict";
import test from "node:test";

import { loadPersona } from "./harness/user-simulation/lib/load-persona.mjs";
import { loadScenario } from "./harness/user-simulation/lib/load-scenario.mjs";
import { evaluateState } from "./harness/user-simulation/lib/evaluators/state-evaluator.mjs";
import { evaluateEfficiency } from "./harness/user-simulation/lib/evaluators/efficiency-evaluator.mjs";
import { evaluateUx } from "./harness/user-simulation/lib/evaluators/ux-evaluator.mjs";
import { buildSimulationReport } from "./harness/user-simulation/lib/build-simulation-report.mjs";
import { runUserSimulationScenario } from "./harness/user-simulation/lib/run-scenario.mjs";

test("state evaluator catches wrong phase and missing release evidence", () => {
  const scenario = loadScenario("complete-release-completed-only");
  const badPhase = evaluateState({
    scenario,
    trace: { phaseKey: "999", verdict: "ready-to-ship", steps: [] }
  });
  assert.equal(badPhase.passed, false);
  assert.ok(badPhase.findings.some((row) => row.code === "wrong-phase-operation"));

  const missingEvidence = evaluateState({
    scenario: {
      ...scenario,
      fixture: {
        ...scenario.fixture,
        stateExpectations: {
          ...scenario.fixture.stateExpectations,
          requireReleaseEvidenceWhenReady: true
        }
      }
    },
    trace: {
      phaseKey: scenario.phaseKey,
      verdict: "ready-to-ship",
      releaseEvidencePresent: false,
      steps: [{ kind: "cli-orchestration", hasRefs: true }]
    }
  });
  assert.equal(missingEvidence.passed, false);
  assert.ok(missingEvidence.findings.some((row) => row.code === "missing-release-evidence"));
});

test("state evaluator catches missing assignment packet digest", () => {
  const scenario = loadScenario("complete-release-active-work");
  const result = evaluateState({
    scenario: {
      ...scenario,
      fixture: {
        ...scenario.fixture,
        stateExpectations: {
          ...scenario.fixture.stateExpectations,
          requireAssignmentPacketDigest: true
        }
      }
    },
    trace: {
      phaseKey: scenario.phaseKey,
      verdict: scenario.fixture.expectedVerdict,
      assignmentPacketDigest: null,
      steps: [{ kind: "cli-orchestration", hasRefs: true }]
    }
  });
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((row) => row.code === "missing-assignment-packet-digest"));
});

test("efficiency evaluator compares expected command sequence and records metrics", () => {
  const scenario = loadScenario("complete-release-empty-phase");
  const trace = {
    contextMode: "cli",
    commandsRun: ["phase-release-orchestration-state"],
    mcpToolsCalled: [],
    runbookResourceReads: [],
    metrics: { contextBytes: 100, packetBytes: 50, transportEventBytes: 25 }
  };
  const ok = evaluateEfficiency({ scenario, trace });
  assert.equal(ok.passed, true);
  assert.equal(ok.metrics.packetBytes, 50);

  const bad = evaluateEfficiency({
    scenario,
    trace: { ...trace, commandsRun: ["list-tasks"] }
  });
  assert.equal(bad.passed, false);
  assert.ok(bad.findings.some((row) => row.code === "command-sequence-mismatch"));
});

test("UX evaluators are deterministic for PM and expert personas", () => {
  const scenario = loadScenario("complete-release-completed-only");
  const pm = loadPersona("pm-nontechnical");
  const expert = loadPersona("expert-engineer");
  const trace = {
    phaseKey: scenario.phaseKey,
    contextMode: "mcp",
    verdict: "ready-to-ship",
    steps: [
      {
        kind: "mcp-bootstrap",
        recommendedMcpTool: "workflow-cannon.phase-release-orchestration-state"
      },
      { kind: "mcp-orchestration", hasRefs: true, freshness: { stale: false } }
    ]
  };

  const pmUx = evaluateUx({ persona: pm, trace, scenario });
  const expertUx = evaluateUx({ persona: expert, trace, scenario });
  assert.equal(pmUx.passed, true);
  assert.equal(expertUx.passed, true);

  const expertNoRefs = evaluateUx({
    persona: expert,
    trace: { ...trace, steps: [{ kind: "mcp-orchestration", hasRefs: false }] },
    scenario
  });
  assert.equal(expertNoRefs.passed, false);
});

test("runUserSimulationScenario includeReport attaches simulationReport", async () => {
  const runReport = await runUserSimulationScenario({
    scenarioId: "complete-release-empty-phase",
    contextModes: ["cli"],
    includeReport: true
  });
  assert.ok(runReport.simulationReport);
  assert.ok(runReport.metrics?.cli?.contextBytes > 0);
});

test("simulation report traces findings and emits dry-run improvement payloads only", () => {
  const synthetic = {
    ok: false,
    scenarioId: "complete-release-active-work",
    phaseKey: "132",
    responseEvaluation: {
      findings: [{ severity: "warn", code: "sample-finding", message: "sample" }]
    },
    stateEvaluation: {
      cli: {
        findings: [{ severity: "error", code: "incorrect-task-state", message: "bad state" }]
      }
    },
    personaRuns: [
      {
        personaId: "pm-nontechnical",
        evaluations: {
          ux: { mcp: { findings: [{ severity: "warn", code: "technical-term-exposed", message: "jargon" }] } },
          efficiency: { mcp: { findings: [] } }
        }
      }
    ]
  };
  const report = buildSimulationReport(synthetic);
  assert.equal(report.dryRun, true);
  assert.ok(report.findings.length >= 2);
  assert.ok(report.findings.every((row) => row.scenarioId === "complete-release-active-work"));
  assert.ok(report.improvementPayloads.every((row) => row.dryRun === true));
  assert.ok(report.improvementPayloads.some((row) => row.kind === "defect"));
});
