/** T100821 — workflow-cannon.planner-packet MCP read tool. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyPlannerPacketTruncationLadder,
  buildPlannerPacketFromReads,
  handleMcpRequest,
  invokePlannerPacket,
  listReadOnlyMcpTools,
  MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
  PLANNER_PACKET_TOOL_NAME,
  STATE_LIKE_MCP_TOOL_NAMES
} from "../dist/mcp/index.js";

test("planner-packet is registered in MCP tools/list with budget", async () => {
  const tools = listReadOnlyMcpTools();
  const tool = tools.find((row) => row.name === PLANNER_PACKET_TOOL_NAME);
  assert.ok(tool, "planner-packet tool is listed");
  assert.match(tool.description, /CLI fallback: pnpm exec wk run get-planner-flow-status/);
  assert.match(tool.description, /Common mistakes:/);

  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "planner-tools-list",
    method: "tools/list"
  });
  assert.ok(response?.result.tools.some((row) => row.name === PLANNER_PACKET_TOOL_NAME));
});

test("planner-packet is state-like per freshness policy", () => {
  assert.ok(STATE_LIKE_MCP_TOOL_NAMES.includes(PLANNER_PACKET_TOOL_NAME));
});

test("planner-packet orchestrates get-planner-flow-status and optional get-idea", async () => {
  const invocations = [];
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      invocations.push(invocation);
      if (invocation.name === "get-planner-flow-status") {
        return {
          ok: true,
          code: "planner-flow-status",
          message: "stage",
          data: {
            responseSchemaVersion: 1,
            goldenPathStage: "planning",
            ideaCount: 1,
            ideaId: "I001",
            planRef: "plan-artifact:abc",
            sessionStatus: "active",
            blockers: [],
            mismatches: [],
            recommendedNextCommand: {
              command: "planner-chat",
              rationale: "continue planning",
              readyRun: { args: { ideaId: "I001" }, argv: "workspace-kit run planner-chat '{\"ideaId\":\"I001\"}'" }
            },
            planningGeneration: 3,
            planningGenerationPolicy: "require"
          }
        };
      }
      if (invocation.name === "get-idea") {
        return {
          ok: true,
          code: "idea-retrieved",
          message: "idea",
          data: {
            responseSchemaVersion: 1,
            idea: { id: "I001", title: "Test idea", status: "open", sortOrder: 1 },
            ideaPlan: {
              status: "planning",
              agentDirective: { schemaVersion: 1, state: "planning", questions: [] },
              wbs: [
                { wbsId: "WBS-1", title: "One", dependsOn: [], sizingConfidence: "high" },
                { wbsId: "WBS-2", title: "Two", dependsOn: ["WBS-1"], sizingConfidence: "medium" }
              ]
            }
          }
        };
      }
      throw new Error(`unexpected invoke ${invocation.name}`);
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "planner-packet",
      method: "tools/call",
      params: {
        name: PLANNER_PACKET_TOOL_NAME,
        arguments: { ideaId: "I001" }
      }
    },
    { runtime }
  );

  assert.deepEqual(
    invocations.map((row) => row.name),
    ["get-planner-flow-status", "get-idea"]
  );
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.tool, PLANNER_PACKET_TOOL_NAME);
  assert.equal(envelope.result.code, "planner-packet");
  assert.equal(envelope.result.data.packetKind, "planner-bootstrap");
  assert.equal(envelope.result.data.idea.id, "I001");
  assert.equal(envelope.result.data.agentDirective.state, "planning");
  assert.equal(envelope.result.data.wbsPreview.length, 2);
  assert.equal(envelope.result.data.session.status, "active");
  assert.equal(envelope.result.data.recommendedNextCommand.command, "planner-chat");
  assert.ok(envelope.freshness, "state-like freshness metadata is present");
});

test("planner-packet returns first-run flow status without get-idea on empty inventory", async () => {
  const invocations = [];
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      invocations.push(invocation);
      return {
        ok: true,
        code: "planner-flow-status",
        message: "first run",
        data: {
          responseSchemaVersion: 1,
          goldenPathStage: "first_run",
          ideaCount: 0,
          blockers: [{ code: "ideas-inventory-empty", message: "No ideas", severity: "info" }],
          mismatches: [],
          recommendedNextCommand: {
            command: "create-idea",
            rationale: "capture an idea",
            readyRun: {
              args: { policyApproval: { confirmed: true, rationale: "<human-approved rationale>" } },
              argv: "workspace-kit run create-idea '{}'"
            }
          },
          planningGeneration: 1,
          planningGenerationPolicy: "require"
        }
      };
    }
  };

  const out = await invokePlannerPacket(runtime, {});
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].name, "get-planner-flow-status");
  assert.equal(out.ok, true);
  assert.equal(out.data.goldenPathStage, "first_run");
  assert.equal(out.data.idea, undefined);
  assert.equal(out.data.recommendedNextCommand.command, "create-idea");
});

test("planner-packet rejects malformed ideaId before runtime invocation", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      throw new Error("runtime should not be called");
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "planner-packet-bad-id",
      method: "tools/call",
      params: {
        name: PLANNER_PACKET_TOOL_NAME,
        arguments: { ideaId: "not-an-idea" }
      }
    },
    { runtime }
  );

  assert.equal(response?.error.code, -32602);
  assert.match(response?.error.message, /ideaId must be shaped like I001/);
});

test("planner-packet truncation ladder drops ideation transcript first", () => {
  const packet = {
    responseSchemaVersion: 1,
    recommendedNextCommand: { command: "planner-chat", rationale: "go", readyRun: { args: {}, argv: "x" } },
    ideationTranscript: [{ sessionId: "s1", ideationNotes: "x".repeat(30_000) }],
    wbsPreview: Array.from({ length: 5 }, (_, i) => ({
      wbsId: `WBS-${i + 1}`,
      title: `Row ${i + 1}`,
      dependsOn: [],
      sizingConfidence: "high"
    })),
    brainstormSynthesisScores: { priorityScore: 0.8 }
  };

  const { packet: trimmed, truncated, truncationSteps } = applyPlannerPacketTruncationLadder(packet, 4_000);

  assert.equal(truncated, true);
  assert.ok(truncationSteps.includes("drop-ideation-transcript"));
  assert.equal(trimmed.ideationTranscript, undefined);
  assert.ok(trimmed.recommendedNextCommand);
  assert.ok(Buffer.byteLength(JSON.stringify(trimmed), "utf8") <= 4_000);
});

test("buildPlannerPacketFromReads preserves flow errors", () => {
  const out = buildPlannerPacketFromReads({
    flowStatus: {
      ok: false,
      code: "idea-not-found",
      message: "missing"
    }
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "idea-not-found");
});

test("planner-packet integration read on sqlite workspace", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-planner-packet-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });

  const { createCommandRegistryRuntime } = await import("../dist/core/module-command-router.js");
  const { defaultRegistryModules } = await import("../dist/modules/index.js");
  const { resolveRegistryAndConfig } = await import("../dist/core/module-registry-resolve.js");
  const { resolveActorWithFallback } = await import("../dist/core/policy.js");

  const { registry, effective } = await resolveRegistryAndConfig(workspace, defaultRegistryModules, {});
  const actor = await resolveActorWithFallback(workspace, {}, process.env);
  const runtime = createCommandRegistryRuntime(registry, {
    ctx: {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: effective,
      resolvedActor: actor,
      moduleRegistry: registry
    }
  });

  const out = await invokePlannerPacket(runtime, {});
  assert.equal(out.ok, true);
  assert.equal(out.data.goldenPathStage, "first_run");
  assert.equal(out.data.recommendedNextCommand.command, "create-idea");
  assert.equal(typeof out.data.planningGeneration, "number");
  assert.ok(Buffer.byteLength(JSON.stringify(out.data), "utf8") <= MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET);
});
