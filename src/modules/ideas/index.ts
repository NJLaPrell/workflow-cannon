import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { getPlanningGenerationPolicy } from "../task-engine/planning-config.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  assertIdeasKitSchema,
  createIdea,
  getIdea,
  isIdeaId,
  parseIdeaStatus
} from "./idea-store.js";

function attachPlanningMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  planningGeneration: number
): void {
  data.planningGeneration = planningGeneration;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
}

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function cleanStringArray(raw: unknown): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === "string" && value.trim())) {
    return undefined;
  }
  return raw.map((value) => value.trim());
}

export const ideasModule: WorkflowModule = {
  registration: {
    id: "ideas",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["ideas"],
    dependsOn: [],
    optionalPeers: ["planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/ideas/config.md",
      format: "md",
      description: "Lightweight idea capture records in kit SQLite for planner-chat workflows."
    },
    instructions: {
      directory: "src/modules/ideas/instructions",
      entries: builtinInstructionEntriesForModule("ideas")
    }
  },
  async onCommand(command, ctx) {
    const args = command.args ?? {};
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

    const db = planning.sqliteDual.getDatabase();
    const schemaOk = assertIdeasKitSchema(planning.sqliteDual.dbPath);
    if (!schemaOk.ok) {
      return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
    }
    const planningGeneration = planning.sqliteDual.getPlanningGeneration();

    if (command.name === "create-idea") {
      const title = cleanString(args.title);
      if (!title) {
        return { ok: false, code: "invalid-args", message: "create-idea requires non-empty title" };
      }
      const note = cleanString(args.note);
      const status = args.status === undefined ? undefined : parseIdeaStatus(args.status);
      if (args.status !== undefined && !status) {
        return {
          ok: false,
          code: "invalid-args",
          message: "create-idea status must be one of open | planning | planned"
        };
      }
      const linkedPlanArtifact = cleanString(args.linkedPlanArtifact);
      const previousPlanArtifacts = cleanStringArray(args.previousPlanArtifacts);
      if (args.previousPlanArtifacts !== undefined && !previousPlanArtifacts) {
        return {
          ok: false,
          code: "invalid-args",
          message: "create-idea previousPlanArtifacts must be an array of non-empty strings"
        };
      }
      const idea = createIdea(
        db,
        { title, note, status, linkedPlanArtifact, previousPlanArtifacts },
        new Date().toISOString()
      );
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-created", message: `Idea ${idea.id} created`, data };
    }

    if (command.name === "get-idea") {
      const ideaId = cleanString(args.ideaId ?? args.id);
      if (!ideaId || !isIdeaId(ideaId)) {
        return { ok: false, code: "invalid-args", message: "get-idea requires ideaId shaped like I001" };
      }
      const idea = getIdea(db, ideaId);
      if (!idea) {
        return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
      }
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-retrieved", message: `Idea ${idea.id}`, data };
    }

    return { ok: false, code: "unknown-command", message: `ideas does not implement ${command.name}` };
  }
};
