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
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["workflow-cannon.capabilities"]
  );
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
