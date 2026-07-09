/** T100825 — workflow-cannon.finalize-preview-packet MCP read tool. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  handleMcpRequest,
  listReadOnlyMcpTools,
  MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  STATE_LIKE_MCP_TOOL_NAMES
} from "../dist/mcp/index.js";
import { planningModule } from "../dist/index.js";

const FINALIZE_PREVIEW_PACKET_TOOL_NAME = "workflow-cannon.finalize-preview-packet";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
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

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-finalize-preview-packet-"));
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
        policyApproval: { confirmed: true, rationale: "mcp-finalize-preview-packet.test.mjs" }
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
        policyApproval: { confirmed: true, rationale: "mcp-finalize-preview-packet.test.mjs" }
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
        policyApproval: { confirmed: true, rationale: "mcp-finalize-preview-packet.test.mjs" }
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
  await acceptPlan(
    workspace,
    draft.data.planId,
    artifact,
    reviewed.data.planningGeneration ?? 0,
    reviewed.data.version
  );
  return { workspace, artifact, draft };
}

test("finalize-preview-packet is registered in MCP tools/list with budget", async () => {
  const tools = listReadOnlyMcpTools();
  const tool = tools.find((row) => row.name === FINALIZE_PREVIEW_PACKET_TOOL_NAME);
  assert.ok(tool, "finalize-preview-packet tool is listed");
  assert.match(tool.description, /CLI fallback: pnpm exec wk run finalize-plan-to-phase/);
  assert.match(tool.description, /Common mistakes:/);

  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "finalize-preview-packet-tools-list",
    method: "tools/list"
  });
  assert.ok(response?.result.tools.some((row) => row.name === FINALIZE_PREVIEW_PACKET_TOOL_NAME));
});

test("finalize-preview-packet is state-like per freshness policy", () => {
  assert.ok(STATE_LIKE_MCP_TOOL_NAMES.includes(FINALIZE_PREVIEW_PACKET_TOOL_NAME));
});

test("finalize-preview-packet invokes finalize-plan-to-phase CLI with dryRun true and optional flags", async () => {
  const planId = crypto.randomUUID();
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
        code: "plan-artifact-finalize-preview",
        message: "Finalize preview ready",
        data: {
          phaseKey: "110",
          taskPreview: [{ id: "T001", title: "Demo task" }],
          review: { passed: true, blockers: [], warnings: [] }
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-call",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: {
          planId,
          version: 1,
          targetPhaseKey: "110",
          targetPhase: "Phase 110",
          desiredStatus: "ready",
          wbsFilter: ["WBS-1"]
        }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "finalize-plan-to-phase",
      args: {
        planId,
        dryRun: true,
        version: 1,
        targetPhaseKey: "110",
        targetPhase: "Phase 110",
        desiredStatus: "ready",
        wbsFilter: ["WBS-1"]
      }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.tool, FINALIZE_PREVIEW_PACKET_TOOL_NAME);
  assert.equal(envelope.command, "finalize-plan-to-phase");
  assert.equal(envelope.result.code, "plan-artifact-finalize-preview");
  assert.equal(envelope.result.data.review.passed, true);
  assert.ok(envelope.freshness);
  assert.match(envelope.governance.note, /read-only through finalize-plan-to-phase/i);
  assert.ok(
    envelope.governance.sourceRefs.includes(
      "src/modules/planning/instructions/finalize-plan-to-phase.md"
    )
  );
});

test("finalize-preview-packet forwards planId with forced dryRun when optional flags omitted", async () => {
  const planId = crypto.randomUUID();
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
        code: "plan-artifact-finalize-preview",
        data: { taskPreview: [], review: { passed: true } }
      };
    }
  };

  await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-minimal",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: { planId }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [{ name: "finalize-plan-to-phase", args: { planId, dryRun: true } }]);
});

test("finalize-preview-packet rejects missing planId before runtime invocation", async () => {
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
      return { ok: true, code: "plan-artifact-finalize-preview", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-bad-args",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: {}
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /planId is required/i);
});

test("finalize-preview-packet rejects dryRun false through MCP", async () => {
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
      return { ok: true, code: "plan-artifact-finalize-persisted", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-dry-run-false",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: { planId: crypto.randomUUID(), dryRun: false }
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /dryRun:false is not supported through MCP/i);
});

test("finalize-preview-packet rejects policyApproval through MCP", async () => {
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
      return { ok: true, code: "plan-artifact-finalize-preview", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "finalize-preview-packet-policy",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: {
          planId: crypto.randomUUID(),
          policyApproval: { confirmed: true, rationale: "nope" }
        }
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /policyApproval is not supported through MCP/i);
});

test("finalize-preview-packet integration read on sqlite workspace", async () => {
  const { workspace, artifact, draft } = await prepareAcceptedFullFeatureArtifact();

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
      id: "finalize-preview-packet-integration",
      method: "tools/call",
      params: {
        name: FINALIZE_PREVIEW_PACKET_TOOL_NAME,
        arguments: {
          planId: draft.data.planId,
          targetPhaseKey: "110",
          targetPhase: "Phase 110",
          desiredStatus: "ready"
        }
      }
    },
    { runtime, workspaceRoot: workspace, workspaceTrusted: true }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.result.ok, true);
  assert.equal(envelope.result.code, "plan-artifact-finalize-preview");
  assert.equal(envelope.result.data.phaseKey, "110");
  assert.ok(Array.isArray(envelope.result.data.taskPreview));
  assert.equal(envelope.result.data.taskPreview.length, artifact.wbs.length);
  assert.equal(envelope.result.data.review.passed, true);
  assert.ok(Buffer.byteLength(JSON.stringify(envelope.result.data), "utf8") <= MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET);
});
