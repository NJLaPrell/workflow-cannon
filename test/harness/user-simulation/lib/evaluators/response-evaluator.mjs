export function evaluateResponse({ scenario, tracesByMode }) {
  const findings = [];
  const expectedVerdict = scenario.fixture.expectedVerdict;
  const cliTrace = tracesByMode.cli;
  const mcpTrace = tracesByMode.mcp;
  const fallbackTrace = tracesByMode["mcp-fallback"];

  for (const [mode, trace] of Object.entries(tracesByMode)) {
    if (!trace) {
      findings.push({
        severity: "error",
        code: "missing-mode-trace",
        message: `No trace recorded for contextMode '${mode}'`
      });
      continue;
    }
    if (trace.verdict !== expectedVerdict) {
      findings.push({
        severity: "error",
        code: "unexpected-verdict",
        message: `${mode}: expected verdict '${expectedVerdict}', got '${trace.verdict}'`
      });
    }
  }

  if (cliTrace && mcpTrace) {
    if (cliTrace.comparableFields.verdict !== mcpTrace.comparableFields.verdict) {
      findings.push({
        severity: "error",
        code: "cli-mcp-verdict-mismatch",
        message: "CLI and MCP modes must return the same verdict for the same fixture"
      });
    }
    if (cliTrace.comparableFields.phaseKey !== mcpTrace.comparableFields.phaseKey) {
      findings.push({
        severity: "error",
        code: "cli-mcp-phase-mismatch",
        message: "CLI and MCP modes must use the same phaseKey"
      });
    }
  }

  if (fallbackTrace && cliTrace) {
    if (fallbackTrace.verdict !== cliTrace.verdict) {
      findings.push({
        severity: "error",
        code: "fallback-cli-verdict-mismatch",
        message: "MCP fallback must match CLI verdict for the same fixture"
      });
    }
  }

  if (mcpTrace?.steps?.find((step) => step.kind === "mcp-orchestration")?.freshness == null) {
    findings.push({
      severity: "warn",
      code: "missing-mcp-freshness",
      message: "MCP orchestration should include freshness metadata when available"
    });
  }

  return {
    passed: findings.every((row) => row.severity !== "error"),
    findings
  };
}
