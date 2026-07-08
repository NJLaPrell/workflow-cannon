/** T100829 — workflow-cannon.get-plan-artifact MCP/handler envelope parity (WBS-27 / US-10). */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { handleRunCommand } from "../dist/cli/run-command.js";
import { createCommandRegistryRuntime } from "../dist/core/module-command-router.js";
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { resolveActorWithFallback } from "../dist/core/policy.js";
import { planningModule } from "../dist/index.js";
import { defaultRegistryModules } from "../dist/modules/index.js";
import {
  handleMcpRequest,
  MCP_ENVELOPE_SCHEMA_VERSION
} from "../dist/mcp/index.js";

const GET_PLAN_ARTIFACT_TOOL_NAME = "workflow-cannon.get-plan-artifact";
const COMMAND_NAME = "get-plan-artifact";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");

const EXIT_CODES = {
  success: 0,
  validationFailure: 1,
  usageError: 2,
  internalError: 3
};

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshDraftArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-get-plan-artifact-parity-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function planningCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

async function seedPlanArtifact(workspace) {
  const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
  const draft = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "mcp-get-plan-artifact-parity.test.mjs" }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(draft.ok, true, draft.message);
  return { planId: draft.data.planId, artifact };
}

async function createSharedRuntime(workspacePath) {
  const { registry, effective } = await resolveRegistryAndConfig(workspacePath, defaultRegistryModules, {});
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

async function invokeGetPlanArtifact(runtime, args) {
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

async function runMcpGetPlanArtifact(workspacePath, args, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "get-plan-artifact-parity",
      method: "tools/call",
      params: {
        name: GET_PLAN_ARTIFACT_TOOL_NAME,
        arguments: args
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(
    response?.error,
    undefined,
    `MCP error for ${GET_PLAN_ARTIFACT_TOOL_NAME}: ${JSON.stringify(response?.error)}`
  );
  return JSON.parse(response.result.content.at(0).text);
}

function assertEnvelopeMatchesHandler(envelope, handlerResult, args) {
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.tool, GET_PLAN_ARTIFACT_TOOL_NAME);
  assert.equal(envelope.command, COMMAND_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.deepEqual(envelope.args, args);
  assert.deepEqual(envelope.result, handlerResult, "MCP envelope.result matches handler field by field");
}

test("invokeGetPlanArtifact handler baseline is stable on shared runtime", async () => {
  const workspacePath = await tmpWorkspace();
  const { planId } = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, includeArtifact: false };
  const first = await invokeGetPlanArtifact(runtime, args);
  const second = await invokeGetPlanArtifact(runtime, args);
  assert.deepEqual(second, first);
});

test("MCP get-plan-artifact envelope.result matches handler on isolated sqlite workspace", async () => {
  const workspacePath = await tmpWorkspace();
  const { planId } = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, includeArtifact: false };
  const handlerResult = await invokeGetPlanArtifact(runtime, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
  assert.equal(handlerResult.ok, true);
  assert.equal(handlerResult.code, "plan-artifact-retrieved");
  assert.equal(handlerResult.data.planId, planId);
  assert.equal(handlerResult.data.artifact, undefined);
  assert.ok(envelope.freshness, "state-like freshness metadata is present on MCP envelope");
});

test("MCP get-plan-artifact with injected shared runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId: crypto.randomUUID() };
  const handlerResult = await invokeGetPlanArtifact(runtime, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});

test("MCP get-plan-artifact default runtime matches handler on repo workspace", async () => {
  const workspacePath = process.cwd();
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId: crypto.randomUUID() };
  const handlerResult = await invokeGetPlanArtifact(runtime, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});

test("MCP get-plan-artifact matches CLI core result for planId only", async () => {
  const workspacePath = await tmpWorkspace();
  const { planId } = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId };

  const viaCli = await runCliAdapter(workspacePath, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args, runtime);

  assert.equal(envelope.tool, GET_PLAN_ARTIFACT_TOOL_NAME);
  assert.equal(envelope.command, COMMAND_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.equal(envelope.mutationToolsEnabled, false);
  assert.ok(envelope.governance);
  assert.match(envelope.governance.note, /read-only through get-plan-artifact/i);
  assert.ok(envelope.freshness);
  assert.equal(typeof envelope.freshness.planningGeneration, "number");
  assert.deepEqual(envelope.result, stripAdapterPresentation(viaCli));
});

test("MCP get-plan-artifact matches CLI core result for includeArtifact false", async () => {
  const workspacePath = await tmpWorkspace();
  const { planId } = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, includeArtifact: false };

  const viaCli = await runCliAdapter(workspacePath, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args, runtime);

  assert.deepEqual(envelope.result, stripAdapterPresentation(viaCli));
  assert.equal(envelope.result.data.artifact, undefined);
});

test("MCP get-plan-artifact matches CLI core result for explicit version", async () => {
  const workspacePath = await tmpWorkspace();
  const { planId } = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, version: 1, includeArtifact: true };

  const viaCli = await runCliAdapter(workspacePath, args);
  const envelope = await runMcpGetPlanArtifact(workspacePath, args, runtime);

  assert.deepEqual(envelope.result, stripAdapterPresentation(viaCli));
  assert.equal(envelope.result.data.version, 1);
  assert.ok(envelope.result.data.artifact);
});

test("MCP get-plan-artifact propagates handler errors without envelope drift", async () => {
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
        code: "plan-artifact-not-found",
        message: "PlanArtifact missing",
        data: { schemaVersion: 1, responseSchemaVersion: 1, planId: "00000000-0000-4000-8000-000000000099" }
      };
    }
  };

  const args = { planId: "00000000-0000-4000-8000-000000000099" };
  const handlerResult = await invokeGetPlanArtifact(runtime, args);
  const envelope = await runMcpGetPlanArtifact(process.cwd(), args, runtime);

  assert.equal(handlerResult.ok, false);
  assert.equal(handlerResult.code, "plan-artifact-not-found");
  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});
