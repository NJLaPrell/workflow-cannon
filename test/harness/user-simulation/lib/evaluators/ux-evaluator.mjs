export function evaluateUx({ persona, trace, scenario }) {
  const findings = [];
  const expectations = persona.uxExpectations ?? {};

  if (expectations.requiresEvidenceRefs) {
    const orchestrationStep = trace.steps.find(
      (step) =>
        step.kind === "mcp-orchestration" ||
        step.kind === "cli-orchestration" ||
        step.kind === "cli-fallback-orchestration"
    );
    if (!orchestrationStep?.hasRefs) {
      findings.push({
        severity: "error",
        code: "missing-evidence-refs",
        message: `${persona.id} requires command/instruction refs in orchestration output`
      });
    }
  }

  if (expectations.prefersPlainLanguage) {
    const serialized = JSON.stringify(trace.steps);
    for (const term of expectations.forbidsTechnicalTerms ?? []) {
      if (serialized.toLowerCase().includes(term.toLowerCase())) {
        findings.push({
          severity: "warn",
          code: "technical-term-exposed",
          message: `${persona.id} should avoid exposing '${term}' in user-facing trace`
        });
      }
    }
  }

  if (persona.id === "expert-engineer") {
    if (trace.phaseKey !== scenario.phaseKey) {
      findings.push({
        severity: "error",
        code: "phase-key-mismatch",
        message: "Expert persona expects explicit phaseKey on trace"
      });
    }
    if (trace.contextMode === "mcp") {
      const bootstrap = trace.steps.find((step) => step.kind === "mcp-bootstrap");
      if (bootstrap?.recommendedMcpTool !== "workflow-cannon.phase-release-orchestration-state") {
        findings.push({
          severity: "error",
          code: "wrong-mcp-recommendation",
          message: "Expert persona expects phase-release-orchestration-state as recommended MCP tool"
        });
      }
    }
  }

  if (persona.id === "pm-nontechnical" && trace.contextMode === "mcp") {
    if (!trace.verdict) {
      findings.push({
        severity: "error",
        code: "missing-verdict",
        message: "PM persona needs a clear verdict from MCP orchestration"
      });
    }
  }

  return {
    passed: findings.every((row) => row.severity !== "error"),
    findings
  };
}
