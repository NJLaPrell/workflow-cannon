#!/usr/bin/env node
/**
 * Deterministic user simulation harness — packet-first Complete & Release scenarios
 * across CLI, MCP, and MCP-fallback context modes (Phase 132 + P134-T007).
 *
 * Usage:
 *   node scripts/agent-flow-harness.mjs [--dry-run] [--scenario <id>] [--persona <id>] [--mode cli|mcp|mcp-fallback]
 */
import { runUserSimulationScenario } from "../test/harness/user-simulation/lib/run-scenario.mjs";
import { listScenarioIds } from "../test/harness/user-simulation/lib/load-scenario.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    includeReport: false,
    scenarioId: "complete-release-completed-only",
    personaIds: null,
    contextModes: null
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--report") {
      options.includeReport = true;
    } else if (arg === "--list-scenarios") {
      options.listScenarios = true;
    } else if (arg === "--scenario" && argv[i + 1]) {
      options.scenarioId = argv[++i];
    } else if (arg === "--persona" && argv[i + 1]) {
      options.personaIds = options.personaIds ?? [];
      options.personaIds.push(argv[++i]);
    } else if (arg === "--mode" && argv[i + 1]) {
      options.contextModes = options.contextModes ?? [];
      options.contextModes.push(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`agent-flow-harness — user simulation for Complete & Release

Options:
  --scenario <id>     Scenario id (default: complete-release-completed-only)
  --persona <id>      Persona id (repeatable; default: scenario personaIds)
  --mode <mode>       cli | mcp | mcp-fallback (repeatable; default: scenario contextModes)
  --dry-run           Validate fixtures without invoking MCP/CLI simulation
  --report            Include simulationReport with dry-run improvement payloads
  --list-scenarios    Print available scenario ids
  -h, --help          Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  if (options.listScenarios) {
    console.log(JSON.stringify({ scenarios: listScenarioIds() }, null, 2));
    process.exit(0);
  }

  const report = await runUserSimulationScenario({
    scenarioId: options.scenarioId,
    personaIds: options.personaIds,
    contextModes: options.contextModes,
    dryRun: options.dryRun,
    includeReport: options.includeReport
  });

  const output = options.includeReport ? report : report;
  console.log(JSON.stringify(output, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
