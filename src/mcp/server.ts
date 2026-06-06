import { createInterface } from "node:readline";
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

export type McpAuditResultClassification = "success" | "command_error" | "protocol_error" | "rejected";

export interface McpAuditEvent {
  schemaVersion: 1;
  timestamp: string;
  toolName: string;
  resultClassification: McpAuditResultClassification;
  metadata: Record<string, unknown>;
}

interface ReadOnlyMcpToolDefinition {
  toolName: string;
  commandName: string;
  description: string;
  inputSchema: McpToolDescriptor["inputSchema"];
  expansionArgs: (args: Record<string, unknown>) => Record<string, unknown>;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  governance?: {
    bounded?: boolean;
    note: string;
    sourceRefs: string[];
  };
}

const serverDefaults = {
  name: "workflow-cannon",
  version: "0.99.28"
};

const packetReadTools: ReadOnlyMcpToolDefinition[] = [
  {
    toolName: "workflow-cannon.phase-release-orchestration-state",
    commandName: "phase-release-orchestration-state",
    description: "Read the Phase release orchestration verdict packet.",
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

export function listReadOnlyMcpTools(): McpToolDescriptor[] {
  return [
    {
      name: "workflow-cannon.capabilities",
      description: "Describe the read-only Workspace Kit MCP surface.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    ...packetReadTools.map((tool) => ({
      name: tool.toolName,
      description: tool.description,
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
      return successResponse(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
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

  if (params.name === "workflow-cannon.capabilities") {
    recordAuditEvent(options, params.name, "success", {
      command: "capabilities",
      mutationToolsEnabled: false
    });
    return successResponse(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              mode: "read-only",
              mutationToolsEnabled: false,
              auditLogging: {
                bounded: true,
                redacted: true
              },
              tools: listReadOnlyMcpTools().map((tool) => tool.name),
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
  return createCommandRegistryRuntime(registry, {
    ctx: {
      runtimeVersion: "0.1",
      workspacePath: options.workspacePath ?? process.cwd(),
      moduleRegistry: registry
    }
  });
}

function formatToolResult(
  definition: ReadOnlyMcpToolDefinition,
  args: Record<string, unknown>,
  result: ModuleCommandResult,
  options: McpServerOptions
): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const fullEnvelope = {
    schemaVersion: 1,
    mode: "read-only",
    mutationToolsEnabled: false,
    tool: definition.toolName,
    command: definition.commandName,
    args,
    ...(definition.governance ? { governance: definition.governance } : {}),
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
    schemaVersion: 1,
    mode: "read-only",
    mutationToolsEnabled: false,
    tool: definition.toolName,
    command: definition.commandName,
    args,
    ...(definition.governance ? { governance: definition.governance } : {}),
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
