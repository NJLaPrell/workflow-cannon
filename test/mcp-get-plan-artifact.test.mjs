/** T100823 — workflow-cannon.get-plan-artifact MCP read tool. */
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

const GET_PLAN_ARTIFACT_TOOL_NAME = "workflow-cannon.get-plan-artifact";
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-get-plan-artifact-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function planningCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

test("get-plan-artifact is registered in MCP tools/list with budget", async () => {
  const tools = listReadOnlyMcpTools();
  const tool = tools.find((row) => row.name === GET_PLAN_ARTIFACT_TOOL_NAME);
  assert.ok(tool, "get-plan-artifact tool is listed");
  assert.match(tool.description, /CLI fallback: pnpm exec wk run get-plan-artifact/);
  assert.match(tool.description, /Common mistakes:/);

  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "get-plan-artifact-tools-list",
    method: "tools/list"
  });
  assert.ok(response?.result.tools.some((row) => row.name === GET_PLAN_ARTIFACT_TOOL_NAME));
});

test("get-plan-artifact is state-like per freshness policy", () => {
  assert.ok(STATE_LIKE_MCP_TOOL_NAMES.includes(GET_PLAN_ARTIFACT_TOOL_NAME));
});

test("get-plan-artifact invokes get-plan-artifact CLI with planId and optional flags", async () => {
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
        code: "plan-artifact-retrieved",
        message: `PlanArtifact ${planId} version 1 retrieved`,
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: 1,
          latestVersion: 1,
          planRef: `plan-artifact:${planId}`,
          status: "draft",
          immutable: false,
          versions: [{ version: 1, immutable: false }],
          lineage: { sourceIdeaId: "I001" },
          artifact: { planId, version: 1, identity: { title: "Demo" } }
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "get-plan-artifact-call",
      method: "tools/call",
      params: {
        name: GET_PLAN_ARTIFACT_TOOL_NAME,
        arguments: { planId, version: 1, includeArtifact: true }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "get-plan-artifact",
      args: { planId, version: 1, includeArtifact: true }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.tool, GET_PLAN_ARTIFACT_TOOL_NAME);
  assert.equal(envelope.command, "get-plan-artifact");
  assert.equal(envelope.result.code, "plan-artifact-retrieved");
  assert.equal(envelope.result.data.planId, planId);
  assert.ok(envelope.freshness);
  assert.match(envelope.governance.note, /read-only through get-plan-artifact/i);
  assert.ok(
    envelope.governance.sourceRefs.includes("src/modules/planning/instructions/get-plan-artifact.md")
  );
});

test("get-plan-artifact forwards planId only when optional flags omitted", async () => {
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
        code: "plan-artifact-retrieved",
        message: `PlanArtifact ${planId} version 1 retrieved`,
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: 1,
          latestVersion: 1,
          lineage: {}
        }
      };
    }
  };

  await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "get-plan-artifact-minimal",
      method: "tools/call",
      params: {
        name: GET_PLAN_ARTIFACT_TOOL_NAME,
        arguments: { planId }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [{ name: "get-plan-artifact", args: { planId } }]);
});

test("get-plan-artifact rejects missing planId before runtime invocation", async () => {
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
      return { ok: true, code: "plan-artifact-retrieved", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "get-plan-artifact-bad-args",
      method: "tools/call",
      params: {
        name: GET_PLAN_ARTIFACT_TOOL_NAME,
        arguments: {}
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /planId is required/i);
});

test("get-plan-artifact integration read on sqlite workspace", async () => {
  const workspace = await tmpWorkspace();
  const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
  const draft = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "mcp-get-plan-artifact.test.mjs" }
      }
    },
    planningCtx(workspace)
  );
  assert.equal(draft.ok, true, draft.message);

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
      id: "get-plan-artifact-integration",
      method: "tools/call",
      params: {
        name: GET_PLAN_ARTIFACT_TOOL_NAME,
        arguments: { planId: draft.data.planId, includeArtifact: false }
      }
    },
    { runtime, workspaceRoot: workspace, workspaceTrusted: true }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.result.ok, true);
  assert.equal(envelope.result.code, "plan-artifact-retrieved");
  assert.equal(envelope.result.data.planId, draft.data.planId);
  assert.equal(envelope.result.data.artifact, undefined);
  assert.ok(Array.isArray(envelope.result.data.versions));
  assert.ok(Buffer.byteLength(JSON.stringify(envelope.result.data), "utf8") <= MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET);
});
