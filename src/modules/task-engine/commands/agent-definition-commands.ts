import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { readOptionalExpectedPlanningGeneration } from "../mutation-utils.js";
import { getPlanningGenerationPolicy, mergePlanningGenerationPolicyWarnings } from "../planning-config.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import {
  assertAgentDefinitionBridgeSchema,
  getAgentDefinitionById,
  listAgentDefinitions,
  parseAgentDefinitionInput,
  registerAgentDefinition,
  retireAgentDefinition,
  updateAgentDefinition,
  validateAgentDefinitionId
} from "../agent-definition-store.js";

const REGISTER_INSTRUCTION = "src/modules/task-engine/instructions/register-agent-definition.md";
const UPDATE_INSTRUCTION = "src/modules/task-engine/instructions/update-agent-definition.md";
const RETIRE_INSTRUCTION = "src/modules/task-engine/instructions/retire-agent-definition.md";
const GET_INSTRUCTION = "src/modules/task-engine/instructions/get-agent-definition.md";

function attachPlanningMeta(data: Record<string, unknown>, ctx: ModuleLifecycleContext, gen: number, warnings?: string[]): void {
  data.planningGeneration = gen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

function resolveDefinitionId(args: Record<string, unknown>): string | null {
  if (typeof args.agentDefinitionId === "string") return validateAgentDefinitionId(args.agentDefinitionId);
  if (typeof args.subagentId === "string") return validateAgentDefinitionId(args.subagentId);
  return null;
}

export function resolveAgentDefinitionCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  const args = command.args ?? {};
  const name = command.name;
  if (!["register-agent-definition", "update-agent-definition", "retire-agent-definition", "get-agent-definition", "list-agent-definitions"].includes(name)) {
    return null;
  }
  const schemaOk = assertAgentDefinitionBridgeSchema(planning.sqliteDual.dbPath);
  if (!schemaOk.ok) return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
  const db = planning.sqliteDual.getDatabase();
  const gen = planning.sqliteDual.getPlanningGeneration();

  if (name === "list-agent-definitions") {
    const definitions = listAgentDefinitions(db, { includeRetired: args.includeRetired === true, orchestrationOnly: args.orchestrationOnly === true });
    const data: Record<string, unknown> = { schemaVersion: 1, definitions, count: definitions.length };
    attachPlanningMeta(data, ctx, gen);
    return { ok: true, code: "agent-definitions-listed", message: `${definitions.length} agent definition(s)`, data };
  }

  if (name === "get-agent-definition") {
    const id = resolveDefinitionId(args);
    if (!id) return { ok: false, code: "invalid-args", message: "get-agent-definition requires agentDefinitionId", remediation: { instructionPath: GET_INSTRUCTION } };
    const definition = getAgentDefinitionById(db, id);
    if (!definition) return { ok: false, code: "task-not-found", message: `Agent definition '${id}' not found` };
    const data: Record<string, unknown> = { schemaVersion: 1, definition };
    attachPlanningMeta(data, ctx, gen);
    return { ok: true, code: "agent-definition-retrieved", message: `Agent definition '${id}'`, data };
  }

  const instructionPath = name === "register-agent-definition" ? REGISTER_INSTRUCTION : name === "update-agent-definition" ? UPDATE_INSTRUCTION : RETIRE_INSTRUCTION;
  readOptionalExpectedPlanningGeneration(args);
  const gate = planningGenPolicyGate(ctx, args, instructionPath, gen);
  if (gate.block) return gate.block;

  if (args.dryRun === true) {
    if (name !== "retire-agent-definition") {
      const parsed = parseAgentDefinitionInput(args);
      if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message, remediation: { instructionPath } };
    } else if (!resolveDefinitionId(args)) {
      return { ok: false, code: "invalid-args", message: "retire-agent-definition requires agentDefinitionId", remediation: { instructionPath: RETIRE_INSTRUCTION } };
    }
    const data: Record<string, unknown> = { schemaVersion: 1, dryRun: true };
    attachPlanningMeta(data, ctx, gen, gate.warnings);
    return { ok: true, code: "agent-definition-dry-run", message: `${name} dry run`, data };
  }

  const ts = new Date().toISOString();
  if (name === "register-agent-definition" || name === "update-agent-definition") {
    const parsed = parseAgentDefinitionInput(args);
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message, remediation: { instructionPath } };
    try {
      let definition;
      planning.sqliteDual.withTransaction(() => {
        definition = name === "register-agent-definition"
          ? registerAgentDefinition(db, parsed.definition, ts)
          : updateAgentDefinition(db, parsed.definition, ts);
      });
      if (!definition) return { ok: false, code: "task-not-found", message: `Agent definition '${parsed.definition.agentDefinitionId}' not found` };
      const data: Record<string, unknown> = { schemaVersion: 1, definition };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
      return { ok: true, code: name === "register-agent-definition" ? "agent-definition-registered" : "agent-definition-updated", message: parsed.definition.agentDefinitionId, data };
    } catch (err) {
      return { ok: false, code: "invalid-transition", message: (err as Error).message };
    }
  }

  const id = resolveDefinitionId(args);
  if (!id) return { ok: false, code: "invalid-args", message: "retire-agent-definition requires agentDefinitionId", remediation: { instructionPath: RETIRE_INSTRUCTION } };
  let changed = false;
  planning.sqliteDual.withTransaction(() => { changed = retireAgentDefinition(db, id, ts); });
  if (!changed) return { ok: false, code: "task-not-found", message: `Agent definition '${id}' not found` };
  const data: Record<string, unknown> = { schemaVersion: 1, definition: getAgentDefinitionById(db, id) };
  attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
  return { ok: true, code: "agent-definition-retired", message: `Agent definition '${id}' retired`, data };
}
