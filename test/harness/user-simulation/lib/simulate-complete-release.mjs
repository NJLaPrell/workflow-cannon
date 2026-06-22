import {
  buildPhaseReleaseOrchestrationState,
  classifyPhaseReleasePath
} from "../../../../dist/modules/task-engine/phase-release-orchestration-state-runtime.js";
import { handleMcpRequest } from "../../../../dist/mcp/index.js";

const ORCHESTRATION_TOOL = "workflow-cannon.phase-release-orchestration-state";
const AGENT_START_TOOL = "workflow-cannon.agent_start";

function taskRow(fixtureTask, phaseKey) {
  const now = "2026-06-06T00:00:00.000Z";
  return {
    id: fixtureTask.id,
    status: fixtureTask.status,
    type: "execution",
    title: fixtureTask.title ?? `Task ${fixtureTask.id}`,
    createdAt: now,
    updatedAt: now,
    archived: false,
    phaseKey,
    dependsOn: fixtureTask.dependsOn ?? []
  };
}

function buildCliOrchestrationPacket(scenario) {
  const phaseKey = scenario.phaseKey;
  const tasks = scenario.fixture.tasks.map((row) => taskRow(row, phaseKey));
  const nonTerminalCount = tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length;
  const blockedCount = tasks.filter((t) => t.status === "blocked").length;
  const packet = buildPhaseReleaseOrchestrationState({
    workspacePath: process.cwd(),
    effectiveConfig: undefined,
    tasks,
    phaseKey,
    currentKitPhase: scenario.fixture.currentKitPhase ?? phaseKey,
    rolledOut: false
  });
  const verdict = classifyPhaseReleasePath({
    phaseKey,
    currentKitPhase: scenario.fixture.currentKitPhase ?? phaseKey,
    gitBranch: scenario.cliArgs?.integrationBranch ?? `release/phase-${phaseKey}`,
    releaseBranch: scenario.cliArgs?.integrationBranch ?? `release/phase-${phaseKey}`,
    blockedCount,
    nonTerminalCount,
    closeoutPassed: true,
    preflightViolationCount: 0,
    rolledOut: false
  });
  return { packet, verdict, tasks };
}

function createMcpRuntime(scenario) {
  const { packet, verdict } = buildCliOrchestrationPacket(scenario);
  return {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      if (invocation.name !== "phase-release-orchestration-state") {
        return { ok: false, code: "unknown-command", message: invocation.name };
      }
      return {
        ok: true,
        code: "phase-release-orchestration-state",
        message: "orchestration",
        data: {
          verdict,
          phaseKey: scenario.phaseKey,
          refs: packet.refs,
          readiness: packet.readiness,
          publishSafety: packet.publishSafety
        }
      };
    }
  };
}

async function callMcpTool(toolName, args, runtime, auditLog) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: `${toolName}-${auditLog.length}`,
      method: "tools/call",
      params: { name: toolName, arguments: args ?? {} }
    },
    { runtime, auditLog }
  );
  if (response?.error) {
    return { ok: false, error: response.error, content: null };
  }
  const text = response?.result?.content?.at(0)?.text;
  const payload = text ? JSON.parse(text) : null;
  return { ok: true, error: null, content: payload, raw: response?.result };
}

export async function simulateCompleteReleaseFlow({ scenario, contextMode }) {
  const trace = {
    contextMode,
    scenarioId: scenario.id,
    phaseKey: scenario.phaseKey,
    steps: [],
    commandsRun: [],
    mcpToolsCalled: [],
    runbookResourceReads: [],
    fallbackEvents: [],
    verdict: null,
    comparableFields: {}
  };

  const auditLog = [];
  const runtime = createMcpRuntime(scenario);

  if (contextMode === "cli") {
    const { packet, verdict } = buildCliOrchestrationPacket(scenario);
    trace.commandsRun.push("phase-release-orchestration-state");
    trace.steps.push({
      kind: "cli-orchestration",
      command: "phase-release-orchestration-state",
      verdict,
      hasRefs: Array.isArray(packet.refs?.commands) && packet.refs.commands.length > 0
    });
    trace.verdict = verdict;
    trace.comparableFields = {
      verdict,
      phaseKey: scenario.phaseKey,
      hasCommandRefs: trace.steps.at(0).hasRefs
    };
    return trace;
  }

  if (contextMode === "mcp-fallback") {
    trace.fallbackEvents.push({
      code: "MCP_UNAVAILABLE",
      reason: scenario.mcpFallback?.trigger ?? "mcp-unavailable",
      at: "bootstrap"
    });
    const agentStart = await callMcpTool(AGENT_START_TOOL, {}, runtime, auditLog);
    trace.mcpToolsCalled.push(AGENT_START_TOOL);
    const cliFallback =
      agentStart.content?.cliFallback?.command ??
      agentStart.content?.workflowRecommendations?.find((row) => row.workflowId === "complete-and-release")
        ?.recommendedCliCommand;
    trace.steps.push({ kind: "mcp-bootstrap-before-fallback", tool: AGENT_START_TOOL, cliFallback });
    const { packet, verdict } = buildCliOrchestrationPacket(scenario);
    trace.commandsRun.push("phase-release-orchestration-state");
    trace.fallbackEvents.push({
      code: "CLI_FALLBACK",
      reason: "mcp-unavailable",
      cliCommand: cliFallback ?? "phase-release-orchestration-state"
    });
    trace.steps.push({
      kind: "cli-fallback-orchestration",
      command: "phase-release-orchestration-state",
      verdict,
      hasRefs: Array.isArray(packet.refs?.commands) && packet.refs.commands.length > 0
    });
    trace.verdict = verdict;
    trace.comparableFields = {
      verdict,
      phaseKey: scenario.phaseKey,
      hasCommandRefs: trace.steps.at(-1).hasRefs,
      explicitFallback: trace.fallbackEvents.length >= 2
    };
    return trace;
  }

  if (contextMode === "mcp") {
    const agentStart = await callMcpTool(AGENT_START_TOOL, {}, runtime, auditLog);
    trace.mcpToolsCalled.push(AGENT_START_TOOL);
    const completeRelease = agentStart.content?.workflowRecommendations?.find(
      (row) => row.workflowId === "complete-and-release"
    );
    trace.steps.push({
      kind: "mcp-bootstrap",
      tool: AGENT_START_TOOL,
      recommendedMcpTool: completeRelease?.recommendedMcpTool ?? null,
      recommendedCliCommand: completeRelease?.recommendedCliCommand ?? null
    });

    const orchestration = await callMcpTool(
      ORCHESTRATION_TOOL,
      { phaseKey: scenario.phaseKey },
      runtime,
      auditLog
    );
    trace.mcpToolsCalled.push(ORCHESTRATION_TOOL);
    const verdict = orchestration.content?.result?.data?.verdict ?? orchestration.content?.data?.verdict;
    const refs = orchestration.content?.result?.data?.refs;
    trace.steps.push({
      kind: "mcp-orchestration",
      tool: ORCHESTRATION_TOOL,
      verdict,
      hasRefs: Array.isArray(refs?.commands) && refs.commands.length > 0,
      freshness: orchestration.content?.freshness ?? null
    });
    trace.verdict = verdict;
    trace.comparableFields = {
      verdict,
      phaseKey: scenario.phaseKey,
      recommendedMcpTool: completeRelease?.recommendedMcpTool,
      hasFreshness: Boolean(trace.steps.at(-1).freshness)
    };
    return trace;
  }

  throw new Error(`Unsupported contextMode: ${contextMode}`);
}

export { buildCliOrchestrationPacket, ORCHESTRATION_TOOL, AGENT_START_TOOL };
