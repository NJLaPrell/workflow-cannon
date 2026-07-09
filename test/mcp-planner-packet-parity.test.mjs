/** T100827 — workflow-cannon.planner-packet MCP/handler envelope parity (WBS-12 / US-10). */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCommandRegistryRuntime } from "../dist/core/module-command-router.js";
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { resolveActorWithFallback } from "../dist/core/policy.js";
import { defaultRegistryModules } from "../dist/modules/index.js";
import {
  handleMcpRequest,
  invokePlannerPacket,
  MCP_ENVELOPE_SCHEMA_VERSION,
  PLANNER_PACKET_TOOL_NAME
} from "../dist/mcp/index.js";

async function createSharedRuntime(workspacePath) {
  const { registry, effective } = await resolveRegistryAndConfig(
    workspacePath,
    defaultRegistryModules,
    {}
  );
  const actor = await resolveActorWithFallback(workspacePath, {}, process.env);
  return createCommandRegistryRuntime(registry, {
    ctx: {
      runtimeVersion: "0.1",
      workspacePath,
      effectiveConfig: effective,
      resolvedActor: actor,
      moduleRegistry: registry
    }
  });
}

async function runMcpPlannerPacket(workspacePath, args, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "planner-packet-parity",
      method: "tools/call",
      params: {
        name: PLANNER_PACKET_TOOL_NAME,
        arguments: args
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(
    response?.error,
    undefined,
    `MCP error for ${PLANNER_PACKET_TOOL_NAME}: ${JSON.stringify(response?.error)}`
  );
  return JSON.parse(response.result.content.at(0).text);
}

function normalizeJsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertEnvelopeMatchesHandler(envelope, handlerResult, args) {
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.tool, PLANNER_PACKET_TOOL_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.deepEqual(envelope.args, args);
  assert.deepEqual(
    envelope.result,
    normalizeJsonRoundTrip(handlerResult),
    "MCP envelope.result matches handler field by field"
  );
}

test("invokePlannerPacket handler baseline is stable on shared runtime", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const first = await invokePlannerPacket(runtime, {});
  const second = await invokePlannerPacket(runtime, {});
  assert.deepEqual(second, first);
});

test("MCP planner-packet envelope.result matches handler on empty inventory workspace", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "mcp-planner-packet-parity-"));
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });

  const runtime = await createSharedRuntime(workspacePath);
  const handlerResult = await invokePlannerPacket(runtime, {});
  const envelope = await runMcpPlannerPacket(workspacePath, {}, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, {});
  assert.equal(handlerResult.ok, true);
  assert.equal(handlerResult.data.goldenPathStage, "first_run");
});

test("MCP planner-packet with injected shared runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const handlerResult = await invokePlannerPacket(runtime, {});
  const envelope = await runMcpPlannerPacket(workspacePath, {}, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, {});
});

test("MCP planner-packet default runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const handlerResult = await invokePlannerPacket(runtime, {});
  const envelope = await runMcpPlannerPacket(workspacePath, {});

  assertEnvelopeMatchesHandler(envelope, handlerResult, {});
});

test("MCP planner-packet envelope.result matches handler for orchestrated idea packet", async () => {
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
              readyRun: {
                args: { ideaId: "I001" },
                argv: "workspace-kit run planner-chat '{\"ideaId\":\"I001\"}'"
              }
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
            idea: { id: "I001", title: "Parity idea", status: "open", sortOrder: 1 },
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

  const args = { ideaId: "I001" };
  const handlerResult = await invokePlannerPacket(runtime, args);
  assert.deepEqual(
    invocations.map((row) => row.name),
    ["get-planner-flow-status", "get-idea"]
  );

  invocations.length = 0;
  const envelope = await runMcpPlannerPacket(process.cwd(), args, runtime);
  assert.deepEqual(
    invocations.map((row) => row.name),
    ["get-planner-flow-status", "get-idea"]
  );

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
  assert.equal(handlerResult.data.packetKind, "planner-bootstrap");
  assert.equal(handlerResult.data.idea.id, "I001");
  assert.ok(envelope.freshness, "state-like freshness metadata is present on MCP envelope");
});

test("MCP planner-packet propagates handler errors without envelope drift", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      return {
        ok: false,
        code: "idea-not-found",
        message: "missing idea"
      };
    }
  };

  const args = { ideaId: "I999" };
  const handlerResult = await invokePlannerPacket(runtime, args);
  const envelope = await runMcpPlannerPacket(process.cwd(), args, runtime);

  assert.equal(handlerResult.ok, false);
  assert.equal(handlerResult.code, "idea-not-found");
  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});
