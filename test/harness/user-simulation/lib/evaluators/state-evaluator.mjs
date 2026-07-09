/**
 * Validates Workflow Cannon state assertions for a simulated trace + scenario fixture.
 */
function countTasksByStatus(tasks, statuses) {
  const set = new Set(statuses);
  return (tasks ?? []).filter((row) => set.has(row.status)).length;
}

export function evaluateState({ scenario, trace }) {
  const findings = [];
  const expectations = scenario.fixture?.stateExpectations ?? {};
  const tasks = scenario.fixture?.tasks ?? [];

  if (trace.phaseKey !== scenario.phaseKey) {
    findings.push({
      severity: "error",
      code: "wrong-phase-operation",
      message: `Trace phaseKey '${trace.phaseKey}' does not match scenario phaseKey '${scenario.phaseKey}'`,
      evidence: { tracePhaseKey: trace.phaseKey, scenarioPhaseKey: scenario.phaseKey }
    });
  }

  const fixtureKitPhase = scenario.fixture?.currentKitPhase ?? scenario.phaseKey;
  if (expectations.currentKitPhaseMustMatch !== false && trace.contextMode) {
    const orchestration = trace.steps?.find(
      (step) =>
        step.kind === "cli-orchestration" ||
        step.kind === "mcp-orchestration" ||
        step.kind === "cli-fallback-orchestration"
    );
    if (orchestration && fixtureKitPhase !== scenario.phaseKey && expectations.enforceKitPhaseAlignment) {
      findings.push({
        severity: "error",
        code: "workspace-phase-mismatch",
        message: `Fixture currentKitPhase '${fixtureKitPhase}' should align with scenario phaseKey '${scenario.phaseKey}'`,
        evidence: { fixtureKitPhase, scenarioPhaseKey: scenario.phaseKey }
      });
    }
  }

  if (typeof expectations.nonTerminalTaskCount === "number") {
    const actual = countTasksByStatus(tasks, ["ready", "in_progress", "blocked", "proposed"]);
    if (actual !== expectations.nonTerminalTaskCount) {
      findings.push({
        severity: "error",
        code: "incorrect-task-state",
        message: `Expected ${expectations.nonTerminalTaskCount} non-terminal task(s), fixture has ${actual}`,
        evidence: { expected: expectations.nonTerminalTaskCount, actual, tasks }
      });
    }
  }

  if (typeof expectations.completedTaskCount === "number") {
    const actual = countTasksByStatus(tasks, ["completed"]);
    if (actual !== expectations.completedTaskCount) {
      findings.push({
        severity: "error",
        code: "incorrect-task-state",
        message: `Expected ${expectations.completedTaskCount} completed task(s), fixture has ${actual}`,
        evidence: { expected: expectations.completedTaskCount, actual, tasks }
      });
    }
  }

  if (trace.verdict !== scenario.fixture?.expectedVerdict) {
    findings.push({
      severity: "error",
      code: "incorrect-orchestration-verdict",
      message: `Trace verdict '${trace.verdict}' does not match fixture expectedVerdict '${scenario.fixture?.expectedVerdict}'`,
      evidence: { traceVerdict: trace.verdict, expectedVerdict: scenario.fixture?.expectedVerdict }
    });
  }

  if (expectations.requireOrchestrationRefs) {
    const orchestration = trace.steps?.find(
      (step) =>
        step.kind === "cli-orchestration" ||
        step.kind === "mcp-orchestration" ||
        step.kind === "cli-fallback-orchestration"
    );
    if (!orchestration?.hasRefs) {
      findings.push({
        severity: "error",
        code: "missing-orchestration-refs",
        message: "State audit requires command/instruction refs on orchestration output",
        evidence: { stepKind: orchestration?.kind ?? null }
      });
    }
  }

  if (expectations.requireAssignmentPacketDigest) {
    const digest = trace.assignmentPacketDigest ?? trace.comparableFields?.assignmentPacketDigest;
    if (!digest || String(digest).trim().length === 0) {
      findings.push({
        severity: "error",
        code: "missing-assignment-packet-digest",
        message: "Scenario requires an assignment packet digest on the simulation trace",
        evidence: { assignmentPacketDigest: digest ?? null }
      });
    }
  }

  if (
    expectations.requireReleaseEvidenceWhenReady &&
    scenario.fixture?.expectedVerdict === "ready-to-ship" &&
    !trace.releaseEvidencePresent
  ) {
    findings.push({
      severity: "error",
      code: "missing-release-evidence",
      message: "ready-to-ship fixture requires release evidence on the trace",
      evidence: { releaseEvidencePresent: trace.releaseEvidencePresent ?? false }
    });
  }

  return {
    passed: findings.every((row) => row.severity !== "error"),
    findings
  };
}
