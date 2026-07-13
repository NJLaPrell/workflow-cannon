/** T100822 — workflow-cannon.list-ideas MCP read tool. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  handleMcpRequest,
  listReadOnlyMcpTools,
  MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  STATE_LIKE_MCP_TOOL_NAMES
} from "../dist/mcp/index.js";
import { planningModule } from "../dist/index.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const LIST_IDEAS_TOOL_NAME = "workflow-cannon.list-ideas";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-list-ideas-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return workspace;
}

function ideasCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

test("list-ideas is registered in MCP tools/list with budget", async () => {
  const tools = listReadOnlyMcpTools();
  const tool = tools.find((row) => row.name === LIST_IDEAS_TOOL_NAME);
  assert.ok(tool, "list-ideas tool is listed");
  assert.match(tool.description, /CLI fallback: pnpm exec wk run list-ideas/);
  assert.match(tool.description, /Common mistakes:/);

  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "list-ideas-tools-list",
    method: "tools/list"
  });
  assert.ok(response?.result.tools.some((row) => row.name === LIST_IDEAS_TOOL_NAME));
});

test("list-ideas is state-like per freshness policy", () => {
  assert.ok(STATE_LIKE_MCP_TOOL_NAMES.includes(LIST_IDEAS_TOOL_NAME));
});

test("list-ideas invokes list-ideas CLI with optional status filter", async () => {
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
        code: "ideas-listed",
        message: "2 idea(s)",
        data: {
          responseSchemaVersion: 1,
          ideas: [
            { id: "I001", title: "First", status: "planned", sortOrder: 0 },
            { id: "I002", title: "Second", status: "open", sortOrder: 1 }
          ],
          count: 2,
          planningGeneration: 4,
          planningGenerationPolicy: "require"
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "list-ideas-call",
      method: "tools/call",
      params: {
        name: LIST_IDEAS_TOOL_NAME,
        arguments: { status: "open" }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [{ name: "list-ideas", args: { status: "open" } }]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.tool, LIST_IDEAS_TOOL_NAME);
  assert.equal(envelope.command, "list-ideas");
  assert.equal(envelope.result.code, "ideas-listed");
  assert.equal(envelope.result.data.count, 2);
  assert.equal(envelope.result.data.planningGeneration, 4);
  assert.ok(envelope.freshness);
  assert.equal(typeof envelope.freshness.planningGeneration, "number");
  assert.match(envelope.governance.note, /read-only through list-ideas/i);
  assert.ok(envelope.governance.sourceRefs.includes("src/modules/planning/instructions/list-ideas.md"));
});

test("list-ideas forwards empty args when status is omitted", async () => {
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
        code: "ideas-listed",
        message: "0 idea(s)",
        data: {
          responseSchemaVersion: 1,
          ideas: [],
          count: 0,
          planningGeneration: 1,
          planningGenerationPolicy: "require"
        }
      };
    }
  };

  await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "list-ideas-empty",
      method: "tools/call",
      params: {
        name: LIST_IDEAS_TOOL_NAME,
        arguments: {}
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [{ name: "list-ideas", args: {} }]);
});

test("list-ideas integration read on sqlite workspace", async () => {
  const workspace = await tmpWorkspace();
  await planningModule.onCommand({ name: "create-idea", args: { title: "Alpha", status: "planned" } }, ideasCtx(workspace));
  await planningModule.onCommand({ name: "create-idea", args: { title: "Beta" } }, ideasCtx(workspace));

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

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "list-ideas-integration",
      method: "tools/call",
      params: {
        name: LIST_IDEAS_TOOL_NAME,
        arguments: { status: "open" }
      }
    },
    { runtime, workspaceRoot: workspace, workspaceTrusted: true }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.result.ok, true);
  assert.equal(envelope.result.code, "ideas-listed");
  assert.deepEqual(
    envelope.result.data.ideas.map((idea) => idea.title),
    ["Beta"]
  );
  assert.equal(typeof envelope.result.data.planningGeneration, "number");
  assert.ok(Buffer.byteLength(JSON.stringify(envelope.result.data), "utf8") <= MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET);
});
