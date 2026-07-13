/** T100828 — workflow-cannon.list-ideas MCP/handler envelope parity (WBS-26 / US-10). */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { handleRunCommand } from "../dist/cli/run-command.js";
import { createCommandRegistryRuntime } from "../dist/core/module-command-router.js";
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { resolveActorWithFallback } from "../dist/core/policy.js";
import { planningModule } from "../dist/index.js";
import { handleMcpRequest, MCP_ENVELOPE_SCHEMA_VERSION } from "../dist/mcp/index.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const LIST_IDEAS_TOOL_NAME = "workflow-cannon.list-ideas";
const COMMAND_NAME = "list-ideas";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

const EXIT_CODES = {
  success: 0,
  validationFailure: 1,
  usageError: 2,
  internalError: 3
};

const PARITY_CASES = [
  { label: "all ideas", args: {} },
  { label: "open status filter", args: { status: "open" } },
  { label: "planned status filter", args: { status: "planned" } }
];

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-list-ideas-parity-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return workspace;
}

function ideasCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

async function seedIdeas(workspace) {
  await planningModule.onCommand(
    { name: "create-idea", args: { title: "Planned idea", status: "planned" } },
    ideasCtx(workspace)
  );
  await planningModule.onCommand({ name: "create-idea", args: { title: "Open idea" } }, ideasCtx(workspace));
  await planningModule.onCommand(
    { name: "create-idea", args: { title: "Another open", status: "open" } },
    ideasCtx(workspace)
  );
}

async function createSharedRuntime(workspacePath) {
  const { registry, effective } = await resolveRegistryAndConfig(
    workspacePath,
    (await import("../dist/modules/index.js")).defaultRegistryModules,
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

async function invokeListIdeas(runtime, args) {
  return runtime.invoke({ name: COMMAND_NAME, args });
}

function stripAdapterPresentation(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const core = {
    ok: result.ok,
    code: result.code
  };
  if (typeof result.message === "string") {
    core.message = result.message;
  }
  if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    const { presentation, cae, ...data } = result.data;
    core.data = data;
  }
  return core;
}

function createCapture() {
  const lines = [];
  return {
    lines,
    writeLine(message) {
      lines.push(message);
    },
    writeError() {}
  };
}

async function runCliAdapter(workspacePath, args) {
  const capture = createCapture();
  const code = await handleRunCommand(
    workspacePath,
    ["run", COMMAND_NAME, JSON.stringify(args)],
    capture,
    EXIT_CODES
  );
  assert.equal(code, EXIT_CODES.success, `CLI adapter exit code for ${COMMAND_NAME}`);
  return JSON.parse(capture.lines.join(""));
}

async function runMcpListIdeas(workspacePath, args, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "list-ideas-parity",
      method: "tools/call",
      params: {
        name: LIST_IDEAS_TOOL_NAME,
        arguments: args
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(
    response?.error,
    undefined,
    `MCP error for ${LIST_IDEAS_TOOL_NAME}: ${JSON.stringify(response?.error)}`
  );
  return JSON.parse(response.result.content.at(0).text);
}

function assertEnvelopeMatchesHandler(envelope, handlerResult, args) {
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.tool, LIST_IDEAS_TOOL_NAME);
  assert.equal(envelope.command, COMMAND_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.deepEqual(envelope.args, args);
  assert.deepEqual(envelope.result, handlerResult, "MCP envelope.result matches handler field by field");
}

test("invokeListIdeas handler baseline is stable on shared runtime", async () => {
  const workspacePath = await tmpWorkspace();
  await seedIdeas(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const first = await invokeListIdeas(runtime, {});
  const second = await invokeListIdeas(runtime, {});
  assert.deepEqual(second, first);
});

test("MCP list-ideas envelope.result matches handler on isolated inventory workspace", async () => {
  const workspacePath = await tmpWorkspace();
  await seedIdeas(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { status: "open" };
  const handlerResult = await invokeListIdeas(runtime, args);
  const envelope = await runMcpListIdeas(workspacePath, args, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
  assert.equal(handlerResult.ok, true);
  assert.equal(handlerResult.code, "ideas-listed");
  assert.equal(handlerResult.data.count, 2);
  assert.ok(envelope.freshness, "state-like freshness metadata is present on MCP envelope");
});

test("MCP list-ideas with injected shared runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const handlerResult = await invokeListIdeas(runtime, {});
  const envelope = await runMcpListIdeas(workspacePath, {}, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, {});
});

test("MCP list-ideas default runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const handlerResult = await invokeListIdeas(runtime, {});
  const envelope = await runMcpListIdeas(workspacePath, {});

  assertEnvelopeMatchesHandler(envelope, handlerResult, {});
});

for (const parityCase of PARITY_CASES) {
  test(`MCP list-ideas matches CLI core result for ${parityCase.label}`, async () => {
    const workspacePath = await tmpWorkspace();
    await seedIdeas(workspacePath);
    const runtime = await createSharedRuntime(workspacePath);

    const viaCli = await runCliAdapter(workspacePath, parityCase.args);
    const envelope = await runMcpListIdeas(workspacePath, parityCase.args, runtime);

    assert.equal(envelope.tool, LIST_IDEAS_TOOL_NAME);
    assert.equal(envelope.command, COMMAND_NAME);
    assert.equal(envelope.mode, "read-only");
    assert.equal(envelope.mutationToolsEnabled, false);
    assert.ok(envelope.governance);
    assert.match(envelope.governance.note, /read-only through list-ideas/i);
    assert.ok(envelope.freshness);
    assert.equal(typeof envelope.freshness.planningGeneration, "number");
    assert.deepEqual(envelope.result, stripAdapterPresentation(viaCli));
  });
}

test("MCP list-ideas propagates handler errors without envelope drift", async () => {
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
        code: "invalid-args",
        message: "list-ideas status must be one of open | planning | planned"
      };
    }
  };

  const args = { status: "paused" };
  const handlerResult = await invokeListIdeas(runtime, args);
  const envelope = await runMcpListIdeas(process.cwd(), args, runtime);

  assert.equal(handlerResult.ok, false);
  assert.equal(handlerResult.code, "invalid-args");
  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});
