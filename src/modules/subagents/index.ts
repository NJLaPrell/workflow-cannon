import { randomUUID } from "node:crypto";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { readOptionalExpectedPlanningGeneration } from "../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy, mergePlanningGenerationPolicyWarnings } from "../task-engine/planning-config.js";
import {
  assertSubagentKitSchema,
  getDefinitionById,
  getSession,
  insertDefinition,
  insertMessage,
  insertSession,
  listDefinitions,
  listMessagesForSession,
  listSessions,
  normalizeAllowedCommands,
  setDefinitionRetired,
  updateDefinition,
  updateSessionStatus,
  validateSubagentId
} from "./subagent-store.js";

function attachPlanningMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  gen: number,
  warnings?: string[]
): void {
  data.planningGeneration = gen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

function nowIso(): string {
  return new Date().toISOString();
}

const MSG_DIRECTIONS = new Set(["outbound", "inbound", "system"]);

export const subagentsModule: WorkflowModule = {
  registration: {
    id: "subagents",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["subagents"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/subagents/config.md",
      format: "md",
      description: "Subagent definitions, sessions, and message log in kit SQLite."
    },
    instructions: {
      directory: "src/modules/subagents/instructions",
      entries: builtinInstructionEntriesForModule("subagents")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;

    let planning;
    try {
      planning = await openPlanningStores(ctx);
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open planning stores: ${(err as Error).message}`
      };
    }

    const dbPathAbs = planning.sqliteDual.dbPath;
    const schemaOk = assertSubagentKitSchema(dbPathAbs);
    if (!schemaOk.ok) {
      return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
    }

    const db = planning.sqliteDual.getDatabase();
    const gen = planning.sqliteDual.getPlanningGeneration();

    if (name === "list-subagents") {
      const includeRetired = args.includeRetired === true;
      const defs = listDefinitions(db, includeRetired);
      const data: Record<string, unknown> = { subagents: defs, count: defs.length };
      attachPlanningMeta(data, ctx, gen);
      return { ok: true, code: "subagents-listed", message: `${defs.length} definition(s)`, data };
    }

    if (name === "get-subagent") {
      const sid = typeof args.subagentId === "string" ? validateSubagentId(args.subagentId) : null;
      if (!sid) {
        return { ok: false, code: "invalid-args", message: "get-subagent requires subagentId (lowercase id, a-z0-9._-)" };
      }
      const def = getDefinitionById(db, sid);
      if (!def) {
        return { ok: false, code: "task-not-found", message: `Subagent '${sid}' not found` };
      }
      const data: Record<string, unknown> = { subagent: def };
      attachPlanningMeta(data, ctx, gen);
      return { ok: true, code: "subagent-retrieved", message: `Subagent '${sid}'`, data };
    }

    if (name === "get-subagent-session") {
      const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      if (!sessionId) {
        return { ok: false, code: "invalid-args", message: "get-subagent-session requires sessionId" };
      }
      const sess = getSession(db, sessionId);
      if (!sess) {
        return { ok: false, code: "task-not-found", message: `Session '${sessionId}' not found` };
      }
      const messages = listMessagesForSession(db, sessionId);
      const data: Record<string, unknown> = { session: sess, messages, messageCount: messages.length };
      attachPlanningMeta(data, ctx, gen);
      return { ok: true, code: "subagent-session-retrieved", message: `Session '${sessionId}'`, data };
    }

    if (name === "list-subagent-sessions") {
      let definitionId: string | undefined;
      if (typeof args.subagentId === "string" && args.subagentId.trim()) {
        const v = validateSubagentId(args.subagentId);
        if (!v) {
          return { ok: false, code: "invalid-args", message: "list-subagent-sessions: invalid subagentId" };
        }
        definitionId = v;
      }
      const executionTaskId =
        typeof args.executionTaskId === "string" && args.executionTaskId.trim()
          ? args.executionTaskId.trim()
          : undefined;
      const sessions = listSessions(db, { definitionId: definitionId ?? undefined, executionTaskId });
      const data: Record<string, unknown> = { sessions, count: sessions.length };
      attachPlanningMeta(data, ctx, gen);
      return {
        ok: true,
        code: "subagent-sessions-listed",
        message: `${sessions.length} session(s)`,
        data
      };
    }

    const exp = readOptionalExpectedPlanningGeneration(args);

    if (name === "register-subagent") {
      const sid = typeof args.subagentId === "string" ? validateSubagentId(args.subagentId) : null;
      if (!sid) {
        return {
          ok: false,
          code: "invalid-args",
          message: "register-subagent requires subagentId (pattern: letter + up to 63 a-z0-9._-)"
        };
      }
      const displayName =
        typeof args.displayName === "string" && args.displayName.trim() ? args.displayName.trim() : sid;
      const description = typeof args.description === "string" ? args.description.trim() : "";
      const ac = normalizeAllowedCommands(args.allowedCommands);
      if (!ac.ok) {
        return { ok: false, code: "invalid-args", message: ac.message };
      }
      let metadata: Record<string, unknown> | null = null;
      if (args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)) {
        metadata = args.metadata as Record<string, unknown>;
      }
      const ts = nowIso();
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const existing = getDefinitionById(db, sid);
            if (existing?.retired) {
              throw new TaskEngineError(
                "invalid-transition",
                `Subagent '${sid}' is retired; register a new subagentId`
              );
            }
            if (existing) {
              updateDefinition(db, {
                id: sid,
                displayName,
                description,
                allowedCommands: ac.commands,
                metadata,
                now: ts
              });
            } else {
              insertDefinition(db, {
                id: sid,
                displayName,
                description,
                allowedCommands: ac.commands,
                metadata,
                now: ts
              });
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const def = getDefinitionById(db, sid)!;
      const data: Record<string, unknown> = { subagent: def };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "subagent-registered", message: `Registered '${sid}'`, data };
    }

    if (name === "retire-subagent") {
      const sid = typeof args.subagentId === "string" ? validateSubagentId(args.subagentId) : null;
      if (!sid) {
        return { ok: false, code: "invalid-args", message: "retire-subagent requires subagentId" };
      }
      const ts = nowIso();
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const ok = setDefinitionRetired(db, sid, ts);
            if (!ok) {
              throw new TaskEngineError("task-not-found", `Subagent '${sid}' not found`);
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { subagentId: sid, retired: true };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "subagent-retired", message: `Retired '${sid}'`, data };
    }

    if (name === "spawn-subagent") {
      const sid = typeof args.subagentId === "string" ? validateSubagentId(args.subagentId) : null;
      if (!sid) {
        return { ok: false, code: "invalid-args", message: "spawn-subagent requires subagentId" };
      }
      const def = getDefinitionById(db, sid);
      if (!def || def.retired) {
        return {
          ok: false,
          code: "task-not-found",
          message: def?.retired ? `Subagent '${sid}' is retired` : `Subagent '${sid}' not found`
        };
      }
      const executionTaskId =
        typeof args.executionTaskId === "string" && args.executionTaskId.trim()
          ? args.executionTaskId.trim()
          : null;
      const hostHint = typeof args.hostHint === "string" && args.hostHint.trim() ? args.hostHint.trim() : null;
      let meta: Record<string, unknown> | null = null;
      if (args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)) {
        meta = { ...(args.metadata as Record<string, unknown>) };
      }
      if (typeof args.promptSummary === "string" && args.promptSummary.trim()) {
        meta = { ...(meta ?? {}), promptSummary: args.promptSummary.trim() };
      }
      const sessionId = typeof args.sessionId === "string" && args.sessionId.trim() ? args.sessionId.trim() : randomUUID();
      const ts = nowIso();
      try {
        planning.sqliteDual.withTransaction(
          () => {
            if (getSession(db, sessionId)) {
              throw new TaskEngineError("invalid-task-schema", `sessionId '${sessionId}' already exists`);
            }
            insertSession(db, {
              id: sessionId,
              definitionId: sid,
              executionTaskId,
              status: "open",
              hostHint,
              metadata: meta,
              now: ts
            });
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const sess = getSession(db, sessionId)!;
      const data: Record<string, unknown> = { session: sess };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "subagent-spawned", message: `Session '${sessionId}'`, data };
    }

    if (name === "message-subagent") {
      const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      if (!sessionId) {
        return { ok: false, code: "invalid-args", message: "message-subagent requires sessionId" };
      }
      const direction = typeof args.direction === "string" ? args.direction.trim() : "";
      if (!MSG_DIRECTIONS.has(direction)) {
        return {
          ok: false,
          code: "invalid-args",
          message: "message-subagent direction must be outbound | inbound | system"
        };
      }
      const body = typeof args.body === "string" ? args.body : "";
      if (!body.trim()) {
        return { ok: false, code: "invalid-args", message: "message-subagent requires non-empty body" };
      }
      const ts = nowIso();
      let messageId = 0;
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const s = getSession(db, sessionId);
            if (!s) {
              throw new TaskEngineError("task-not-found", `Session '${sessionId}' not found`);
            }
            if (s.status !== "open") {
              throw new TaskEngineError("invalid-transition", `Session '${sessionId}' is not open`);
            }
            messageId = insertMessage(db, { sessionId, direction, body, now: ts });
            db.prepare("UPDATE kit_subagent_sessions SET updated_at = ? WHERE id = ?").run(ts, sessionId);
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { sessionId, messageId, direction };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "subagent-message-recorded", message: `Message ${messageId}`, data };
    }

    if (name === "close-subagent-session") {
      const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      if (!sessionId) {
        return { ok: false, code: "invalid-args", message: "close-subagent-session requires sessionId" };
      }
      const ts = nowIso();
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const s = getSession(db, sessionId);
            if (!s) {
              throw new TaskEngineError("task-not-found", `Session '${sessionId}' not found`);
            }
            updateSessionStatus(db, sessionId, "closed", ts);
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { sessionId, status: "closed" };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "subagent-session-closed", message: `Closed '${sessionId}'`, data };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `subagents module: unhandled command '${name}'`
    };
  }
};
