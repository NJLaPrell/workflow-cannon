import assert from "node:assert/strict";
import test from "node:test";

import { createCommandRegistryRuntime } from "../dist/index.js";
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { resolveActorWithFallback } from "../dist/core/policy.js";
import { defaultRegistryModules } from "../dist/modules/index.js";
import { handleRunCommand } from "../dist/cli/run-command.js";
import { handleMcpRequest, MCP_ENVELOPE_SCHEMA_VERSION } from "../dist/mcp/index.js";

const EXIT_CODES = {
  success: 0,
  validationFailure: 1,
  usageError: 2,
  internalError: 3
};

/** Read-only commands with stable output across adapters (no policyApproval). */
const READ_ONLY_PARITY_CASES = [
  {
    label: "explain-config persistence backend",
    command: "explain-config",
    args: { path: "tasks.persistenceBackend" },
    mcpTool: null
  },
  {
    label: "explain-memory-precedence",
    command: "explain-memory-precedence",
    args: {},
    mcpTool: "workflow-cannon.memory-precedence",
    mcpArguments: {}
  },
  {
    label: "list-memory approved filter",
    command: "list-memory",
    args: { status: "approved" },
    mcpTool: "workflow-cannon.memory-list",
    mcpArguments: { status: "approved" }
  }
];

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

/** Strip CLI response-template / CAE adornments so core payload matches runtime.invoke. */
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
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

async function runCliAdapter(workspacePath, command, args) {
  const capture = createCapture();
  const code = await handleRunCommand(
    workspacePath,
    ["run", command, JSON.stringify(args)],
    capture,
    EXIT_CODES
  );
  assert.equal(code, EXIT_CODES.success, `CLI adapter exit code for ${command}`);
  return JSON.parse(capture.lines.join(""));
}

async function runMcpAdapter(workspacePath, mcpTool, mcpArguments, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: `parity-${mcpTool}`,
      method: "tools/call",
      params: {
        name: mcpTool,
        arguments: mcpArguments
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(response?.error, undefined, `MCP error for ${mcpTool}: ${JSON.stringify(response?.error)}`);
  const envelope = JSON.parse(response.result.content.at(0).text);
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  return envelope;
}

/**
 * Dashboard CommandClient ultimately shells `workspace-kit run <cmd> <json>` and parses stdout.
 * This exercises the same JSON contract without the extension compile graph.
 */
async function runDashboardShapedExec(workspacePath, command, args) {
  const capture = createCapture();
  const code = await handleRunCommand(
    workspacePath,
    ["run", command, JSON.stringify(args)],
    capture,
    EXIT_CODES
  );
  assert.equal(code, EXIT_CODES.success, `dashboard-shaped exec exit for ${command}`);
  return JSON.parse(capture.lines.join(""));
}

test("shared CommandRegistryRuntime baseline is stable for parity fixtures", async () => {
  const runtime = await createSharedRuntime(process.cwd());
  const invocation = {
    name: "explain-config",
    args: { path: "tasks.persistenceBackend" }
  };
  const first = await runtime.invoke(invocation);
  const second = await runtime.invoke(invocation);
  assert.deepEqual(second, first);
});

test("CLI handleRunCommand invokes shared runtime by default", async () => {
  let invokeCount = 0;
  const workspacePath = process.cwd();
  const capture = createCapture();
  const code = await handleRunCommand(
    workspacePath,
    ["run", "explain-config", '{"path":"tasks.persistenceBackend"}'],
    capture,
    EXIT_CODES,
    {
      createRuntime: (registry, options) => {
        const runtime = createCommandRegistryRuntime(registry, options);
        return {
          listCommands: () => runtime.listCommands(),
          describeCommand: (name) => runtime.describeCommand(name),
          invoke: async (invocation) => {
            invokeCount += 1;
            assert.equal(invocation.name, "explain-config");
            return runtime.invoke(invocation);
          }
        };
      }
    }
  );

  assert.equal(code, EXIT_CODES.success);
  assert.equal(invokeCount, 1);
  const output = JSON.parse(capture.lines.join(""));
  assert.equal(output.ok, true);
  assert.equal(output.code, "config-explained");
});

for (const parityCase of READ_ONLY_PARITY_CASES) {
  test(`CLI adapter matches shared runtime for ${parityCase.label}`, async () => {
    const workspacePath = process.cwd();
    const runtime = await createSharedRuntime(workspacePath);
    const viaRuntime = await runtime.invoke({
      name: parityCase.command,
      args: parityCase.args
    });
    const viaCli = await runCliAdapter(workspacePath, parityCase.command, parityCase.args);
    assert.deepEqual(stripAdapterPresentation(viaCli), viaRuntime);
  });

  if (!parityCase.mcpTool) {
    continue;
  }

  test(`MCP adapter uses shared runtime.invoke for ${parityCase.label}`, async () => {
    const workspacePath = process.cwd();
    const runtime = await createSharedRuntime(workspacePath);
    const viaRuntime = await runtime.invoke({
      name: parityCase.command,
      args: parityCase.args
    });
    const envelope = await runMcpAdapter(
      workspacePath,
      parityCase.mcpTool,
      parityCase.mcpArguments,
      runtime
    );
    assert.equal(envelope.command, parityCase.command);
    assert.deepEqual(envelope.result, viaRuntime);
  });

  test(`MCP default runtime matches CLI core result for ${parityCase.label}`, async () => {
    const workspacePath = process.cwd();
    const viaCli = await runCliAdapter(workspacePath, parityCase.command, parityCase.args);
    const envelope = await runMcpAdapter(
      workspacePath,
      parityCase.mcpTool,
      parityCase.mcpArguments
    );
    assert.equal(envelope.command, parityCase.command);
    assert.deepEqual(envelope.result, stripAdapterPresentation(viaCli));
  });

  test(`dashboard-shaped CLI exec matches shared runtime for ${parityCase.label}`, async () => {
    const workspacePath = process.cwd();
    const runtime = await createSharedRuntime(workspacePath);
    const viaRuntime = await runtime.invoke({
      name: parityCase.command,
      args: parityCase.args
    });
    const viaDashboard = await runDashboardShapedExec(
      workspacePath,
      parityCase.command,
      parityCase.args
    );
    assert.deepEqual(stripAdapterPresentation(viaDashboard), viaRuntime);
  });
}
