import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const JSON_RPC_VERSION = "2.0";
const MCP_PROTOCOL_VERSION = "2024-11-05";

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
    additionalProperties: boolean;
  };
}

export interface McpServerOptions {
  name?: string;
  version?: string;
}

const serverDefaults = {
  name: "workflow-cannon",
  version: "0.99.28"
};

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
    }
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
      return handleToolCall(id, request.params);

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

function handleToolCall(id: JsonRpcId, params: unknown): JsonRpcResponse {
  if (!isToolCallParams(params)) {
    return errorResponse(id, -32602, "Invalid params");
  }

  if (params.name !== "workflow-cannon.capabilities") {
    return errorResponse(id, -32602, `Unknown tool: ${params.name}`);
  }

  return successResponse(id, {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            mode: "read-only",
            mutationToolsEnabled: false,
            tools: listReadOnlyMcpTools().map((tool) => tool.name)
          },
          null,
          2
        )
      }
    ],
    isError: false
  });
}

function isToolCallParams(value: unknown): value is { name: string; arguments?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
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
