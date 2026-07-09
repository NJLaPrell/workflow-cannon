/** T100831 — workflow-cannon.finalize-preview-packet MCP/handler envelope parity (WBS-29 / US-10). */
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
import { handleMcpRequest, MCP_ENVELOPE_SCHEMA_VERSION } from "../dist/mcp/index.js";

const FINALIZE_PREVIEW_PACKET_TOOL_NAME = "workflow-cannon.finalize-preview-packet";
const COMMAND_NAME = "finalize-plan-to-phase";
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

function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

function approvalFor(artifact, version = 1) {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-05-27T08:00:00.000Z",
    approvedBy: "operator@example.com",
    planRef: artifact.planRef
  };
}

function enrichWbsForBatchReview(artifact) {
  const tail =
    "rollback activation toggle empty first-run unit test verification coverage";
  for (const row of artifact.wbs) {
    row.generatedTaskPayload.technicalScope.push(tail);
    row.generatedTaskPayload.acceptanceCriteria.push(
      "Observable verification with rollback and empty first-run behavior"
    );
  }
}

function expandMcpArgs(mcpArgs) {
  return {
    planId: mcpArgs.planId,
    dryRun: true,
    ...(typeof mcpArgs.version === "number" ? { version: mcpArgs.version } : {}),
    ...(typeof mcpArgs.targetPhaseKey === "string" ? { targetPhaseKey: mcpArgs.targetPhaseKey } : {}),
    ...(typeof mcpArgs.targetPhase === "string" ? { targetPhase: mcpArgs.targetPhase } : {}),
    ...(typeof mcpArgs.desiredStatus === "string" ? { desiredStatus: mcpArgs.desiredStatus } : {}),
    ...(Array.isArray(mcpArgs.wbsFilter) ? { wbsFilter: mcpArgs.wbsFilter } : {})
  };
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-finalize-preview-packet-parity-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function planningCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

async function draftPersist(workspace, artifact) {
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: {
          confirmed: true,
          rationale: "mcp-finalize-preview-packet-parity.test.mjs"
        }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function reviewPlan(workspace, planId, planningGeneration) {
  const result = await planningModule.onCommand(
    {
      name: "review-plan-artifact",
      args: {
        planId,
        profile: "full-feature",
        recordReview: true,
        expectedPlanningGeneration: planningGeneration,
        policyApproval: {
          confirmed: true,
          rationale: "mcp-finalize-preview-packet-parity.test.mjs"
        }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function acceptPlan(workspace, planId, artifact, planningGeneration, approvedVersion) {
  const result = await planningModule.onCommand(
    {
      name: "accept-plan-artifact",
      args: {
        planId,
        approvalRecord: approvalFor(artifact, approvedVersion),
        expectedPlanningGeneration: planningGeneration,
        policyApproval: {
          confirmed: true,
          rationale: "mcp-finalize-preview-packet-parity.test.mjs"
        }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function prepareAcceptedFullFeatureArtifact() {
  const workspace = await tmpWorkspace();
  const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
  artifact.openQuestions = [];
  artifact.provenance = { ...artifact.provenance, sourceIdeaId: "idea-planning-system" };
  enrichWbsForBatchReview(artifact);
  const draft = await draftPersist(workspace, artifact);
  const reviewed = await reviewPlan(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);
  const accepted = await acceptPlan(
    workspace,
    draft.data.planId,
    artifact,
    reviewed.data.planningGeneration ?? 0,
    reviewed.data.version
  );
  return { workspace, artifact, draft, latestVersion: accepted.data.version };
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

async function invokeFinalizePlanToPhase(runtime, args) {
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

function normalizeParityResult(result) {
  return JSON.parse(JSON.stringify(stripAdapterPresentation(result)));
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

async function runMcpFinalizePreviewPacket(workspacePath, mcpArgs, runtime) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-parity",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: mcpArgs
      }
    },
    runtime ? { workspacePath, runtime } : { workspacePath }
  );
  assert.equal(
    response?.error,
    undefined,
    `MCP error for ${FINALIZE_PREVIEW_PACKET_TOOL_NAME}: ${JSON.stringify(response?.error)}`
  );
  return JSON.parse(response.result.content.at(0).text);
}

function assertEnvelopeMatchesHandler(envelope, handlerResult, commandArgs) {
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.tool, FINALIZE_PREVIEW_PACKET_TOOL_NAME);
  assert.equal(envelope.command, COMMAND_NAME);
  assert.equal(envelope.mode, "read-only");
  assert.deepEqual(envelope.args, commandArgs);
  assert.deepEqual(
    normalizeParityResult(envelope.result),
    normalizeParityResult(handlerResult),
    "MCP envelope.result matches handler field by field"
  );
}

test("invokeFinalizePlanToPhase handler baseline is stable on shared runtime", async () => {
  const { workspace, draft } = await prepareAcceptedFullFeatureArtifact();
  const runtime = await createSharedRuntime(workspace);
  const commandArgs = expandMcpArgs({
    planId: draft.data.planId,
    targetPhaseKey: "110",
    targetPhase: "Phase 110",
    desiredStatus: "ready"
  });
  const first = normalizeParityResult(await invokeFinalizePlanToPhase(runtime, commandArgs));
  const second = normalizeParityResult(await invokeFinalizePlanToPhase(runtime, commandArgs));
  assert.deepEqual(second, first);
});

test("MCP finalize-preview-packet envelope.result matches handler on isolated sqlite workspace", async () => {
  const { workspace, artifact, draft } = await prepareAcceptedFullFeatureArtifact();
  const runtime = await createSharedRuntime(workspace);
  const mcpArgs = {
    planId: draft.data.planId,
    targetPhaseKey: "110",
    targetPhase: "Phase 110",
    desiredStatus: "ready"
  };
  const commandArgs = expandMcpArgs(mcpArgs);
  const handlerResult = await invokeFinalizePlanToPhase(runtime, commandArgs);
  const envelope = await runMcpFinalizePreviewPacket(workspace, mcpArgs, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, commandArgs);
  assert.equal(handlerResult.ok, true);
  assert.equal(handlerResult.code, "plan-artifact-finalize-preview");
  assert.equal(handlerResult.data.phaseKey, "110");
  assert.equal(handlerResult.data.taskPreview.length, artifact.wbs.length);
  assert.ok(envelope.freshness, "state-like freshness metadata is present on MCP envelope");
});

test("MCP finalize-preview-packet with injected shared runtime matches handler on repo workspace", async () => {
  const { workspace, draft } = await prepareAcceptedFullFeatureArtifact();
  const runtime = await createSharedRuntime(workspace);
  const mcpArgs = { planId: draft.data.planId };
  const commandArgs = expandMcpArgs(mcpArgs);
  const handlerResult = await invokeFinalizePlanToPhase(runtime, commandArgs);
  const envelope = await runMcpFinalizePreviewPacket(workspace, mcpArgs, runtime);

  assertEnvelopeMatchesHandler(envelope, handlerResult, commandArgs);
});

test("MCP finalize-preview-packet default runtime matches handler on repo workspace", async () => {
  const { workspace, draft } = await prepareAcceptedFullFeatureArtifact();
  const runtime = await createSharedRuntime(workspace);
  const mcpArgs = { planId: draft.data.planId };
  const commandArgs = expandMcpArgs(mcpArgs);
  const handlerResult = await invokeFinalizePlanToPhase(runtime, commandArgs);
  const envelope = await runMcpFinalizePreviewPacket(workspace, mcpArgs);

  assertEnvelopeMatchesHandler(envelope, handlerResult, commandArgs);
});

for (const { label, mcpArgsFactory } of [
  { label: "planId only", mcpArgsFactory: (planId) => ({ planId }) },
  {
    label: "phase overrides",
    mcpArgsFactory: (planId) => ({
      planId,
      targetPhaseKey: "110",
      targetPhase: "Phase 110",
      desiredStatus: "ready"
    })
  },
  {
    label: "version and wbsFilter",
    mcpArgsFactory: (planId, artifact, latestVersion) => ({
      planId,
      version: latestVersion,
      targetPhaseKey: "110",
      wbsFilter: [artifact.wbs[0].wbsId]
    })
  }
]) {
  test(`MCP finalize-preview-packet matches CLI core result for ${label}`, async () => {
    const { workspace, artifact, draft, latestVersion } = await prepareAcceptedFullFeatureArtifact();
    const runtime = await createSharedRuntime(workspace);
    const mcpArgs = mcpArgsFactory(draft.data.planId, artifact, latestVersion);
    const commandArgs = expandMcpArgs(mcpArgs);

    const viaCli = await runCliAdapter(workspace, commandArgs);
    const envelope = await runMcpFinalizePreviewPacket(workspace, mcpArgs, runtime);

    assert.equal(envelope.tool, FINALIZE_PREVIEW_PACKET_TOOL_NAME);
    assert.equal(envelope.command, COMMAND_NAME);
    assert.equal(envelope.mode, "read-only");
    assert.equal(envelope.mutationToolsEnabled, false);
    assert.ok(envelope.governance);
    assert.match(envelope.governance.note, /read-only through finalize-plan-to-phase/i);
    assert.ok(envelope.freshness);
    assert.equal(typeof envelope.freshness.planningGeneration, "number");
    assert.deepEqual(normalizeParityResult(envelope.result), normalizeParityResult(viaCli));
  });
}

test("MCP finalize-preview-packet propagates handler errors without envelope drift", async () => {
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
        message: "PlanArtifact not found"
      };
    }
  };

  const mcpArgs = { planId: crypto.randomUUID() };
  const commandArgs = expandMcpArgs(mcpArgs);
  const handlerResult = await invokeFinalizePlanToPhase(runtime, commandArgs);
  const envelope = await runMcpFinalizePreviewPacket(process.cwd(), mcpArgs, runtime);

  assert.equal(handlerResult.ok, false);
  assert.equal(handlerResult.code, "plan-artifact-not-found");
  assertEnvelopeMatchesHandler(envelope, handlerResult, commandArgs);
});
