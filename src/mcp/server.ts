import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { Writable } from "node:stream";

import { createCommandRegistryRuntime } from "../core/module-command-router.js";
import { ModuleRegistry } from "../core/module-registry.js";
import type { ModuleCommandResult, ModuleCommandRuntime } from "../contracts/module-contract.js";
import { defaultRegistryModules } from "../modules/index.js";

const JSON_RPC_VERSION = "2.0";
const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TOOL_RESPONSE_BYTE_BUDGET = 24_000;
const MAX_AUDIT_METADATA_STRING_LENGTH = 160;
const MAX_AUDIT_METADATA_ARRAY_LENGTH = 8;
const MAX_AUDIT_METADATA_OBJECT_KEYS = 12;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

export interface McpServerOptions {
  name?: string;
  version?: string;
  workspacePath?: string;
  runtime?: ModuleCommandRuntime;
  maxToolResponseBytes?: number;
  auditLog?: McpAuditEvent[];
  auditSink?: (event: McpAuditEvent) => void;
}

export interface McpWorkspaceBinding {
  schemaVersion: 1;
  workspaceRoot: string;
  workspaceTrusted: boolean;
  workspaceTrustReason: string;
  pathBoundaryEnforced: true;
  bindingSource: "option" | "cwd";
  launchCommands: {
    packageBin: string;
    builtDist: string;
  };
  multiWorkspaceBehavior: {
    mode: "single-workspace-per-process";
    multiRootSupported: false;
    contract: string;
    recommendation: string;
  };
}

export interface McpWorkspaceFreshness {
  schemaVersion: 1;
  workspaceRoot: string;
  workspaceTrusted: boolean;
  workspaceTrustReason: string;
  pathBoundaryEnforced: true;
  bindingSource: McpWorkspaceBinding["bindingSource"];
  multiWorkspaceBehavior: McpWorkspaceBinding["multiWorkspaceBehavior"];
}

export type McpAuditResultClassification = "success" | "command_error" | "protocol_error" | "rejected";

export interface McpAuditEvent {
  schemaVersion: 1;
  timestamp: string;
  toolName: string;
  resultClassification: McpAuditResultClassification;
  metadata: Record<string, unknown>;
}

export interface McpResourceCachePolicy {
  authority: "live" | "static" | "advisory";
  maxAgeSeconds?: number;
  note: string;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  cachePolicy: McpResourceCachePolicy;
}

interface McpStaticResourceDefinition extends McpResourceDescriptor {
  workspaceRelativePath: string;
}

interface ReadOnlyMcpToolDefinition {
  toolName: string;
  commandName: string;
  description: string;
  cliFallbackArgs?: string;
  commonMistakes: string[];
  inputSchema: McpToolDescriptor["inputSchema"];
  expansionArgs: (args: Record<string, unknown>) => Record<string, unknown>;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  governance?: {
    bounded?: boolean;
    note: string;
    sourceRefs: string[];
  };
  /**
   * Per-tool output contract version. Increment when the tool's result shape
   * changes in a way that callers must handle differently. Defaults to
   * MCP_DEFAULT_TOOL_SCHEMA_VERSION if omitted.
   */
  toolSchemaVersion?: number;
}

const serverDefaults = {
  name: "workflow-cannon",
  version: "0.99.28"
};

const TOOL_DESCRIPTION_CONTRACT_VERSION = 1;
const DESCRIPTION_COMMON_MISTAKE_LIMIT = 2;
const AGENT_START_TOOL_NAME = "workflow-cannon.agent_start";
const CAPABILITIES_TOOL_NAME = "workflow-cannon.capabilities";
const AGENT_START_BYTE_BUDGET = 6 * 1024;
const PHASE_RELEASE_ORCHESTRATION_TOOL_NAME = "workflow-cannon.phase-release-orchestration-state";

/**
 * Freshness policy injected into every tool result envelope. Authority is
 * always "live" — the command is executed against current workspace state at
 * call time. Agents must re-invoke to get updated state.
 */
const TOOL_FRESHNESS_POLICY: { authority: "live"; note: string; cliFallbackNote: string } = {
  authority: "live",
  note: "Tool results reflect current workspace state computed at call time. Re-invoke to get updated state. Do not treat a prior result as current state.",
  cliFallbackNote: "See expansionRefs for the equivalent CLI command."
};

/**
 * Static resource definitions exposed via resources/list and resources/read.
 * These are documentation and policy artifacts — not live state.
 */
const STATIC_RESOURCE_DEFINITIONS: McpStaticResourceDefinition[] = [
  {
    uri: "workflow-cannon://resources/mcp-freshness-policy",
    name: "MCP Resource Freshness and Cache Policy",
    description:
      "Cache policy and authority rules for MCP tools and resources. Defines the tool/resource boundary and freshness requirements.",
    mimeType: "text/markdown",
    workspaceRelativePath: ".ai/mcp-resource-freshness-policy.md",
    cachePolicy: {
      authority: "static",
      maxAgeSeconds: 86400,
      note: "Static policy document. Content changes on repository commits only. Safe to cache for the duration of a session."
    }
  },
  {
    uri: "workflow-cannon://resources/mcp-adapter-boundary",
    name: "MCP Adapter Boundary ADR",
    description:
      "ADR defining the MCP adapter boundary, read-only-first scope, and mutation policy.",
    mimeType: "text/markdown",
    workspaceRelativePath: ".ai/adrs/ADR-mcp-adapter-boundary-v1.md",
    cachePolicy: {
      authority: "static",
      maxAgeSeconds: 86400,
      note: "Static ADR. Content changes on repository commits only. Safe to cache for the duration of a session."
    }
  }
];

/**
 * Version of the MCP tool output envelope schema. Increment when the envelope
 * shape changes in a breaking way. Test harnesses should assert this equals
 * MCP_ENVELOPE_SCHEMA_VERSION to catch drift early.
 */
export const MCP_ENVELOPE_SCHEMA_VERSION = 1;

/**
 * Default per-tool output contract version. Individual tools may declare a
 * higher toolSchemaVersion to signal a breaking change in their result shape.
 */
export const MCP_DEFAULT_TOOL_SCHEMA_VERSION = 1;

const packetReadTools: ReadOnlyMcpToolDefinition[] = [
  {
    toolName: "workflow-cannon.phase-release-orchestration-state",
    commandName: "phase-release-orchestration-state",
    description: "Read the Phase release orchestration verdict packet.",
    cliFallbackArgs:
      '{"phaseKey":"<phase>","scope":"bucket","integrationBranch":"release/phase-<phase>","dashboardAuthorization":"complete-and-release"}',
    commonMistakes: [
      "omitting phaseKey",
      "treating a tasks-remaining verdict as release approval"
    ],
    inputSchema: objectSchema({
      phaseKey: stringSchema("Target phase key."),
      scope: enumSchema(["bucket", "phase"], "Release orchestration scope."),
      integrationBranch: stringSchema("Expected integration branch."),
      dashboardAuthorization: stringSchema("Dashboard authorization mode.")
    }, ["phaseKey"]),
    expansionArgs: (args) => ({
      phaseKey: args.phaseKey,
      ...(typeof args.scope === "string" ? { scope: args.scope } : {}),
      ...(typeof args.integrationBranch === "string" ? { integrationBranch: args.integrationBranch } : {}),
      ...(typeof args.dashboardAuthorization === "string"
        ? { dashboardAuthorization: args.dashboardAuthorization }
        : {})
    }),
    validateArgs: requireStringArgs("phaseKey")
  },
  {
    toolName: "workflow-cannon.agent-execution-packet",
    commandName: "agent-execution-packet",
    description: "Read a draft or locked agent execution packet.",
    cliFallbackArgs: '{"mode":"draft","taskId":"<task>","phaseKey":"<phase>"}',
    commonMistakes: [
      "implementing from a draft packet",
      "mixing draft task fields with assignmentId"
    ],
    inputSchema: objectSchema({
      mode: enumSchema(["draft", "assignment"], "Packet mode."),
      taskId: stringSchema("Task id for draft packets."),
      phaseKey: stringSchema("Phase key for draft packets."),
      assignmentId: stringSchema("Assignment id for locked packets.")
    }, ["mode"]),
    expansionArgs: (args) => ({
      mode: args.mode,
      ...(typeof args.taskId === "string" ? { taskId: args.taskId } : {}),
      ...(typeof args.phaseKey === "string" ? { phaseKey: args.phaseKey } : {}),
      ...(typeof args.assignmentId === "string" ? { assignmentId: args.assignmentId } : {})
    }),
    validateArgs: (args) => {
      if (args.mode === "draft") {
        return requireStringArgs("taskId", "phaseKey")(args);
      }
      if (args.mode === "assignment") {
        return requireStringArgs("assignmentId")(args);
      }
      return "mode must be 'draft' or 'assignment'";
    }
  },
  {
    toolName: "workflow-cannon.assignment-reconciliation-preflight",
    commandName: "assignment-reconciliation-preflight",
    description: "Read reconciliation readiness for a submitted assignment handoff.",
    cliFallbackArgs: '{"assignmentId":"<assignment>","supervisorId":"<supervisor>"}',
    commonMistakes: [
      "running before handoff submission",
      "ignoring outside-owned path findings"
    ],
    inputSchema: objectSchema({
      assignmentId: stringSchema("Assignment id."),
      supervisorId: stringSchema("Supervisor id.")
    }, ["assignmentId", "supervisorId"]),
    expansionArgs: (args) => ({
      assignmentId: args.assignmentId,
      supervisorId: args.supervisorId
    }),
    validateArgs: requireStringArgs("assignmentId", "supervisorId")
  },
  {
    toolName: "workflow-cannon.phase-drain-delta",
    commandName: "phase-drain-delta",
    description: "Read bounded phase drain delta evidence.",
    cliFallbackArgs: '{"phaseKey":"<phase>"}',
    commonMistakes: [
      "continuing after full-refresh recommendation",
      "reusing a stale cursor"
    ],
    inputSchema: objectSchema({
      phaseKey: stringSchema("Target phase key."),
      cursor: stringSchema("Optional drain cursor.")
    }, ["phaseKey"]),
    expansionArgs: (args) => ({
      phaseKey: args.phaseKey,
      ...(typeof args.cursor === "string" ? { cursor: args.cursor } : {})
    }),
    validateArgs: requireStringArgs("phaseKey")
  },
  {
    toolName: "workflow-cannon.phase-release-state",
    commandName: "phase-release-state",
    description: "Read release state for a phase.",
    cliFallbackArgs: '{"phaseKey":"<phase>"}',
    commonMistakes: [
      "confusing release state with closeout approval",
      "omitting phaseKey"
    ],
    inputSchema: objectSchema({
      phaseKey: stringSchema("Target phase key.")
    }, ["phaseKey"]),
    expansionArgs: (args) => ({
      phaseKey: args.phaseKey
    }),
    validateArgs: requireStringArgs("phaseKey")
  },
  {
    toolName: "workflow-cannon.release-closeout-result",
    commandName: "release-closeout-result",
    description: "Read release closeout result evidence for a phase.",
    cliFallbackArgs: '{"phaseKey":"<phase>"}',
    commonMistakes: [
      "using stale closeout evidence after task changes",
      "treating missing artifacts as warnings"
    ],
    inputSchema: objectSchema({
      phaseKey: stringSchema("Target phase key.")
    }, ["phaseKey"]),
    expansionArgs: (args) => ({
      phaseKey: args.phaseKey
    }),
    validateArgs: requireStringArgs("phaseKey")
  },
  {
    toolName: "workflow-cannon.cae-guidance-preview",
    commandName: "cae-guidance-preview",
    description: "Read bounded CAE guidance cards for task or workflow context.",
    cliFallbackArgs: '{"taskId":"<task>"}',
    commonMistakes: [
      "treating guidance as policy approval",
      "requesting broad unscoped guidance when task context is known"
    ],
    inputSchema: passthroughObjectSchema({
      taskId: stringSchema("Optional task id to scope guidance."),
      workflowName: stringSchema("Optional workflow name to scope guidance."),
      commandName: stringSchema("Optional command name to scope guidance.")
    }),
    expansionArgs: identityArgs,
    governance: {
      bounded: true,
      note: "CAE guidance is returned through the read-only command runtime and remains bounded by the CAE preview/evaluation contract.",
      sourceRefs: [
        "src/modules/context-activation/instructions/cae-guidance-preview.md",
        "src/modules/context-activation/instructions/cae-evaluate.md"
      ]
    }
  },
  {
    toolName: "workflow-cannon.cae-evaluate",
    commandName: "cae-evaluate",
    description: "Read a CAE effective activation bundle and trace for an evaluation context.",
    cliFallbackArgs: '{"evaluationContext":{"command":{"name":"<command>"}}}',
    commonMistakes: [
      "passing raw policyApproval or secret values",
      "treating shadow observations as enforced denials"
    ],
    inputSchema: passthroughObjectSchema({
      evaluationContext: objectPropertySchema("CAE evaluation context.")
    }),
    expansionArgs: identityArgs,
    governance: {
      bounded: true,
      note: "CAE evaluation is exposed as a read-only trace/bundle lookup and does not mutate CAE registry state.",
      sourceRefs: [
        "src/modules/context-activation/instructions/cae-evaluate.md",
        "src/modules/context-activation/instructions/cae-get-trace.md"
      ]
    }
  },
  {
    toolName: "workflow-cannon.cae-explain",
    commandName: "cae-explain",
    description: "Read an explanation for a CAE trace or evaluation.",
    cliFallbackArgs: '{"traceId":"<trace>"}',
    commonMistakes: [
      "expecting explanation text to be a stable API",
      "omitting both traceId and replay context"
    ],
    inputSchema: passthroughObjectSchema({
      traceId: stringSchema("Optional CAE trace id."),
      activationId: stringSchema("Optional CAE activation id.")
    }),
    expansionArgs: identityArgs,
    governance: {
      bounded: true,
      note: "CAE explain is read-only and bounded to trace/evaluation explanation data.",
      sourceRefs: [
        "src/modules/context-activation/instructions/cae-explain.md",
        "src/modules/context-activation/instructions/cae-get-trace.md"
      ]
    }
  },
  {
    toolName: "workflow-cannon.cae-get-trace",
    commandName: "cae-get-trace",
    description: "Read one CAE trace by id.",
    cliFallbackArgs: '{"traceId":"<trace>"}',
    commonMistakes: [
      "using a trace from another workspace",
      "assuming ephemeral traces are durable"
    ],
    inputSchema: objectSchema({
      traceId: stringSchema("CAE trace id.")
    }, ["traceId"]),
    expansionArgs: (args) => ({ traceId: args.traceId }),
    validateArgs: requireStringArgs("traceId"),
    governance: {
      bounded: true,
      note: "CAE trace lookup is read-only and returns persisted or ephemeral trace evidence without registry mutation.",
      sourceRefs: ["src/modules/context-activation/instructions/cae-get-trace.md"]
    }
  },
  {
    toolName: "workflow-cannon.cae-recent-traces",
    commandName: "cae-recent-traces",
    description: "Read recent durable CAE trace summaries.",
    cliFallbackArgs: '{"limit":10}',
    commonMistakes: [
      "using recent traces as task truth",
      "requesting unbounded trace history"
    ],
    inputSchema: passthroughObjectSchema({
      limit: numberSchema("Optional max trace count.")
    }),
    expansionArgs: identityArgs,
    governance: {
      bounded: true,
      note: "Recent CAE trace summaries are read-only operational evidence.",
      sourceRefs: ["src/modules/context-activation/instructions/cae-recent-traces.md"]
    }
  },
  {
    toolName: "workflow-cannon.memory-list",
    commandName: "list-memory",
    description: "Read governed project-memory records with source and status metadata.",
    cliFallbackArgs: '{"status":"approved"}',
    commonMistakes: [
      "treating memory as current task state",
      "expecting write, approve, or prune through MCP"
    ],
    inputSchema: objectSchema({
      status: enumSchema(["draft", "approved", "pruned"], "Optional governed memory status filter."),
      category: stringSchema("Optional memory category filter.")
    }, []),
    expansionArgs: (args) => ({
      ...(typeof args.status === "string" ? { status: args.status } : {}),
      ...(typeof args.category === "string" ? { category: args.category } : {})
    }),
    governance: {
      bounded: true,
      note: "Memory recall is limited to governed list-memory reads; write, approve, and prune memory commands are not exposed through MCP.",
      sourceRefs: [
        "src/modules/project-memory/instructions/list-memory.md",
        "src/modules/project-memory/instructions/explain-memory-precedence.md",
        "src/modules/project-memory/index.ts"
      ]
    }
  },
  {
    toolName: "workflow-cannon.memory-precedence",
    commandName: "explain-memory-precedence",
    description: "Read the governance precedence model for project memory.",
    cliFallbackArgs: "{}",
    commonMistakes: [
      "letting memory override policy or source-of-truth docs",
      "using precedence output as live task evidence"
    ],
    inputSchema: objectSchema({}, []),
    expansionArgs: () => ({}),
    governance: {
      bounded: true,
      note: "Memory precedence is source-cited so agents can distinguish governed memory from policy, canon, and docs.",
      sourceRefs: [
        "src/modules/project-memory/instructions/explain-memory-precedence.md",
        "src/modules/project-memory/index.ts"
      ]
    }
  }
];

const toolDefinitionsByName = new Map(packetReadTools.map((tool) => [tool.toolName, tool]));

function formatMcpToolDescription(input: {
  description: string;
  commandName: string;
  cliFallbackArgs?: string;
  commonMistakes: string[];
}): string {
  const fallbackArgs = input.cliFallbackArgs ?? "{}";
  const fallbackCommand =
    fallbackArgs.length > 0
      ? `pnpm exec wk run ${input.commandName} '${fallbackArgs}'`
      : `pnpm exec wk run ${input.commandName}`;
  const mistakes = input.commonMistakes.slice(0, DESCRIPTION_COMMON_MISTAKE_LIMIT).join("; ");
  return [
    input.description,
    `CLI fallback: ${fallbackCommand}.`,
    `Common mistakes: ${mistakes}.`
  ].join(" ");
}

function agentStartToolDescription(): string {
  return formatMcpToolDescription({
    description:
      "Bootstrap Workflow Cannon MCP: read-only mode, tool availability, and workflow-specific next steps.",
    commandName: "agent-bootstrap",
    cliFallbackArgs: '{"projection":"lean"}',
    commonMistakes: [
      "skipping agent_start on cold start",
      "assuming agent_start enables mutation or replaces capabilities for full tool metadata"
    ]
  });
}

function capabilitiesToolDescription(): string {
  return formatMcpToolDescription({
    description: "Describe the read-only Workspace Kit MCP surface and descriptor contract.",
    commandName: "--list-commands",
    cliFallbackArgs: "",
    commonMistakes: [
      "assuming capabilities enable mutation",
      "skipping CLI fallback when MCP is unavailable"
    ]
  });
}

function listBootstrapMcpToolDescriptors(): McpToolDescriptor[] {
  return [
    {
      name: AGENT_START_TOOL_NAME,
      description: agentStartToolDescription(),
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: CAPABILITIES_TOOL_NAME,
      description: capabilitiesToolDescription(),
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  ];
}

export function listReadOnlyMcpTools(): McpToolDescriptor[] {
  return [
    ...listBootstrapMcpToolDescriptors(),
    ...packetReadTools.map((tool) => ({
      name: tool.toolName,
      description: formatMcpToolDescription(tool),
      inputSchema: tool.inputSchema
    }))
  ];
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
  options: McpServerOptions = {}
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;

  if (!("id" in request)) {
    return null;
  }

  if (request.jsonrpc !== JSON_RPC_VERSION || typeof request.method !== "string") {
    return errorResponse(id, -32600, "Invalid Request");
  }

  switch (request.method) {
    case "initialize":
      const workspaceBinding = resolveMcpWorkspaceBinding(options);
      return successResponse(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {}
        },
        startup: {
          schemaVersion: 1,
          healthy: true,
          mode: "read-only",
          mutationToolsEnabled: false,
          workspaceBinding
        },
        serverInfo: {
          name: options.name ?? serverDefaults.name,
          version: options.version ?? serverDefaults.version
        }
      });

    case "tools/list":
      return successResponse(id, {
        tools: listReadOnlyMcpTools()
      });

    case "tools/call":
      return handleToolCall(id, request.params, options);

    case "resources/list":
      return handleResourcesList(id);

    case "resources/read":
      return handleResourceRead(id, request.params, options);

    default:
      return errorResponse(id, -32601, `Method not found: ${request.method}`);
  }
}

export async function runMcpStdioServer(options: McpServerOptions = {}): Promise<void> {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of input) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const response = await handleJsonLine(trimmed, options);
    if (response) {
      writeJsonResponse(process.stdout, response);
    }
  }
}

async function handleJsonLine(
  line: string,
  options: McpServerOptions
): Promise<JsonRpcResponse | null> {
  try {
    const parsed = JSON.parse(line) as JsonRpcRequest;
    return await handleMcpRequest(parsed, options);
  } catch {
    return errorResponse(null, -32700, "Parse error");
  }
}

async function handleAgentStartToolCall(id: JsonRpcId, options: McpServerOptions): Promise<JsonRpcResponse> {
  const workspaceBinding = resolveMcpWorkspaceBinding(options);
  let sessionSummary: Record<string, unknown> | undefined;
  try {
    const runtime = options.runtime ?? createDefaultMcpRuntime(options);
    const bootstrapResult = await runtime.invoke({
      name: "agent-bootstrap",
      args: { projection: "lean" }
    });
    if (bootstrapResult.ok && bootstrapResult.data) {
      sessionSummary = summarizeAgentBootstrapData(bootstrapResult.data);
    }
  } catch {
    sessionSummary = undefined;
  }

  const payload = buildAgentStartPayload(workspaceBinding, sessionSummary);
  const text = JSON.stringify(payload, null, 2);
  const byteBudget = AGENT_START_BYTE_BUDGET;
  const oversized = Buffer.byteLength(text, "utf8") > byteBudget;

  recordAuditEvent(options, AGENT_START_TOOL_NAME, "success", {
    command: "agent-bootstrap",
    mutationToolsEnabled: false,
    workspaceRoot: workspaceBinding.workspaceRoot,
    oversized
  });

  return successResponse(id, {
    content: [{ type: "text", text }],
    isError: false
  });
}

function handleCapabilitiesToolCall(id: JsonRpcId, options: McpServerOptions): JsonRpcResponse {
  const workspaceBinding = resolveMcpWorkspaceBinding(options);
  recordAuditEvent(options, CAPABILITIES_TOOL_NAME, "success", {
    command: "capabilities",
    mutationToolsEnabled: false,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  return successResponse(id, {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            schemaVersion: MCP_ENVELOPE_SCHEMA_VERSION,
            toolVersion: MCP_DEFAULT_TOOL_SCHEMA_VERSION,
            mode: "read-only",
            mutationToolsEnabled: false,
            startup: {
              healthy: true,
              workspaceBinding
            },
            auditLogging: {
              bounded: true,
              redacted: true
            },
            toolDescriptionContract: {
              schemaVersion: TOOL_DESCRIPTION_CONTRACT_VERSION,
              requiredSegments: ["description", "CLI fallback", "Common mistakes"]
            },
            versionContract: {
              envelopeSchemaVersion: MCP_ENVELOPE_SCHEMA_VERSION,
              defaultToolSchemaVersion: MCP_DEFAULT_TOOL_SCHEMA_VERSION,
              policy: ".ai/mcp-tool-version-policy.md"
            },
            tools: listReadOnlyMcpTools().map((tool) => tool.name),
            resources: listReadOnlyMcpResources().map((r) => ({
              uri: r.uri,
              name: r.name,
              cachePolicy: r.cachePolicy
            })),
            resourceFreshnessPolicy: {
              schemaVersion: 1,
              authorityLevels: {
                live: "Tool results reflect current workspace state at call time. Not safe to cache across turns.",
                static:
                  "Resource documents change only on repository commits. Safe to cache for a session.",
                advisory:
                  "Memory and summary results are not authoritative for task/release state without CLI confirmation."
              },
              stateAuthorityRule:
                "State-like tool results carry authority:'live' and must be re-invoked for current state. Resources carry authority:'static' and are documentation only.",
              workspace: buildWorkspaceFreshness(workspaceBinding)
            },
            byteBudget: resolveToolResponseByteBudget(options)
          },
          null,
          2
        )
      }
    ],
    isError: false
  });
}

export function listReadOnlyMcpResources(): McpResourceDescriptor[] {
  return STATIC_RESOURCE_DEFINITIONS.map(({ uri, name, description, mimeType, cachePolicy }) => ({
    uri,
    name,
    description,
    mimeType,
    cachePolicy
  }));
}

function handleResourcesList(id: JsonRpcId): JsonRpcResponse {
  return successResponse(id, {
    resources: listReadOnlyMcpResources()
  });
}

function handleResourceRead(
  id: JsonRpcId,
  params: unknown,
  options: McpServerOptions
): JsonRpcResponse {
  const resourceParams = params as Record<string, unknown> | null | undefined;
  const uri = typeof resourceParams?.uri === "string" ? resourceParams.uri : null;

  if (!uri) {
    return errorResponse(id, -32602, "uri is required");
  }

  const definition = STATIC_RESOURCE_DEFINITIONS.find((r) => r.uri === uri);
  if (!definition) {
    return errorResponse(id, -32602, `Unknown resource: ${uri}`);
  }

  const workspaceBinding = resolveMcpWorkspaceBinding(options);
  const boundPath = resolveWorkspaceBoundPath(
    workspaceBinding.workspaceRoot,
    definition.workspaceRelativePath
  );
  if (!boundPath.ok) {
    return errorResponse(id, -32603, `Resource path blocked by workspace boundary: ${uri}`);
  }

  let text: string;
  try {
    text = readFileSync(boundPath.absolutePath, "utf8");
  } catch {
    return errorResponse(id, -32603, `Resource unavailable: ${uri}`);
  }

  return successResponse(id, {
    contents: [
      {
        uri,
        mimeType: definition.mimeType,
        text
      }
    ],
    freshnessEnvelope: {
      schemaVersion: 1,
      authority: definition.cachePolicy.authority,
      fetchedAt: new Date().toISOString(),
      cachePolicy: definition.cachePolicy,
      workspace: buildWorkspaceFreshness(workspaceBinding),
      authorityNote:
        "This resource is a static documentation artifact. It is not authoritative for current task, assignment, release, or queue state."
    }
  });
}

function buildAgentStartPayload(
  workspaceBinding: McpWorkspaceBinding,
  sessionSummary?: Record<string, unknown>
): Record<string, unknown> {
  const tools = listReadOnlyMcpTools().map((tool) => tool.name);
  return {
    schemaVersion: MCP_ENVELOPE_SCHEMA_VERSION,
    toolVersion: MCP_DEFAULT_TOOL_SCHEMA_VERSION,
    tool: AGENT_START_TOOL_NAME,
    mode: "read-only",
    mutationToolsEnabled: false,
    readOnlyToolsOnly: true,
    toolsAvailable: tools,
    recommendedNextTool: CAPABILITIES_TOOL_NAME,
    workflowRecommendations: [
      {
        workflowId: "complete-and-release",
        label: "Complete and Release",
        recommendedMcpTool: PHASE_RELEASE_ORCHESTRATION_TOOL_NAME,
        recommendedCliCommand:
          "pnpm exec wk run phase-release-orchestration-state '{\"phaseKey\":\"<phase>\",\"scope\":\"current\",\"integrationBranch\":\"release/phase-<phase>\",\"dashboardAuthorization\":\"complete-and-release\"}'",
        rationale:
          "Classify the phase release path (verdict, refs, publish safety) before drain, closeout, or publish work."
      },
      {
        workflowId: "task-worker",
        label: "Task worker delivery",
        recommendedMcpTool: "workflow-cannon.agent-execution-packet",
        recommendedCliCommand:
          "pnpm exec wk run agent-execution-packet '{\"mode\":\"draft\",\"taskId\":\"<task>\",\"phaseKey\":\"<phase>\"}'",
        rationale: "Fetch a locked assignment packet or draft packet before implementation."
      }
    ],
    cliFallback: {
      command: "pnpm exec wk run agent-bootstrap '{}'",
      leanProjection: "pnpm exec wk run agent-bootstrap '{\"projection\":\"lean\"}'"
    },
    startup: {
      healthy: true,
      workspaceBinding
    },
    byteBudget: AGENT_START_BYTE_BUDGET,
    ...(sessionSummary ? { session: sessionSummary } : {})
  };
}

function summarizeAgentBootstrapData(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    return {};
  }
  const record = data as Record<string, unknown>;
  const suggestedNext =
    typeof record.suggestedNext === "object" && record.suggestedNext !== null
      ? (record.suggestedNext as Record<string, unknown>)
      : null;
  return {
    planningGeneration: record.planningGeneration ?? null,
    planningGenerationPolicy: record.planningGenerationPolicy ?? null,
    suggestedNext: suggestedNext
      ? {
          id: suggestedNext.id ?? null,
          title: suggestedNext.title ?? null,
          status: suggestedNext.status ?? null
        }
      : null,
    phase: record.phase ?? null,
    queueHealth: record.queueHealth ?? null
  };
}

async function handleToolCall(
  id: JsonRpcId,
  params: unknown,
  options: McpServerOptions
): Promise<JsonRpcResponse> {
  if (!isToolCallParams(params)) {
    recordAuditEvent(options, "<invalid-tool-call>", "protocol_error", {
      reason: "invalid-params"
    });
    return errorResponse(id, -32602, "Invalid params");
  }

  if (params.name === AGENT_START_TOOL_NAME) {
    return handleAgentStartToolCall(id, options);
  }

  if (params.name === CAPABILITIES_TOOL_NAME) {
    return handleCapabilitiesToolCall(id, options);
  }

  const definition = toolDefinitionsByName.get(params.name);
  if (!definition) {
    recordAuditEvent(options, params.name, "rejected", {
      reason: "unknown-tool",
      mutationToolsEnabled: false
    });
    return errorResponse(id, -32602, `Unknown tool: ${params.name}`);
  }

  const args = toRecord(params.arguments);
  const validationError = definition.validateArgs?.(args);
  if (validationError) {
    recordAuditEvent(options, params.name, "rejected", {
      reason: "invalid-arguments",
      message: validationError,
      args
    });
    return errorResponse(id, -32602, validationError);
  }

  const commandArgs = definition.expansionArgs(args);
  const runtime = options.runtime ?? createDefaultMcpRuntime(options);
  const commandResult = await runtime.invoke({
    name: definition.commandName,
    args: commandArgs
  });
  const toolResult = formatToolResult(definition, commandArgs, commandResult, options);
  recordAuditEvent(options, params.name, commandResult.ok ? "success" : "command_error", {
    command: definition.commandName,
    args: commandArgs,
    resultCode: commandResult.code,
    oversized: isOversizedToolResult(toolResult),
    byteBudget: resolveToolResponseByteBudget(options)
  });
  return successResponse(id, toolResult);
}

function createDefaultMcpRuntime(options: McpServerOptions): ModuleCommandRuntime {
  const registry = new ModuleRegistry(defaultRegistryModules);
  const workspaceBinding = resolveMcpWorkspaceBinding(options);
  return createCommandRegistryRuntime(registry, {
    ctx: {
      runtimeVersion: "0.1",
      workspacePath: workspaceBinding.workspaceRoot,
      moduleRegistry: registry
    }
  });
}

export function isPathWithinWorkspaceRoot(workspaceRoot: string, candidatePath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveWorkspaceBoundPath(
  workspaceRoot: string,
  relativePath: string
): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  const trimmed = relativePath.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty-path" };
  }
  if (path.isAbsolute(trimmed)) {
    return { ok: false, reason: "absolute-path-not-allowed" };
  }
  const root = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(root, trimmed);
  if (!isPathWithinWorkspaceRoot(root, absolutePath)) {
    return { ok: false, reason: "path-escapes-workspace-root" };
  }
  return { ok: true, absolutePath };
}

export function buildWorkspaceFreshness(binding: McpWorkspaceBinding): McpWorkspaceFreshness {
  return {
    schemaVersion: 1,
    workspaceRoot: binding.workspaceRoot,
    workspaceTrusted: binding.workspaceTrusted,
    workspaceTrustReason: binding.workspaceTrustReason,
    pathBoundaryEnforced: true,
    bindingSource: binding.bindingSource,
    multiWorkspaceBehavior: binding.multiWorkspaceBehavior
  };
}

export function resolveMcpWorkspaceBinding(options: McpServerOptions = {}): McpWorkspaceBinding {
  const rawWorkspacePath = options.workspacePath ?? process.cwd();
  const workspaceRoot = path.resolve(rawWorkspacePath);
  const trust = assessWorkspaceTrust(workspaceRoot);
  return {
    schemaVersion: 1,
    workspaceRoot,
    workspaceTrusted: trust.trusted,
    workspaceTrustReason: trust.reason,
    pathBoundaryEnforced: true,
    bindingSource: options.workspacePath ? "option" : "cwd",
    launchCommands: {
      packageBin: "pnpm exec wk-mcp --workspace <workspace-root>",
      builtDist: "node dist/mcp/cli.js --workspace <workspace-root>"
    },
    multiWorkspaceBehavior: {
      mode: "single-workspace-per-process",
      multiRootSupported: false,
      contract:
        "Each MCP server process binds to exactly one workspaceRoot at startup and serves reads for that workspace only. Multi-root editor workspaces require one wk-mcp process per root folder.",
      recommendation:
        "Launch one wk-mcp process per workspace/root; do not share one process across multiple workspace folders."
    }
  };
}

function assessWorkspaceTrust(workspaceRoot: string): { trusted: boolean; reason: string } {
  if (!existsSync(workspaceRoot)) {
    return { trusted: false, reason: "workspace-root-missing" };
  }
  let stat;
  try {
    stat = statSync(workspaceRoot);
  } catch {
    return { trusted: false, reason: "workspace-root-unreadable" };
  }
  if (!stat.isDirectory()) {
    return { trusted: false, reason: "workspace-root-not-directory" };
  }
  if (existsSync(path.join(workspaceRoot, ".workspace-kit"))) {
    return { trusted: true, reason: "workspace-kit-present" };
  }
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.includes("workflow-cannon")) {
        return { trusted: true, reason: "workflow-cannon-package" };
      }
    } catch {
      return { trusted: false, reason: "package-json-unreadable" };
    }
  }
  return { trusted: false, reason: "workflow-cannon-markers-missing" };
}

function formatToolResult(
  definition: ReadOnlyMcpToolDefinition,
  args: Record<string, unknown>,
  result: ModuleCommandResult,
  options: McpServerOptions
): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const toolVersion = definition.toolSchemaVersion ?? MCP_DEFAULT_TOOL_SCHEMA_VERSION;
  const workspaceBinding = resolveMcpWorkspaceBinding(options);
  const fullEnvelope = {
    schemaVersion: MCP_ENVELOPE_SCHEMA_VERSION,
    toolVersion,
    mode: "read-only",
    mutationToolsEnabled: false,
    tool: definition.toolName,
    command: definition.commandName,
    args,
    ...(definition.governance ? { governance: definition.governance } : {}),
    freshnessPolicy: {
      ...TOOL_FRESHNESS_POLICY,
      workspace: buildWorkspaceFreshness(workspaceBinding)
    },
    result
  };
  const fullText = JSON.stringify(fullEnvelope, null, 2);
  const byteBudget = resolveToolResponseByteBudget(options);
  if (Buffer.byteLength(fullText, "utf8") <= byteBudget) {
    return {
      content: [{ type: "text", text: fullText }],
      isError: !result.ok
    };
  }

  const compactEnvelope = {
    schemaVersion: MCP_ENVELOPE_SCHEMA_VERSION,
    toolVersion,
    mode: "read-only",
    mutationToolsEnabled: false,
    tool: definition.toolName,
    command: definition.commandName,
    args,
    ...(definition.governance ? { governance: definition.governance } : {}),
    freshnessPolicy: {
      ...TOOL_FRESHNESS_POLICY,
      workspace: buildWorkspaceFreshness(workspaceBinding)
    },
    oversized: true,
    byteBudget,
    actualBytes: Buffer.byteLength(fullText, "utf8"),
    resultSummary: summarizeCommandResult(result),
    expansionRefs: [
      {
        kind: "cli",
        command: `pnpm exec wk run ${definition.commandName} '${JSON.stringify(args)}'`
      }
    ]
  };
  return {
    content: [{ type: "text", text: JSON.stringify(compactEnvelope, null, 2) }],
    isError: !result.ok
  };
}

function isOversizedToolResult(result: { content: Array<{ type: "text"; text: string }> }): boolean {
  const text = result.content.at(0)?.text;
  if (!text) {
    return false;
  }
  try {
    return JSON.parse(text).oversized === true;
  } catch {
    return false;
  }
}

function summarizeCommandResult(result: ModuleCommandResult): Record<string, unknown> {
  return {
    ok: result.ok,
    code: result.code,
    message: result.message
  };
}

function resolveToolResponseByteBudget(options: McpServerOptions): number {
  return Math.max(1_000, options.maxToolResponseBytes ?? DEFAULT_TOOL_RESPONSE_BYTE_BUDGET);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function identityArgs(args: Record<string, unknown>): Record<string, unknown> {
  return { ...args };
}

function requireStringArgs(...names: string[]): (args: Record<string, unknown>) => string | null {
  return (args) => {
    for (const name of names) {
      if (typeof args[name] !== "string" || args[name].trim().length === 0) {
        return `${name} is required`;
      }
    }
    return null;
  };
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[]
): McpToolDescriptor["inputSchema"] {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  } as McpToolDescriptor["inputSchema"];
}

function passthroughObjectSchema(properties: Record<string, unknown>): McpToolDescriptor["inputSchema"] {
  return {
    type: "object",
    properties,
    additionalProperties: true
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return {
    type: "string",
    description
  };
}

function enumSchema(values: string[], description: string): Record<string, unknown> {
  return {
    type: "string",
    enum: values,
    description
  };
}

function numberSchema(description: string): Record<string, unknown> {
  return {
    type: "number",
    description
  };
}

function objectPropertySchema(description: string): Record<string, unknown> {
  return {
    type: "object",
    description
  };
}

function isToolCallParams(value: unknown): value is { name: string; arguments?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function recordAuditEvent(
  options: McpServerOptions,
  toolName: string,
  resultClassification: McpAuditResultClassification,
  metadata: Record<string, unknown>
): void {
  const event: McpAuditEvent = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    toolName,
    resultClassification,
    metadata: redactAuditValue(metadata) as Record<string, unknown>
  };
  options.auditLog?.push(event);
  options.auditSink?.(event);
}

function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[redacted:depth-limit]";
  }
  if (Array.isArray(value)) {
    const entries = value.slice(0, MAX_AUDIT_METADATA_ARRAY_LENGTH).map((entry) => redactAuditValue(entry, depth + 1));
    if (value.length > MAX_AUDIT_METADATA_ARRAY_LENGTH) {
      entries.push(`[redacted:${value.length - MAX_AUDIT_METADATA_ARRAY_LENGTH}:additional-items]`);
    }
    return entries;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_AUDIT_METADATA_OBJECT_KEYS);
    for (const [key, entry] of entries) {
      out[key] = isSensitiveAuditKey(key) ? "[redacted]" : redactAuditValue(entry, depth + 1);
    }
    const totalKeys = Object.keys(value as Record<string, unknown>).length;
    if (totalKeys > MAX_AUDIT_METADATA_OBJECT_KEYS) {
      out.__truncatedKeys = totalKeys - MAX_AUDIT_METADATA_OBJECT_KEYS;
    }
    return out;
  }
  if (typeof value === "string") {
    if (isSecretShapedAuditString(value)) {
      return "[redacted]";
    }
    if (value.length > MAX_AUDIT_METADATA_STRING_LENGTH) {
      return `${value.slice(0, MAX_AUDIT_METADATA_STRING_LENGTH)}...[redacted:${value.length - MAX_AUDIT_METADATA_STRING_LENGTH}:additional-chars]`;
    }
  }
  return value;
}

function isSensitiveAuditKey(key: string): boolean {
  return /token|secret|password|credential|authorization|api[-_]?key|policyApproval/i.test(key);
}

function isSecretShapedAuditString(value: string): boolean {
  return (
    /(?:bearer|token|secret|password)\s+[a-z0-9._-]{12,}/i.test(value) ||
    /sk-[a-z0-9]{16,}/i.test(value) ||
    /gh[pousr]_[a-z0-9_]{20,}/i.test(value)
  );
}

function successResponse(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result
  };
}

function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcErrorResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code,
      message
    }
  };
}

function writeJsonResponse(output: Writable, response: JsonRpcResponse): void {
  output.write(`${JSON.stringify(response)}\n`);
}
