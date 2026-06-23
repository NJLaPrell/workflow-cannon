/**
 * MCP mutation tool definitions and opt-in env gate.
 *
 * Mutation tools are disabled by default. Enable by setting:
 *   WORKFLOW_CANNON_MCP_MUTATION_TOOLS=1
 *
 * ADR: .ai/adrs/ADR-mcp-adapter-boundary-v1.md
 * CLI remains the canonical mutation surface. MCP mutation is opt-in,
 * policyApproval-gated, and audit-logged with privacy-safe redaction.
 */

export const MCP_MUTATION_TOOLS_ENV_VAR = "WORKFLOW_CANNON_MCP_MUTATION_TOOLS";

/** Input schema type for mutation tools — mirrors McpToolDescriptor["inputSchema"] without import. */
interface MutationInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: boolean;
}

export interface MutationMcpToolDescriptor {
  name: string;
  description: string;
  inputSchema: MutationInputSchema;
}

export interface MutationMcpToolDefinition {
  toolName: string;
  commandName: string;
  description: string;
  cliFallbackArgs: string;
  commonMistakes: string[];
  inputSchema: MutationInputSchema;
  expansionArgs: (args: Record<string, unknown>) => Record<string, unknown>;
  validateArgs: (args: Record<string, unknown>) => string | null;
  isMutation: true;
  requiresPolicyApproval: true;
  outputByteBudget: number;
}

/** Returns true when WORKFLOW_CANNON_MCP_MUTATION_TOOLS=1 is set. */
export function resolveMcpMutationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[MCP_MUTATION_TOOLS_ENV_VAR] === "1";
}

function requirePolicyApprovalArg(args: Record<string, unknown>): string | null {
  if (
    typeof args.policyApproval !== "object" ||
    args.policyApproval === null ||
    Array.isArray(args.policyApproval)
  ) {
    return "policyApproval is required: provide a JSON policyApproval object to authorize this mutation";
  }
  return null;
}

function requireStringArgsMut(...names: string[]): (args: Record<string, unknown>) => string | null {
  return (args) => {
    for (const name of names) {
      if (typeof args[name] !== "string" || (args[name] as string).trim().length === 0) {
        return `${name} is required`;
      }
    }
    return null;
  };
}

function chainValidators(
  ...validators: Array<(args: Record<string, unknown>) => string | null>
): (args: Record<string, unknown>) => string | null {
  return (args) => {
    for (const v of validators) {
      const err = v(args);
      if (err) return err;
    }
    return null;
  };
}

const policyApprovalSchema = {
  type: "object",
  description:
    "Required. JSON policy approval payload authorizing this mutation. Include approvedBy, reason, and timestamp.",
  properties: {
    approvedBy: { type: "string", description: "Identity authorizing the mutation." },
    reason: { type: "string", description: "Rationale for the mutation." },
    timestamp: { type: "string", description: "ISO-8601 authorization timestamp." }
  },
  additionalProperties: true
};

export const MUTATION_TOOL_DEFS_WITHOUT_BUDGET: Omit<MutationMcpToolDefinition, "outputByteBudget">[] =
  [
    {
      toolName: "workflow-cannon.run-transition",
      commandName: "run-transition",
      description:
        "Execute a task lifecycle transition (start, complete, etc.) via shared runtime. Requires policyApproval. CLI is canonical; use pnpm exec wk run run-transition outside MCP.",
      cliFallbackArgs:
        '{"taskId":"<task>","action":"start","policyApproval":{"approvedBy":"agent","reason":"<reason>"}}',
      commonMistakes: [
        "omitting policyApproval",
        "missing expectedPlanningGeneration when policy requires it"
      ],
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task id." },
          action: { type: "string", description: "Transition action (start, complete, etc.)." },
          assignmentId: { type: "string", description: "Optional assignment id." },
          expectedPlanningGeneration: {
            description: "Optimistic concurrency token from a prior read."
          },
          clientMutationId: { type: "string", description: "Optional idempotency key." },
          actor: { type: "string", description: "Optional actor recorded on transition evidence." },
          policyApproval: policyApprovalSchema
        },
        required: ["taskId", "action", "policyApproval"],
        additionalProperties: false
      },
      expansionArgs: (args) => {
        const out: Record<string, unknown> = { taskId: args.taskId, action: args.action };
        if (typeof args.assignmentId === "string") out.assignmentId = args.assignmentId;
        if (args.expectedPlanningGeneration !== undefined)
          out.expectedPlanningGeneration = args.expectedPlanningGeneration;
        if (typeof args.clientMutationId === "string") out.clientMutationId = args.clientMutationId;
        if (typeof args.actor === "string") out.actor = args.actor;
        if (args.policyApproval !== undefined) out.policyApproval = args.policyApproval;
        return out;
      },
      validateArgs: chainValidators(
        requireStringArgsMut("taskId", "action"),
        requirePolicyApprovalArg
      ),
      isMutation: true,
      requiresPolicyApproval: true
    },
    {
      toolName: "workflow-cannon.write-memory",
      commandName: "write-memory",
      description:
        "Create or update a draft project-memory record via shared runtime. Requires policyApproval. Creates draft only; use CLI approve-memory to promote.",
      cliFallbackArgs:
        '{"category":"<cat>","body":"<body>","policyApproval":{"approvedBy":"agent","reason":"<reason>"}}',
      commonMistakes: [
        "omitting policyApproval",
        "expecting direct approval (use approve-memory CLI)"
      ],
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Memory category." },
          body: { type: "string", description: "Memory record body text." },
          id: { type: "string", description: "Optional record id for updates." },
          policyApproval: policyApprovalSchema
        },
        required: ["category", "body", "policyApproval"],
        additionalProperties: false
      },
      expansionArgs: (args) => {
        const out: Record<string, unknown> = { category: args.category, body: args.body };
        if (typeof args.id === "string") out.id = args.id;
        if (args.policyApproval !== undefined) out.policyApproval = args.policyApproval;
        return out;
      },
      validateArgs: chainValidators(
        requireStringArgsMut("category", "body"),
        requirePolicyApprovalArg
      ),
      isMutation: true,
      requiresPolicyApproval: true
    }
  ];

export const MUTATION_TOOL_NAMES_SET: ReadonlySet<string> = new Set(
  MUTATION_TOOL_DEFS_WITHOUT_BUDGET.map((t) => t.toolName)
);

/**
 * Returns the mutation tool descriptor list for schema snapshot generation.
 * Budget is not included — this is a schema/descriptor surface only.
 */
export function listMutationMcpToolDescriptors(): MutationMcpToolDescriptor[] {
  return MUTATION_TOOL_DEFS_WITHOUT_BUDGET.map((t) => ({
    name: t.toolName,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
