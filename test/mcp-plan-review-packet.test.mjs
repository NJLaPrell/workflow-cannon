/** T100824 — workflow-cannon.plan-review-packet MCP read tool. */
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

const PLAN_REVIEW_PACKET_TOOL_NAME = "workflow-cannon.plan-review-packet";
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-plan-review-packet-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function planningCtx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

test("plan-review-packet is registered in MCP tools/list with budget", async () => {
  const tools = listReadOnlyMcpTools();
  const tool = tools.find((row) => row.name === PLAN_REVIEW_PACKET_TOOL_NAME);
  assert.ok(tool, "plan-review-packet tool is listed");
  assert.match(tool.description, /CLI fallback: pnpm exec wk run review-plan-artifact/);
  assert.match(tool.description, /Common mistakes:/);

  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "plan-review-packet-tools-list",
    method: "tools/list"
  });
  assert.ok(response?.result.tools.some((row) => row.name === PLAN_REVIEW_PACKET_TOOL_NAME));
});

test("plan-review-packet is state-like per freshness policy", () => {
  assert.ok(STATE_LIKE_MCP_TOOL_NAMES.includes(PLAN_REVIEW_PACKET_TOOL_NAME));
});

test("plan-review-packet invokes review-plan-artifact CLI with planId and optional flags", async () => {
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
        code: "plan-artifact-review-complete",
        message: "Review complete",
        data: {
          passed: true,
          profile: "minimal",
          blockers: [],
          warnings: [],
          coverageMap: { goals: [] },
          blockerCount: 0,
          warningCount: 0
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "plan-review-packet-call",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: { planId, version: 1, profile: "minimal" }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "review-plan-artifact",
      args: { planId, version: 1, profile: "minimal" }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.tool, PLAN_REVIEW_PACKET_TOOL_NAME);
  assert.equal(envelope.command, "review-plan-artifact");
  assert.equal(envelope.result.code, "plan-artifact-review-complete");
  assert.equal(envelope.result.data.passed, true);
  assert.ok(envelope.freshness);
  assert.match(envelope.governance.note, /read-only through review-plan-artifact/i);
  assert.ok(
    envelope.governance.sourceRefs.includes("src/modules/planning/instructions/review-plan-artifact.md")
  );
});

test("plan-review-packet forwards planId only when optional flags omitted", async () => {
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
        code: "plan-artifact-review-complete",
        data: { passed: true, blockers: [], warnings: [] }
      };
    }
  };

  await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "plan-review-packet-minimal",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: { planId }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [{ name: "review-plan-artifact", args: { planId } }]);
});

test("plan-review-packet rejects missing planId before runtime invocation", async () => {
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
      return { ok: true, code: "plan-artifact-review-complete", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "plan-review-packet-bad-args",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: {}
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /planId is required/i);
});

test("plan-review-packet rejects recordReview through MCP", async () => {
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
      return { ok: true, code: "plan-artifact-review-complete", data: {} };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "plan-review-packet-record-review",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: { planId: crypto.randomUUID(), recordReview: true }
      }
    },
    { runtime }
  );

  assert.equal(invocations.length, 0);
  assert.equal(response?.error?.code, -32602);
  assert.match(response?.error?.message, /recordReview is not supported through MCP/i);
});

test("plan-review-packet integration read on sqlite workspace", async () => {
  const workspace = await tmpWorkspace();
  const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
  const draft = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "mcp-plan-review-packet.test.mjs" }
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
      id: "plan-review-packet-integration",
      method: "tools/call",
      params: {
        name: PLAN_REVIEW_PACKET_TOOL_NAME,
        arguments: { planId: draft.data.planId, profile: "minimal" }
      }
    },
    { runtime, workspaceRoot: workspace, workspaceTrusted: true }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.result.ok, true);
  assert.equal(envelope.result.code, "plan-artifact-review-complete");
  assert.equal(envelope.result.data.passed, true);
  assert.ok(Array.isArray(envelope.result.data.blockers));
  assert.ok(Array.isArray(envelope.result.data.warnings));
  assert.ok(envelope.result.data.coverageMap);
  assert.ok(Buffer.byteLength(JSON.stringify(envelope.result.data), "utf8") <= MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET);
});
