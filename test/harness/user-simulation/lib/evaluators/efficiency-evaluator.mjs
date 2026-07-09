export function evaluateEfficiency({ scenario, trace }) {
  const findings = [];
  const avoidBroad = scenario.efficiency?.avoidBroadCommands ?? [];
  const maxBroadInMcp = scenario.efficiency?.mcpModeMaxBroadCommands ?? 0;
  const expectedCommands = scenario.efficiency?.expectedCommands?.[trace.contextMode];

  if (Array.isArray(expectedCommands)) {
    const actual = trace.commandsRun ?? [];
    const expectedKey = expectedCommands.join("|");
    const actualKey = actual.join("|");
    if (expectedKey !== actualKey) {
      findings.push({
        severity: "error",
        code: "command-sequence-mismatch",
        message: `Expected commands [${expectedCommands.join(", ")}], got [${actual.join(", ")}]`,
        evidence: { expected: expectedCommands, actual }
      });
    }
  }

  if (trace.usedBroadDiscoveryFallback) {
    findings.push({
      severity: "warn",
      code: "broad-discovery-fallback",
      message: "Harness recorded broad discovery fallback instead of packet-first orchestration",
      evidence: { commandsRun: trace.commandsRun ?? [] }
    });
  }
  if (trace.contextMode === "mcp") {
    const broadHits = (trace.commandsRun ?? []).filter((cmd) => avoidBroad.includes(cmd));
    if (broadHits.length > maxBroadInMcp) {
      findings.push({
        severity: "error",
        code: "broad-command-in-mcp-mode",
        message: `MCP mode ran broad commands: ${broadHits.join(", ")}`,
        broadHits
      });
    }
    if ((trace.runbookResourceReads ?? []).length > 0) {
      findings.push({
        severity: "error",
        code: "runbook-resource-in-mcp-mode",
        message: `MCP mode opened runbook resources: ${trace.runbookResourceReads.join(", ")}`
      });
    }
    const orchestrationOnly =
      (trace.mcpToolsCalled ?? []).includes("workflow-cannon.phase-release-orchestration-state") &&
      (trace.commandsRun ?? []).length === 0;
    if (!orchestrationOnly) {
      findings.push({
        severity: "warn",
        code: "mcp-mode-mixed-transport",
        message: "MCP mode should prefer MCP tools without parallel broad CLI discovery"
      });
    }
  }

  if (trace.contextMode === "mcp-fallback") {
    if (!trace.fallbackEvents.some((event) => event.code === "CLI_FALLBACK")) {
      findings.push({
        severity: "error",
        code: "missing-cli-fallback",
        message: "MCP fallback mode must record an explicit CLI_FALLBACK event"
      });
    }
    if (scenario.mcpFallback?.expectExplicitFallback && trace.fallbackEvents.length < 2) {
      findings.push({
        severity: "error",
        code: "fallback-not-explicit",
        message: "Scenario requires explicit MCP_UNAVAILABLE and CLI_FALLBACK events"
      });
    }
  }

  return {
    passed: findings.every((row) => row.severity !== "error"),
    findings,
    metrics: trace.metrics ?? null
  };
}
