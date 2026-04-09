import { Buffer } from "node:buffer";

import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { evaluateActivationBundle } from "../../core/cae/cae-evaluate.js";
import { loadCaeRegistry } from "../../core/cae/cae-registry-load.js";
import type { CaeLoadedRegistry } from "../../core/cae/cae-registry-load.js";
import type { CaeEvaluationContext } from "../../core/cae/evaluation-context-types.js";
import { getAtPath } from "../../core/workspace-kit-config.js";
import { getCaeSession, storeCaeSession } from "./trace-store.js";

function requireSchemaV1(args: Record<string, unknown>): ModuleCommandResult | null {
  if (args.schemaVersion !== 1) {
    return {
      ok: false,
      code: "invalid-args",
      message: "schemaVersion must be 1"
    };
  }
  return null;
}

function decodeCursor(cursor: unknown): number {
  if (typeof cursor !== "string" || cursor.length === 0) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof o?.o === "number" && o.o >= 0 ? Math.floor(o.o) : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function paginateIds(
  ids: string[],
  limitRaw: unknown,
  cursorRaw: unknown
): { page: string[]; nextCursor: string | null } {
  const limit = Math.min(200, Math.max(1, typeof limitRaw === "number" ? limitRaw : 50));
  const start = decodeCursor(cursorRaw);
  const page = ids.slice(start, start + limit);
  const nextStart = start + page.length;
  const nextCursor = nextStart < ids.length ? encodeCursor(nextStart) : null;
  return { page, nextCursor };
}

function loadOrFail(
  workspacePath: string
):
  | { ok: true; reg: CaeLoadedRegistry }
  | { ok: false; code: string; message: string; remediation?: { instructionPath: string } } {
  const res = loadCaeRegistry(workspacePath);
  if (!res.ok) {
    return {
      ok: false,
      code: res.code,
      message: res.message,
      remediation: { instructionPath: "src/modules/context-activation/instructions/cae-list-artifacts.md" }
    };
  }
  return { ok: true, reg: res.value };
}

function buildCaeExplainResponse(
  traceId: string,
  bundle: Record<string, unknown>,
  trace: Record<string, unknown>,
  level: "summary" | "verbose"
): Record<string, unknown> {
  const fam = bundle.families as Record<string, unknown[]> | undefined;
  const summaryText = `CAE trace ${traceId}: matched policy=${fam?.policy?.length ?? 0}, think=${fam?.think?.length ?? 0}, do=${fam?.do?.length ?? 0}, review=${fam?.review?.length ?? 0}.`;
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    traceId,
    level,
    summaryText,
    textStability: "best_effort_v1"
  };
  if (level === "verbose" && Array.isArray(trace.events)) {
    base.verboseEvents = (trace.events as Record<string, unknown>[]).map((e) => ({
      seq: e.seq,
      eventType: e.eventType,
      payloadSummary:
        typeof e.payload === "object" && e.payload !== null
          ? JSON.stringify(e.payload).slice(0, 1024)
          : ""
    }));
  }
  return base;
}

export const contextActivationModule: WorkflowModule = {
  registration: {
    id: "context-activation",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["diagnostics"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/context-activation/config.md",
      format: "md",
      description: "Context Activation Engine (CAE) read-only registry and evaluation commands."
    },
    instructions: {
      directory: "src/modules/context-activation/instructions",
      entries: builtinInstructionEntriesForModule("context-activation")
    }
  },

  async onCommand(command, ctx): Promise<ModuleCommandResult> {
    const args = command.args ?? {};
    const name = command.name;
    const ws = ctx.workspacePath;
    const effective = (ctx.effectiveConfig as Record<string, unknown> | undefined) ?? {};

    if (name === "cae-list-artifacts") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const { reg } = loaded;
      let ids = [...reg.artifactById.keys()].sort((a, b) => a.localeCompare(b));
      const typeFilter = typeof args.artifactType === "string" ? args.artifactType.trim() : "";
      if (typeFilter) {
        ids = ids.filter((id) => {
          const row = reg.artifactById.get(id);
          return row && (row.artifactType as string) === typeFilter;
        });
      }
      const { page, nextCursor } = paginateIds(ids, args.limit, args.cursor);
      return {
        ok: true,
        code: "cae-list-artifacts-ok",
        data: {
          schemaVersion: 1,
          artifactIds: page,
          nextCursor
        }
      };
    }

    if (name === "cae-get-artifact") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const row = loaded.reg.artifactById.get(artifactId);
      if (!row) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown artifactId '${artifactId}'`
        };
      }
      return {
        ok: true,
        code: "cae-get-artifact-ok",
        data: {
          schemaVersion: 1,
          artifact: row
        }
      };
    }

    if (name === "cae-list-activations") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const { reg } = loaded;
      let ids = [...reg.activationById.keys()].sort((a, b) => a.localeCompare(b));
      const fam = typeof args.family === "string" ? args.family.trim() : "";
      if (fam) {
        ids = ids.filter((id) => {
          const row = reg.activationById.get(id);
          return row && (row.family as string) === fam;
        });
      }
      const life = typeof args.lifecycleState === "string" ? args.lifecycleState.trim() : "";
      if (life) {
        ids = ids.filter((id) => {
          const row = reg.activationById.get(id);
          return row && (row.lifecycleState as string) === life;
        });
      }
      const { page, nextCursor } = paginateIds(ids, args.limit, args.cursor);
      return {
        ok: true,
        code: "cae-list-activations-ok",
        data: {
          schemaVersion: 1,
          activationIds: page,
          nextCursor
        }
      };
    }

    if (name === "cae-get-activation") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const row = loaded.reg.activationById.get(activationId);
      if (!row) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown activationId '${activationId}'`
        };
      }
      return {
        ok: true,
        code: "cae-get-activation-ok",
        data: {
          schemaVersion: 1,
          activation: row
        }
      };
    }

    if (name === "cae-evaluate") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const ec = args.evaluationContext;
      if (!ec || typeof ec !== "object" || Array.isArray(ec)) {
        return { ok: false, code: "invalid-args", message: "evaluationContext object is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const evalMode = args.evalMode === "shadow" ? "shadow" : "live";
      const { bundle, trace, traceId } = evaluateActivationBundle(
        ec as CaeEvaluationContext,
        loaded.reg,
        { evalMode }
      );
      storeCaeSession(traceId, { bundle, trace });
      return {
        ok: true,
        code: "cae-evaluate-ok",
        data: {
          schemaVersion: 1,
          bundle,
          trace,
          traceId,
          ephemeral: true
        }
      };
    }

    if (name === "cae-explain") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const level = args.level === "verbose" ? "verbose" : "summary";
      const traceIdArg = typeof args.traceId === "string" ? args.traceId.trim() : "";
      if (traceIdArg) {
        const session = getCaeSession(traceIdArg);
        if (!session) {
          return {
            ok: false,
            code: "cae-trace-not-found",
            message: `No ephemeral trace for traceId '${traceIdArg}'`
          };
        }
        const explanation = buildCaeExplainResponse(traceIdArg, session.bundle, session.trace, level);
        return {
          ok: true,
          code: "cae-explain-ok",
          data: {
            schemaVersion: 1,
            explanation,
            trace: session.trace
          }
        };
      }
      const ec = args.evaluationContext;
      if (!ec || typeof ec !== "object" || Array.isArray(ec)) {
        return {
          ok: false,
          code: "invalid-args",
          message: "Provide traceId or evaluationContext for cae-explain"
        };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const evalMode = args.evalMode === "shadow" ? "shadow" : "live";
      const { bundle, trace, traceId } = evaluateActivationBundle(
        ec as CaeEvaluationContext,
        loaded.reg,
        { evalMode }
      );
      const explanation = buildCaeExplainResponse(traceId, bundle, trace, level);
      return {
        ok: true,
        code: "cae-explain-ok",
        data: {
          schemaVersion: 1,
          explanation,
          trace
        }
      };
    }

    if (name === "cae-health") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const caeEnabled = getAtPath(effective, "kit.cae.enabled") === true;
      const load = loadCaeRegistry(ws);
      const registryStatus = load.ok ? "ok" : "invalid";
      const issues = load.ok
        ? []
        : [{ code: load.code, detail: load.message ?? "" }];
      const data: Record<string, unknown> = {
        schemaVersion: 1,
        caeEnabled,
        registryStatus,
        issues
      };
      if (load.ok) {
        data.registryContentHash = load.value.registryDigest;
      }
      return { ok: true, code: "cae-health-ok", data };
    }

    if (name === "cae-conflicts") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const ec = args.evaluationContext;
      if (!ec || typeof ec !== "object" || Array.isArray(ec)) {
        return { ok: false, code: "invalid-args", message: "evaluationContext object is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const evalMode = args.evalMode === "shadow" ? "shadow" : "live";
      const { bundle, trace, traceId } = evaluateActivationBundle(
        ec as CaeEvaluationContext,
        loaded.reg,
        { evalMode }
      );
      storeCaeSession(traceId, { bundle, trace });
      return {
        ok: true,
        code: "cae-conflicts-ok",
        data: {
          schemaVersion: 1,
          traceId,
          conflictShadowSummary: bundle.conflictShadowSummary
        }
      };
    }

    if (name === "cae-get-trace") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const traceId = typeof args.traceId === "string" ? args.traceId.trim() : "";
      if (!traceId) {
        return { ok: false, code: "invalid-args", message: "traceId is required" };
      }
      const session = getCaeSession(traceId);
      if (!session) {
        return {
          ok: false,
          code: "cae-trace-not-found",
          message: `No ephemeral trace for traceId '${traceId}'`
        };
      }
      return {
        ok: true,
        code: "cae-get-trace-ok",
        data: {
          schemaVersion: 1,
          trace: session.trace,
          ephemeral: true
        }
      };
    }

    return { ok: false, code: "unknown-command", message: `Unhandled command '${name}'` };
  }
};
