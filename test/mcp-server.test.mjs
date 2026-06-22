import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  handleMcpRequest,
  listReadOnlyMcpTools,
  listReadOnlyMcpResources,
  resolveMcpWorkspaceBinding,
  resolveWorkspaceBoundPath,
  isPathWithinWorkspaceRoot,
  MCP_ENVELOPE_SCHEMA_VERSION,
  MCP_DEFAULT_TOOL_SCHEMA_VERSION
} from "../dist/mcp/index.js";

test("MCP initialize advertises a minimal read-only server", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  });

  assert.equal(response?.jsonrpc, "2.0");
  assert.equal(response?.id, 1);
  assert.deepEqual(response?.result.capabilities, { tools: {}, resources: {} });
  assert.equal(response?.result.serverInfo.name, "workflow-cannon");
  assert.equal(response?.result.startup.healthy, true);
  assert.equal(response?.result.startup.mode, "read-only");
  assert.equal(response?.result.startup.workspaceBinding.workspaceRoot, process.cwd());
  assert.equal(response?.result.startup.workspaceBinding.bindingSource, "cwd");
  assert.equal(
    response?.result.startup.workspaceBinding.multiWorkspaceBehavior.mode,
    "single-workspace-per-process"
  );
  assert.match(
    response?.result.startup.workspaceBinding.launchCommands.builtDist,
    /node dist\/mcp\/cli\.js --workspace <workspace-root>/
  );
});

test("MCP workspace binding resolves explicit workspace roots", () => {
  const workspacePath = mkdtempSync(path.join(tmpdir(), "wc-mcp-explicit-root-"));
  mkdirSync(path.join(workspacePath, ".workspace-kit"));
  const binding = resolveMcpWorkspaceBinding({ workspacePath });

  assert.equal(binding.workspaceRoot, workspacePath);
  assert.equal(binding.bindingSource, "option");
  assert.equal(binding.workspaceTrusted, true);
  assert.equal(binding.workspaceTrustReason, "workspace-kit-present");
  assert.equal(binding.pathBoundaryEnforced, true);
  assert.equal(binding.multiWorkspaceBehavior.multiRootSupported, false);
  assert.match(binding.multiWorkspaceBehavior.contract, /exactly one workspaceRoot/);
  assert.match(binding.multiWorkspaceBehavior.recommendation, /one wk-mcp process per workspace/);
});

test("MCP tools/list exposes only the safe read-only tool", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "tools",
    method: "tools/list"
  });

  const tools = response?.result.tools;
  const toolNames = tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("workflow-cannon.agent_start"));
  assert.ok(toolNames.includes("workflow-cannon.capabilities"));
  assert.ok(toolNames.includes("workflow-cannon.agent-execution-packet"));
  assert.ok(toolNames.includes("workflow-cannon.phase-release-orchestration-state"));
  assert.ok(toolNames.includes("workflow-cannon.cae-guidance-preview"));
  assert.ok(toolNames.includes("workflow-cannon.memory-list"));
  assert.deepEqual(tools, listReadOnlyMcpTools());
  assert.ok(!tools.some((tool) => /run-transition|update-task|complete-task/.test(tool.name)));
  assert.ok(!tools.some((tool) => /write-memory|approve-memory|prune-memory/.test(tool.name)));
});

test("MCP tools/list descriptions include fallback and common-mistake contract", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "tool-descriptions",
    method: "tools/list"
  });

  const tools = response?.result.tools;
  assert.ok(tools.length > 5);
  for (const tool of tools) {
    assert.equal(typeof tool.description, "string", `${tool.name} has a description`);
    assert.ok(tool.description.length > 0, `${tool.name} description is non-empty`);
    assert.ok(tool.description.length <= 420, `${tool.name} description stays compact`);
    assert.match(tool.description, /CLI fallback: pnpm exec wk run /, `${tool.name} has CLI fallback`);
    assert.match(tool.description, /Common mistakes: /, `${tool.name} has common mistakes`);
  }

  const packetTool = tools.find((tool) => tool.name === "workflow-cannon.agent-execution-packet");
  assert.match(packetTool.description, /agent-execution-packet/);
  assert.match(packetTool.description, /implementing from a draft packet/i);
});

test("MCP tools/call agent_start recommends phase release orchestration for Complete and Release", async () => {
  const auditLog = [];
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "agent-start",
    method: "tools/call",
    params: {
      name: "workflow-cannon.agent_start",
      arguments: {}
    }
  }, { auditLog });

  assert.equal(response?.result.isError, false);
  const text = response?.result.content.at(0).text;
  const payload = JSON.parse(text);
  assert.equal(payload.mode, "read-only");
  assert.equal(payload.mutationToolsEnabled, false);
  assert.equal(payload.readOnlyToolsOnly, true);
  assert.ok(Array.isArray(payload.toolsAvailable));
  assert.ok(payload.toolsAvailable.includes("workflow-cannon.agent_start"));
  assert.ok(payload.toolsAvailable.includes("workflow-cannon.capabilities"));
  assert.match(payload.cliFallback.command, /agent-bootstrap/);
  const completeRelease = payload.workflowRecommendations.find(
    (row) => row.workflowId === "complete-and-release"
  );
  assert.ok(completeRelease);
  assert.equal(
    completeRelease.recommendedMcpTool,
    "workflow-cannon.phase-release-orchestration-state"
  );
  assert.match(completeRelease.recommendedCliCommand, /phase-release-orchestration-state/);
  assert.equal(auditLog.at(0).toolName, "workflow-cannon.agent_start");
});

test("MCP tools/call reports mutation tools disabled", async () => {
  const auditLog = [];
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "workflow-cannon.capabilities",
      arguments: {}
    }
  }, { auditLog });

  assert.equal(response?.result.isError, false);
  const text = response?.result.content.at(0).text;
  const capabilities = JSON.parse(text);
  assert.equal(capabilities.mutationToolsEnabled, false);
  assert.equal(capabilities.startup.healthy, true);
  assert.equal(capabilities.startup.workspaceBinding.workspaceRoot, process.cwd());
  assert.equal(
    capabilities.startup.workspaceBinding.multiWorkspaceBehavior.mode,
    "single-workspace-per-process"
  );
  assert.deepEqual(capabilities.auditLogging, { bounded: true, redacted: true });
  assert.deepEqual(capabilities.toolDescriptionContract, {
    schemaVersion: 1,
    requiredSegments: ["description", "CLI fallback", "Common mistakes"]
  });
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog.at(0).toolName, "workflow-cannon.capabilities");
  assert.equal(auditLog.at(0).resultClassification, "success");
});

test("MCP read tools invoke equivalent command runtime with required phaseKey", async () => {
  const invocations = [];
  const auditLog = [];
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
        code: "agent-execution-packet",
        message: "packet",
        data: {
          taskId: invocation.args.taskId,
          phaseKey: invocation.args.phaseKey
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "packet",
      method: "tools/call",
      params: {
        name: "workflow-cannon.agent-execution-packet",
        arguments: {
          mode: "draft",
          taskId: "T100711",
          phaseKey: "134"
        }
      }
    },
    { runtime, auditLog }
  );

  assert.deepEqual(invocations, [
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T100711",
        phaseKey: "134"
      }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.mode, "read-only");
  assert.equal(envelope.mutationToolsEnabled, false);
  assert.equal(envelope.command, "agent-execution-packet");
  assert.equal(envelope.result.data.phaseKey, "134");
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog.at(0).toolName, "workflow-cannon.agent-execution-packet");
  assert.equal(auditLog.at(0).resultClassification, "success");
  assert.deepEqual(auditLog.at(0).metadata.args, {
    mode: "draft",
    taskId: "T100711",
    phaseKey: "134"
  });
});

test("MCP read tools reject missing required phaseKey before runtime invocation", async () => {
  const auditLog = [];
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      throw new Error("runtime should not be called");
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "missing-phase",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-orchestration-state",
        arguments: {}
      }
    },
    { runtime, auditLog }
  );

  assert.equal(response?.error.code, -32602);
  assert.equal(response?.error.message, "phaseKey is required");
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog.at(0).toolName, "workflow-cannon.phase-release-orchestration-state");
  assert.equal(auditLog.at(0).resultClassification, "rejected");
  assert.equal(auditLog.at(0).metadata.reason, "invalid-arguments");
});

test("MCP read tools reject unknown tools and audit the rejection", async () => {
  const auditLog = [];
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "unknown",
      method: "tools/call",
      params: {
        name: "workflow-cannon.run-transition",
        arguments: {
          taskId: "T100713",
          policyApproval: {
            confirmed: true,
            rationale: "must not be logged"
          }
        }
      }
    },
    { auditLog }
  );

  assert.equal(response?.error.code, -32602);
  assert.match(response?.error.message, /Unknown tool/);
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog.at(0).toolName, "workflow-cannon.run-transition");
  assert.equal(auditLog.at(0).resultClassification, "rejected");
  assert.equal(auditLog.at(0).metadata.reason, "unknown-tool");
});

test("MCP read tools enforce byte budget with expansion refs", async () => {
  const auditLog = [];
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      return {
        ok: true,
        code: "phase-release-orchestration-state",
        message: "large",
        data: {
          blob: "x".repeat(2500)
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "large",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-orchestration-state",
        arguments: {
          phaseKey: "134"
        }
      }
    },
    { runtime, maxToolResponseBytes: 1000, auditLog }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.oversized, true);
  assert.equal(envelope.byteBudget, 1000);
  assert.equal(envelope.resultSummary.ok, true);
  assert.equal(
    envelope.expansionRefs.at(0).command,
    `pnpm exec wk run phase-release-orchestration-state '${JSON.stringify({ phaseKey: "134" })}'`
  );
  assert.equal(auditLog.at(0).metadata.oversized, true);
  assert.equal(auditLog.at(0).metadata.byteBudget, 1000);
});

test("MCP audit metadata is bounded and redacts secret-shaped values", async () => {
  const auditLog = [];
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
        code: "simulated-error",
        message: "not ok"
      };
    }
  };

  await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "audit-redaction",
      method: "tools/call",
      params: {
        name: "workflow-cannon.cae-guidance-preview",
        arguments: {
          taskId: "T100713",
          token: "ghp_abcdefghijklmnopqrstuvwxyz123456",
          nested: {
            Authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456",
            note: "x".repeat(220)
          },
          many: Array.from({ length: 12 }, (_, index) => index)
        }
      }
    },
    { runtime, auditLog }
  );

  assert.equal(auditLog.length, 1);
  assert.equal(auditLog.at(0).resultClassification, "command_error");
  assert.equal(auditLog.at(0).metadata.args.token, "[redacted]");
  assert.equal(auditLog.at(0).metadata.args.nested.Authorization, "[redacted]");
  assert.match(auditLog.at(0).metadata.args.nested.note, /redacted:60:additional-chars/);
  assert.equal(auditLog.at(0).metadata.args.many.length, 9);
  assert.match(auditLog.at(0).metadata.args.many.at(8), /redacted:4:additional-items/);
});

test("MCP CAE guidance tools carry bounded governance metadata", async () => {
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
        code: "cae-guidance-preview-ok",
        data: {
          guidanceCards: {
            do: [{ title: "Use bounded context" }]
          }
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "cae",
      method: "tools/call",
      params: {
        name: "workflow-cannon.cae-guidance-preview",
        arguments: {
          taskId: "T100712",
          workflowName: "phase-release"
        }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "cae-guidance-preview",
      args: {
        taskId: "T100712",
        workflowName: "phase-release"
      }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.command, "cae-guidance-preview");
  assert.equal(envelope.governance.bounded, true);
  assert.match(envelope.governance.note, /bounded by the CAE/i);
  assert.ok(envelope.governance.sourceRefs.includes("src/modules/context-activation/instructions/cae-guidance-preview.md"));
});

test("MCP memory recall is governed, source-cited, and read-only", async () => {
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
        code: "memory-listed",
        data: {
          records: [
            {
              id: "mem-1",
              status: "approved",
              category: "release",
              body: "Use release evidence before completion."
            }
          ],
          count: 1
        }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "memory",
      method: "tools/call",
      params: {
        name: "workflow-cannon.memory-list",
        arguments: {
          status: "approved",
          category: "release"
        }
      }
    },
    { runtime }
  );

  assert.deepEqual(invocations, [
    {
      name: "list-memory",
      args: {
        status: "approved",
        category: "release"
      }
    }
  ]);
  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.command, "list-memory");
  assert.match(envelope.governance.note, /write, approve, and prune memory commands are not exposed/i);
  assert.ok(envelope.governance.sourceRefs.includes("src/modules/project-memory/instructions/list-memory.md"));
  assert.equal(envelope.result.data.records.at(0).status, "approved");
});

test("MCP stdio CLI starts from documented command and proves workspace binding", async () => {
  const child = spawn(process.execPath, ["dist/mcp/cli.js", "--workspace", process.cwd()], {
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
  assert.equal(response.result.startup.healthy, true);
  assert.equal(response.result.startup.workspaceBinding.workspaceRoot, process.cwd());
  assert.equal(response.result.startup.workspaceBinding.bindingSource, "option");
  assert.equal(
    response.result.startup.workspaceBinding.launchCommands.builtDist,
    "node dist/mcp/cli.js --workspace <workspace-root>"
  );
  assert.equal(
    response.result.startup.workspaceBinding.multiWorkspaceBehavior.mode,
    "single-workspace-per-process"
  );
});

test("MCP initialize advertises resources capability", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "init-resources",
    method: "initialize",
    params: {}
  });

  assert.deepEqual(response?.result.capabilities, { tools: {}, resources: {} });
});

test("MCP resources/list returns static resources with cache policy", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-list",
    method: "resources/list"
  });

  assert.equal(response?.jsonrpc, "2.0");
  assert.equal(response?.id, "res-list");
  const resources = response?.result.resources;
  assert.ok(Array.isArray(resources), "resources is an array");
  assert.ok(resources.length >= 2, "at least two resources");

  for (const resource of resources) {
    assert.equal(typeof resource.uri, "string", `${resource.uri} has uri`);
    assert.equal(typeof resource.name, "string", `${resource.uri} has name`);
    assert.equal(typeof resource.description, "string", `${resource.uri} has description`);
    assert.equal(typeof resource.mimeType, "string", `${resource.uri} has mimeType`);
    assert.ok(resource.cachePolicy, `${resource.uri} has cachePolicy`);
    assert.equal(resource.cachePolicy.authority, "static", `${resource.uri} authority is static`);
    assert.equal(
      typeof resource.cachePolicy.note,
      "string",
      `${resource.uri} cachePolicy has note`
    );
    assert.ok(
      resource.cachePolicy.maxAgeSeconds > 0,
      `${resource.uri} cachePolicy has positive maxAgeSeconds`
    );
  }

  const uris = resources.map((r) => r.uri);
  assert.ok(
    uris.includes("workflow-cannon://resources/mcp-freshness-policy"),
    "freshness policy resource is listed"
  );
  assert.ok(
    uris.includes("workflow-cannon://resources/mcp-adapter-boundary"),
    "adapter boundary resource is listed"
  );
});

test("MCP resources/list matches listReadOnlyMcpResources()", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-list-parity",
    method: "resources/list"
  });

  const listedResources = response?.result.resources;
  const directResources = listReadOnlyMcpResources();

  assert.equal(listedResources.length, directResources.length);
  for (let i = 0; i < directResources.length; i++) {
    assert.equal(listedResources[i].uri, directResources[i].uri);
    assert.equal(listedResources[i].name, directResources[i].name);
    assert.deepEqual(listedResources[i].cachePolicy, directResources[i].cachePolicy);
  }
});

test("MCP resources/read returns content with freshness envelope", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-read",
    method: "resources/read",
    params: { uri: "workflow-cannon://resources/mcp-freshness-policy" }
  });

  assert.equal(response?.id, "res-read");
  assert.ok(!("error" in response), "no error in response");

  const contents = response?.result.contents;
  assert.ok(Array.isArray(contents) && contents.length === 1, "one content item");
  assert.equal(contents[0].uri, "workflow-cannon://resources/mcp-freshness-policy");
  assert.equal(contents[0].mimeType, "text/markdown");
  assert.equal(typeof contents[0].text, "string", "text is a string");
  assert.ok(contents[0].text.length > 0, "text is non-empty");
  assert.match(contents[0].text, /freshness/i, "freshness policy content mentions freshness");

  const envelope = response?.result.freshnessEnvelope;
  assert.ok(envelope, "freshnessEnvelope is present");
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.authority, "static");
  assert.equal(typeof envelope.fetchedAt, "string", "fetchedAt is a string");
  assert.match(envelope.fetchedAt, /^\d{4}-\d{2}-\d{2}T/, "fetchedAt is an ISO timestamp");
  assert.equal(envelope.cachePolicy.authority, "static");
  assert.ok(envelope.cachePolicy.maxAgeSeconds > 0);
  assert.equal(typeof envelope.authorityNote, "string");
  assert.match(
    envelope.authorityNote,
    /not authoritative for current task/i,
    "authorityNote warns about stale state"
  );
});

test("MCP resources/read rejects unknown URI", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-unknown",
    method: "resources/read",
    params: { uri: "workflow-cannon://resources/does-not-exist" }
  });

  assert.equal(response?.error.code, -32602);
  assert.match(response?.error.message, /Unknown resource/);
});

test("MCP resources/read rejects missing URI", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-no-uri",
    method: "resources/read",
    params: {}
  });

  assert.equal(response?.error.code, -32602);
  assert.equal(response?.error.message, "uri is required");
});

test("MCP tool result envelope includes freshnessPolicy with live authority", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      return {
        ok: true,
        code: "phase-release-state",
        message: "ok",
        data: { phaseKey: invocation.args.phaseKey }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "freshness-check",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-state",
        arguments: { phaseKey: "134" }
      }
    },
    { runtime }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.ok(envelope.freshnessPolicy, "freshnessPolicy is present in tool result");
  assert.equal(envelope.freshnessPolicy.authority, "live");
  assert.equal(typeof envelope.freshnessPolicy.note, "string");
  assert.match(
    envelope.freshnessPolicy.note,
    /Re-invoke/i,
    "note instructs re-invocation for current state"
  );
  assert.equal(typeof envelope.freshnessPolicy.cliFallbackNote, "string");
});

test("MCP tool result is live authority; resources are static — boundary is distinct", () => {
  const resources = listReadOnlyMcpResources();
  assert.ok(resources.length >= 2, "at least two static resources defined");
  for (const resource of resources) {
    assert.equal(
      resource.cachePolicy.authority,
      "static",
      `resource ${resource.uri} is static (not live)`
    );
  }
});

test("MCP capabilities tool discloses resources and resourceFreshnessPolicy", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "cap-resources",
    method: "tools/call",
    params: {
      name: "workflow-cannon.capabilities",
      arguments: {}
    }
  });

  assert.equal(response?.result.isError, false);
  const text = response?.result.content.at(0).text;
  const capabilities = JSON.parse(text);

  assert.ok(Array.isArray(capabilities.resources), "capabilities lists resources");
  assert.ok(capabilities.resources.length >= 2, "at least two resources in capabilities");
  for (const r of capabilities.resources) {
    assert.equal(typeof r.uri, "string");
    assert.equal(r.cachePolicy.authority, "static");
  }

  const policy = capabilities.resourceFreshnessPolicy;
  assert.ok(policy, "resourceFreshnessPolicy is present");
  assert.equal(policy.schemaVersion, 1);
  assert.equal(typeof policy.authorityLevels.live, "string");
  assert.equal(typeof policy.authorityLevels.static, "string");
  assert.equal(typeof policy.authorityLevels.advisory, "string");
  assert.equal(typeof policy.stateAuthorityRule, "string");
  assert.match(
    policy.stateAuthorityRule,
    /re-invoked/i,
    "stateAuthorityRule mentions re-invocation"
  );
});

test("MCP tool result byte-budget compact envelope also includes freshnessPolicy", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke() {
      return {
        ok: true,
        code: "phase-release-state",
        message: "large",
        data: { blob: "x".repeat(2500) }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "freshness-compact",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-state",
        arguments: { phaseKey: "134" }
      }
    },
    { runtime, maxToolResponseBytes: 1000 }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.oversized, true, "envelope is oversized");
  assert.ok(envelope.freshnessPolicy, "compact envelope still has freshnessPolicy");
  assert.equal(envelope.freshnessPolicy.authority, "live");
});

test("MCP version constants are exported and match expected baseline values", () => {
  assert.equal(typeof MCP_ENVELOPE_SCHEMA_VERSION, "number", "MCP_ENVELOPE_SCHEMA_VERSION is a number");
  assert.equal(typeof MCP_DEFAULT_TOOL_SCHEMA_VERSION, "number", "MCP_DEFAULT_TOOL_SCHEMA_VERSION is a number");
  assert.equal(MCP_ENVELOPE_SCHEMA_VERSION, 1, "envelope schema version is 1");
  assert.equal(MCP_DEFAULT_TOOL_SCHEMA_VERSION, 1, "default tool schema version is 1");
});

test("MCP tool output envelope includes schemaVersion and toolVersion on success", async () => {
  const runtime = {
    listCommands() { return []; },
    describeCommand() { return undefined; },
    async invoke(invocation) {
      return {
        ok: true,
        code: "phase-release-state",
        message: "ok",
        data: { phaseKey: invocation.args.phaseKey, status: "active" }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "version-check",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-state",
        arguments: { phaseKey: "134" }
      }
    },
    { runtime }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION, "envelope.schemaVersion matches constant");
  assert.equal(envelope.toolVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION, "envelope.toolVersion matches constant");
  assert.equal(typeof envelope.schemaVersion, "number", "schemaVersion is numeric");
  assert.equal(typeof envelope.toolVersion, "number", "toolVersion is numeric");
});

test("MCP tool output envelope includes schemaVersion and toolVersion on oversized response", async () => {
  const runtime = {
    listCommands() { return []; },
    describeCommand() { return undefined; },
    async invoke() {
      return {
        ok: true,
        code: "phase-release-state",
        message: "big",
        data: { blob: "x".repeat(3000) }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "version-oversized",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-state",
        arguments: { phaseKey: "134" }
      }
    },
    { runtime, maxToolResponseBytes: 500 }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.oversized, true, "confirms oversized path");
  assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION, "oversized envelope carries schemaVersion");
  assert.equal(envelope.toolVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION, "oversized envelope carries toolVersion");
});

test("MCP capabilities payload includes versionContract with policy ref", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "capabilities-version",
    method: "tools/call",
    params: {
      name: "workflow-cannon.capabilities",
      arguments: {}
    }
  });

  const capabilities = JSON.parse(response?.result.content.at(0).text);
  assert.equal(capabilities.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION, "capabilities carries schemaVersion");
  assert.equal(capabilities.toolVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION, "capabilities carries toolVersion");
  assert.ok(capabilities.versionContract, "versionContract block present");
  assert.equal(capabilities.versionContract.envelopeSchemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
  assert.equal(capabilities.versionContract.defaultToolSchemaVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION);
  assert.match(capabilities.versionContract.policy, /mcp-tool-version-policy/);
});

test("MCP agent_start payload includes schemaVersion and toolVersion", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "agent-start-version",
    method: "tools/call",
    params: {
      name: "workflow-cannon.agent_start",
      arguments: {}
    }
  });

  const payload = JSON.parse(response?.result.content.at(0).text);
  assert.equal(payload.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION, "agent_start carries schemaVersion");
  assert.equal(payload.toolVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION, "agent_start carries toolVersion");
});

test("MCP path boundary helpers reject escapes outside workspace root", () => {
  const workspaceRoot = path.resolve("/tmp/workflow-cannon-boundary-a");
  assert.equal(isPathWithinWorkspaceRoot(workspaceRoot, path.join(workspaceRoot, ".ai/foo.md")), true);
  assert.equal(isPathWithinWorkspaceRoot(workspaceRoot, "/etc/passwd"), false);

  const allowed = resolveWorkspaceBoundPath(workspaceRoot, ".ai/mcp-resource-freshness-policy.md");
  assert.equal(allowed.ok, true);
  assert.equal(allowed.absolutePath, path.join(workspaceRoot, ".ai/mcp-resource-freshness-policy.md"));

  const traversal = resolveWorkspaceBoundPath(workspaceRoot, "../outside-secret.txt");
  assert.equal(traversal.ok, false);
  assert.equal(traversal.reason, "path-escapes-workspace-root");

  const absolute = resolveWorkspaceBoundPath(workspaceRoot, "/etc/passwd");
  assert.equal(absolute.ok, false);
  assert.equal(absolute.reason, "absolute-path-not-allowed");
});

test("MCP workspace trust is false when workflow-cannon markers are missing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "wc-mcp-untrusted-"));
  const binding = resolveMcpWorkspaceBinding({ workspacePath: tempRoot });
  assert.equal(binding.workspaceTrusted, false);
  assert.equal(binding.workspaceTrustReason, "workflow-cannon-markers-missing");
  assert.equal(binding.pathBoundaryEnforced, true);
});

test("MCP workspace trust accepts workflow-cannon package.json without .workspace-kit", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "wc-mcp-trusted-pkg-"));
  writeFileSync(
    path.join(tempRoot, "package.json"),
    JSON.stringify({ name: "@workflow-cannon/workspace-kit" })
  );
  const binding = resolveMcpWorkspaceBinding({ workspacePath: tempRoot });
  assert.equal(binding.workspaceTrusted, true);
  assert.equal(binding.workspaceTrustReason, "workflow-cannon-package");
});

test("MCP resources/read cannot expose files outside the bound workspace", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "wc-mcp-workspace-a-"));
  const outsideRoot = mkdtempSync(path.join(tmpdir(), "wc-mcp-outside-b-"));
  mkdirSync(path.join(workspaceRoot, ".ai"), { recursive: true });
  writeFileSync(path.join(workspaceRoot, ".ai/mcp-resource-freshness-policy.md"), "# trusted copy");
  writeFileSync(path.join(outsideRoot, "leaked-secret.md"), "# leaked");

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "res-boundary",
      method: "resources/read",
      params: { uri: "workflow-cannon://resources/mcp-freshness-policy" }
    },
    { workspacePath: workspaceRoot }
  );

  assert.ok(!("error" in response), "resource read succeeds inside workspace");
  assert.match(response?.result.contents.at(0).text, /trusted copy/);

  const symlinkAttempt = resolveWorkspaceBoundPath(
    workspaceRoot,
    path.relative(workspaceRoot, path.join(outsideRoot, "leaked-secret.md"))
  );
  if (symlinkAttempt.ok) {
    assert.equal(
      isPathWithinWorkspaceRoot(workspaceRoot, symlinkAttempt.absolutePath),
      false,
      "relative path that resolves outside root is blocked"
    );
  }
});

test("MCP multi-root behavior is explicit: one process binds one workspace root", async () => {
  const workspaceA = mkdtempSync(path.join(tmpdir(), "wc-mcp-root-a-"));
  const workspaceB = mkdtempSync(path.join(tmpdir(), "wc-mcp-root-b-"));
  mkdirSync(path.join(workspaceA, ".workspace-kit"));
  mkdirSync(path.join(workspaceB, ".workspace-kit"));
  writeFileSync(path.join(workspaceA, "marker.txt"), "workspace-a");
  writeFileSync(path.join(workspaceB, "marker.txt"), "workspace-b");

  const bindingA = resolveMcpWorkspaceBinding({ workspacePath: workspaceA });
  const bindingB = resolveMcpWorkspaceBinding({ workspacePath: workspaceB });

  assert.notEqual(bindingA.workspaceRoot, bindingB.workspaceRoot);
  assert.equal(bindingA.multiWorkspaceBehavior.mode, "single-workspace-per-process");
  assert.equal(bindingB.multiWorkspaceBehavior.multiRootSupported, false);
  assert.match(bindingA.multiWorkspaceBehavior.contract, /one wk-mcp process per root folder/i);

  const initA = await handleMcpRequest(
    { jsonrpc: "2.0", id: "init-a", method: "initialize", params: {} },
    { workspacePath: workspaceA }
  );
  const initB = await handleMcpRequest(
    { jsonrpc: "2.0", id: "init-b", method: "initialize", params: {} },
    { workspacePath: workspaceB }
  );

  assert.equal(initA?.result.startup.workspaceBinding.workspaceRoot, workspaceA);
  assert.equal(initB?.result.startup.workspaceBinding.workspaceRoot, workspaceB);
  assert.equal(initA?.result.startup.workspaceBinding.multiWorkspaceBehavior.multiRootSupported, false);
});

test("MCP capabilities and resource freshness include bound workspace metadata", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "cap-workspace-freshness",
    method: "tools/call",
    params: {
      name: "workflow-cannon.capabilities",
      arguments: {}
    }
  });

  const capabilities = JSON.parse(response?.result.content.at(0).text);
  const workspace = capabilities.resourceFreshnessPolicy.workspace;
  assert.equal(workspace.schemaVersion, 1);
  assert.equal(workspace.workspaceRoot, process.cwd());
  assert.equal(workspace.pathBoundaryEnforced, true);
  assert.equal(typeof workspace.workspaceTrusted, "boolean");
  assert.equal(workspace.multiWorkspaceBehavior.mode, "single-workspace-per-process");
  assert.equal(workspace.multiWorkspaceBehavior.multiRootSupported, false);

  const resourceResponse = await handleMcpRequest({
    jsonrpc: "2.0",
    id: "res-workspace-freshness",
    method: "resources/read",
    params: { uri: "workflow-cannon://resources/mcp-freshness-policy" }
  });

  const resourceWorkspace = resourceResponse?.result.freshnessEnvelope.workspace;
  assert.equal(resourceWorkspace.workspaceRoot, process.cwd());
  assert.equal(resourceWorkspace.pathBoundaryEnforced, true);
});

test("MCP tool freshnessPolicy includes bound workspace metadata", async () => {
  const runtime = {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      return {
        ok: true,
        code: "phase-release-state",
        message: "ok",
        data: { phaseKey: invocation.args.phaseKey }
      };
    }
  };

  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "tool-workspace-freshness",
      method: "tools/call",
      params: {
        name: "workflow-cannon.phase-release-state",
        arguments: { phaseKey: "134" }
      }
    },
    { runtime }
  );

  const envelope = JSON.parse(response?.result.content.at(0).text);
  assert.equal(envelope.freshnessPolicy.authority, "live");
  assert.equal(envelope.freshnessPolicy.workspace.workspaceRoot, process.cwd());
  assert.equal(envelope.freshnessPolicy.workspace.pathBoundaryEnforced, true);
  assert.equal(envelope.freshnessPolicy.workspace.multiWorkspaceBehavior.multiRootSupported, false);
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
