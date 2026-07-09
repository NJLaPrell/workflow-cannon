/** T100830 — workflow-cannon.plan-review-packet MCP/handler envelope parity (WBS-28 / US-10). */
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
import { handleMcpRequest, MCP_ENVELOPE_SCHEMA_VERSION } from "../dist/mcp/index.js";

const PLAN_REVIEW_PACKET_TOOL_NAME = "workflow-cannon.plan-review-packet";
const COMMAND_NAME = "review-plan-artifact";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

const EXIT_CODES = {
  success: 0,
  validationFailure: 1,
  usageError: 2,
  internalError: 3
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-plan-review-packet-parity-"));
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
        policyApproval: { confirmed: true, rationale: "mcp-plan-review-packet-parity.test.mjs" }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(draft.ok, true, draft.message);
  return draft.data.planId;
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

async function invokeReviewPlanArtifact(runtime, args) {
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
  return normalizeReviewTimestamps(core);
}

function normalizeReviewTimestamps(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const clone = structuredClone(result);
  if (clone.data?.reviewRecord && typeof clone.data.reviewRecord === "object") {
    delete clone.data.reviewRecord.reviewedAt;
  }
  return clone;
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

async function runMcpPlanReviewPacket(workspacePath, args, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "plan-review-packet-parity",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: args
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(
    response?.error,
    undefined,
    `MCP error for ${PLAN_REVIEW_PACKET_TOOL_NAME}: ${JSON.stringify(response?.error)}`
  );
  return JSON.parse(response.result.content.at(0).text);
}

function assertEnvelopeMatchesHandler(envelope, handlerResult, args) {
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.tool, PLAN_REVIEW_PACKET_TOOL_NAME);
  assert.equal(envelope.command, COMMAND_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.deepEqual(envelope.args, args);
  assert.deepEqual(
    normalizeReviewTimestamps(envelope.result),
    normalizeReviewTimestamps(handlerResult),
    "MCP envelope.result matches handler field by field"
  );
}

test("invokeReviewPlanArtifact handler baseline is stable on shared runtime", async () => {
  const workspacePath = await tmpWorkspace();
  const planId = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, profile: "minimal" };
  const first = normalizeReviewTimestamps(await invokeReviewPlanArtifact(runtime, args));
  const second = normalizeReviewTimestamps(await invokeReviewPlanArtifact(runtime, args));
  assert.deepEqual(second, first);
});

test("MCP plan-review-packet envelope.result matches handler on isolated sqlite workspace", async () => {
  const workspacePath = await tmpWorkspace();
  const planId = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId, profile: "minimal" };
  const handlerResult = await invokeReviewPlanArtifact(runtime, args);
  const envelope = await runMcpPlanReviewPacket(workspacePath, args, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
  assert.equal(handlerResult.ok, true);
  assert.equal(handlerResult.code, "plan-artifact-review-complete");
  assert.equal(handlerResult.data.passed, true);
  assert.ok(envelope.freshness, "state-like freshness metadata is present on MCP envelope");
});

test("MCP plan-review-packet with injected shared runtime matches handler on repo workspace", async () => {
  const workspacePath = await tmpWorkspace();
  const planId = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId };
  const handlerResult = await invokeReviewPlanArtifact(runtime, args);
  const envelope = await runMcpPlanReviewPacket(workspacePath, args, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});

test("MCP plan-review-packet default runtime matches handler on repo workspace", async () => {
  const workspacePath = await tmpWorkspace();
  const planId = await seedPlanArtifact(workspacePath);
  const runtime = await createSharedRuntime(workspacePath);
  const args = { planId };
  const handlerResult = await invokeReviewPlanArtifact(runtime, args);
  const envelope = await runMcpPlanReviewPacket(workspacePath, args);

  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});

for (const { label, argsFactory } of [
  { label: "planId only", argsFactory: (planId) => ({ planId }) },
  { label: "minimal profile", argsFactory: (planId) => ({ planId, profile: "minimal" }) },
  {
    label: "version and profile",
    argsFactory: (planId) => ({ planId, version: 1, profile: "minimal" })
  }
]) {
  test(`MCP plan-review-packet matches CLI core result for ${label}`, async () => {
    const workspacePath = await tmpWorkspace();
    const planId = await seedPlanArtifact(workspacePath);
    const runtime = await createSharedRuntime(workspacePath);
    const args = argsFactory(planId);

    const viaCli = await runCliAdapter(workspacePath, args);
    const envelope = await runMcpPlanReviewPacket(workspacePath, args, runtime);

    assert.equal(envelope.tool, PLAN_REVIEW_PACKET_TOOL_NAME);
    assert.equal(envelope.command, COMMAND_NAME);
    assert.equal(envelope.mode, "read-only");
    assert.equal(envelope.mutationToolsEnabled, false);
    assert.ok(envelope.governance);
    assert.match(envelope.governance.note, /read-only through review-plan-artifact/i);
    assert.ok(envelope.freshness);
    assert.equal(typeof envelope.freshness.planningGeneration, "number");
    assert.deepEqual(normalizeReviewTimestamps(envelope.result), stripAdapterPresentation(viaCli));
  });
}

test("MCP plan-review-packet propagates handler errors without envelope drift", async () => {
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
        message: "Plan artifact not found"
      };
    }
  };

  const args = { planId: crypto.randomUUID() };
  const handlerResult = await invokeReviewPlanArtifact(runtime, args);
  const envelope = await runMcpPlanReviewPacket(process.cwd(), args, runtime);

  assert.equal(handlerResult.ok, false);
  assert.equal(handlerResult.code, "plan-artifact-not-found");
  assertEnvelopeMatchesHandler(envelope, handlerResult, args);
});
