import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import {
  handleMcpRequest,
  listReadOnlyMcpTools,
  listReadOnlyMcpResources,
  resolveMcpWorkspaceBinding
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
  const binding = resolveMcpWorkspaceBinding({ workspacePath: "/tmp/workflow-cannon-mcp-a" });

  assert.equal(binding.workspaceRoot, "/tmp/workflow-cannon-mcp-a");
  assert.equal(binding.bindingSource, "option");
  assert.equal(binding.workspaceTrusted, true);
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

async function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
