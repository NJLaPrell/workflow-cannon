import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { handleMcpRequest, listReadOnlyMcpTools } from "../dist/mcp/index.js";

test("MCP initialize advertises a minimal read-only server", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  });

  assert.equal(response?.jsonrpc, "2.0");
  assert.equal(response?.id, 1);
  assert.deepEqual(response?.result.capabilities, { tools: {} });
  assert.equal(response?.result.serverInfo.name, "workflow-cannon");
});

test("MCP tools/list exposes only the safe read-only tool", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "tools",
    method: "tools/list"
  });

  const tools = response?.result.tools;
  const toolNames = tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("workflow-cannon.capabilities"));
  assert.ok(toolNames.includes("workflow-cannon.agent-execution-packet"));
  assert.ok(toolNames.includes("workflow-cannon.phase-release-orchestration-state"));
  assert.deepEqual(tools, listReadOnlyMcpTools());
  assert.ok(!tools.some((tool) => /run-transition|update-task|complete-task/.test(tool.name)));
});

test("MCP tools/call reports mutation tools disabled", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "workflow-cannon.capabilities",
      arguments: {}
    }
  });

  assert.equal(response?.result.isError, false);
  const text = response?.result.content.at(0).text;
  assert.equal(JSON.parse(text).mutationToolsEnabled, false);
});

test("MCP read tools invoke equivalent command runtime with required phaseKey", async () => {
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
        code: "agent-execution-packet",
        message: "packet",
        data: {
          taskId: invocation.args.taskId,
          phaseKey: invocation.args.phaseKey
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "packet",
      method: "tools/call",
      params: {
        name: "workflow-cannon.agent-execution-packet",
        arguments: {
          mode: "draft",
          taskId: "T100711",
          phaseKey: "134"
        }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T100711",
        phaseKey: "134"
      }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.mode, "read-only");
  assert.equal(envelope.mutationToolsEnabled, false);
  assert.equal(envelope.command, "agent-execution-packet");
  assert.equal(envelope.result.data.phaseKey, "134");
});

test("MCP read tools reject missing required phaseKey before runtime invocation", async () => {
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
      id: "missing-phase",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-orchestration-state",
        arguments: {}
      }
    },
    { runtime }
  );

  assert.equal(response?.error.code, -32602);
  assert.equal(response?.error.message, "phaseKey is required");
});

test("MCP read tools enforce byte budget with expansion refs", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      return {
        ok: true,
        code: "phase-release-orchestration-state",
        message: "large",
        data: {
          blob: "x".repeat(2500)
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "large",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-orchestration-state",
        arguments: {
          phaseKey: "134"
        }
      }
    },
    { runtime, maxToolResponseBytes: 1000 }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.oversized, true);
  assert.equal(envelope.byteBudget, 1000);
  assert.equal(envelope.resultSummary.ok, true);
  assert.equal(
    envelope.expansionRefs.at(0).command,
    `pnpm exec wk run phase-release-orchestration-state '${JSON.stringify({ phaseKey: "134" })}'`
  );
});

test("MCP stdio CLI starts and answers initialize", async () => {
  const child = spawn(process.execPath, ["dist/mcp/cli.js"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: "start", method: "initialize", params: {} })}\n`
  );

  await waitFor(() => stdout.includes("\n"));
  child.stdin.end();
  await once(child, "exit");

  const response = JSON.parse(stdout.trim());
  assert.equal(response.id, "start");
  assert.equal(response.result.serverInfo.name, "workflow-cannon");
});

async function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
