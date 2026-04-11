import { Buffer } from "node:buffer";

import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  caeRegistryTablesReady,
  countCaeAckRows,
  countCaeTraceRows,
  getActiveCaeRegistryVersionId,
  insertCaeAckSatisfaction,
  loadCaeTraceSnapshot,
  openKitSqliteReadWrite,
  persistCaeTraceIfEnabled
} from "../../core/cae/cae-kit-sqlite.js";
import { evaluateActivationBundle } from "../../core/cae/cae-evaluate.js";
import { loadCaeRegistryForKit } from "../../core/cae/cae-registry-effective.js";
import { loadCaeRegistry } from "../../core/cae/cae-registry-load.js";
import type { CaeLoadedRegistry } from "../../core/cae/cae-registry-load.js";
import { replaceActiveCaeRegistryFromLoaded } from "../../core/cae/cae-registry-sqlite.js";
import type { CaeEvaluationContext } from "../../core/cae/evaluation-context-types.js";
import { getAtPath } from "../../core/workspace-kit-config.js";
import {
  getCaeSession,
  getLastCaeEvalIso,
  storeCaeSession,
  type CaeSessionRecord
} from "./trace-store.js";

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

function resolveStoredCaeSession(
  workspacePath: string,
  effective: Record<string, unknown>,
  traceId: string
): { record: CaeSessionRecord; storage: "memory" | "sqlite" } | null {
  const mem = getCaeSession(traceId);
  if (mem) {
    return { record: mem, storage: "memory" };
  }
  if (getAtPath(effective, "kit.cae.persistence") !== true) {
    return null;
  }
  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (!db) {
    return null;
  }
  try {
    const snap = loadCaeTraceSnapshot(db, traceId);
    if (!snap) {
      return null;
    }
    return { record: { bundle: snap.bundle, trace: snap.trace }, storage: "sqlite" };
  } finally {
    db.close();
  }
}

function loadRegistryForCae(
  workspacePath: string,
  effective: Record<string, unknown>
):
  | { ok: true; reg: CaeLoadedRegistry }
  | { ok: false; code: string; message: string; remediation?: { instructionPath: string } } {
  const res = loadCaeRegistryForKit(workspacePath, effective);
  if (!res.ok) {
    const store = getAtPath(effective, "kit.cae.registryStore");
    return {
      ok: false,
      code: res.code,
      message: res.message,
      remediation: {
        instructionPath:
          store === "json"
            ? "src/modules/context-activation/instructions/cae-list-artifacts.md"
            : "src/modules/context-activation/instructions/cae-import-json-registry.md"
      }
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
      const loaded = loadRegistryForCae(ws, effective);
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
      const loaded = loadRegistryForCae(ws, effective);
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
      const loaded = loadRegistryForCae(ws, effective);
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
      const loaded = loadRegistryForCae(ws, effective);
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
      const loaded = loadRegistryForCae(ws, effective);
      if (!loaded.ok) return loaded;
      const evalMode = args.evalMode === "shadow" ? "shadow" : "live";
      const { bundle, trace, traceId } = evaluateActivationBundle(
        ec as CaeEvaluationContext,
        loaded.reg,
        { evalMode }
      );
      storeCaeSession(traceId, { bundle, trace });
      const persist = getAtPath(effective, "kit.cae.persistence") === true;
      persistCaeTraceIfEnabled(ws, effective, persist, traceId, trace, bundle);
      return {
        ok: true,
        code: "cae-evaluate-ok",
        data: {
          schemaVersion: 1,
          bundle,
          trace,
          traceId,
          ephemeral: !persist
        }
      };
    }

    if (name === "cae-explain") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const level = args.level === "verbose" ? "verbose" : "summary";
      const traceIdArg = typeof args.traceId === "string" ? args.traceId.trim() : "";
      if (traceIdArg) {
        const resolved = resolveStoredCaeSession(ws, effective, traceIdArg);
        if (!resolved) {
          return {
            ok: false,
            code: "cae-trace-not-found",
            message: `No trace for traceId '${traceIdArg}' (memory or persisted store)`
          };
        }
        const { record, storage } = resolved;
        const explanation = buildCaeExplainResponse(traceIdArg, record.bundle, record.trace, level);
        return {
          ok: true,
          code: "cae-explain-ok",
          data: {
            schemaVersion: 1,
            explanation,
            trace: record.trace,
            storage,
            ephemeral: storage === "memory"
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
      const loaded = loadRegistryForCae(ws, effective);
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

    if (name === "cae-registry-validate" || name === "cae-validate-registry") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const loaded = loadRegistryForCae(ws, effective);
      if (!loaded.ok) {
        return {
          ok: false,
          code: loaded.code,
          message: loaded.message,
          remediation: loaded.remediation
        };
      }
      return {
        ok: true,
        code: "cae-registry-validate-ok",
        data: {
          schemaVersion: 1,
          registryContentHash: loaded.reg.registryDigest,
          artifactCount: loaded.reg.artifactById.size,
          activationCount: loaded.reg.activationById.size
        }
      };
    }

    if (name === "cae-import-json-registry") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const artRel =
        typeof args.artifactsRelativePath === "string" && args.artifactsRelativePath.trim().length > 0
          ? args.artifactsRelativePath.trim()
          : undefined;
      const actRel =
        typeof args.activationsRelativePath === "string" && args.activationsRelativePath.trim().length > 0
          ? args.activationsRelativePath.trim()
          : undefined;
      const loadedSeed = loadCaeRegistry(ws, {
        artifactsRelativePath: artRel,
        activationsRelativePath: actRel,
        /** Import must not persist rows pointing at missing or escaped paths (CAE_PLAN C2 / T892). */
        verifyArtifactPaths: true
      });
      if (!loadedSeed.ok) {
        return {
          ok: false,
          code: loadedSeed.code,
          message: loadedSeed.message ?? "",
          remediation: { instructionPath: "src/modules/context-activation/instructions/cae-registry-validate.md" }
        };
      }
      const versionIdRaw = typeof args.versionId === "string" ? args.versionId.trim() : "";
      const versionId = versionIdRaw.length > 0 ? versionIdRaw : `cae.reg.import.${Date.now()}`;
      const actor =
        typeof args.actor === "string" && args.actor.trim().length > 0 ? args.actor.trim() : "import";
      const note = typeof args.note === "string" ? args.note : null;

      const db = openKitSqliteReadWrite(ws, effective);
      if (!db) {
        return {
          ok: false,
          code: "cae-kit-sqlite-unavailable",
          message: "Planning SQLite database not found or not openable"
        };
      }
      try {
        if (!caeRegistryTablesReady(db)) {
          return {
            ok: false,
            code: "cae-registry-sqlite-not-ready",
            message: "Kit SQLite schema does not include CAE registry tables (upgrade workspace-kit)"
          };
        }
        replaceActiveCaeRegistryFromLoaded(db, {
          versionId,
          createdBy: actor,
          note,
          registry: loadedSeed.value
        });
      } finally {
        db.close();
      }
      return {
        ok: true,
        code: "cae-import-json-registry-ok",
        data: {
          schemaVersion: 1,
          versionId,
          artifactCount: loadedSeed.value.artifactById.size,
          activationCount: loadedSeed.value.activationById.size
        }
      };
    }

    if (name === "cae-health") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const caeEnabled = getAtPath(effective, "kit.cae.enabled") === true;
      const persistenceEnabled = getAtPath(effective, "kit.cae.persistence") === true;
      const load = loadRegistryForCae(ws, effective);
      const registryStatus = load.ok ? "ok" : "invalid";
      const issues = load.ok
        ? []
        : [{ code: load.code, detail: load.message ?? "" }];
      const registryStore = getAtPath(effective, "kit.cae.registryStore");
      const data: Record<string, unknown> = {
        schemaVersion: 1,
        caeEnabled,
        persistenceEnabled,
        lastEvalAt: getLastCaeEvalIso(),
        registryStatus,
        issues,
        registryStore: typeof registryStore === "string" ? registryStore : "sqlite"
      };
      if (load.ok) {
        data.registryContentHash = load.reg.registryDigest;
        data.artifactCount = load.reg.artifactById.size;
        data.activationCount = load.reg.activationById.size;
        const db = openKitSqliteReadWrite(ws, effective);
        if (db) {
          try {
            if (caeRegistryTablesReady(db)) {
              const vid = getActiveCaeRegistryVersionId(db);
              if (vid) data.activeRegistryVersionId = vid;
            }
          } finally {
            db.close();
          }
        }
      }
      const includeDetails = args.includeDetails === true;
      if (includeDetails && persistenceEnabled) {
        const db = openKitSqliteReadWrite(ws, effective);
        if (db) {
          try {
            data.traceRowCount = countCaeTraceRows(db);
            data.ackRowCount = countCaeAckRows(db);
          } finally {
            db.close();
          }
        } else {
          data.traceRowCount = 0;
          data.ackRowCount = 0;
        }
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
      const loaded = loadRegistryForCae(ws, effective);
      if (!loaded.ok) return loaded;
      const evalMode = args.evalMode === "shadow" ? "shadow" : "live";
      const { bundle, trace, traceId } = evaluateActivationBundle(
        ec as CaeEvaluationContext,
        loaded.reg,
        { evalMode }
      );
      storeCaeSession(traceId, { bundle, trace });
      const persist = getAtPath(effective, "kit.cae.persistence") === true;
      persistCaeTraceIfEnabled(ws, effective, persist, traceId, trace, bundle);
      return {
        ok: true,
        code: "cae-conflicts-ok",
        data: {
          schemaVersion: 1,
          traceId,
          conflictShadowSummary: bundle.conflictShadowSummary,
          ephemeral: !persist
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
      const resolved = resolveStoredCaeSession(ws, effective, traceId);
      if (!resolved) {
        return {
          ok: false,
          code: "cae-trace-not-found",
          message: `No trace for traceId '${traceId}' (memory or persisted store)`
        };
      }
      const { record, storage } = resolved;
      return {
        ok: true,
        code: "cae-get-trace-ok",
        data: {
          schemaVersion: 1,
          trace: record.trace,
          storage,
          ephemeral: storage === "memory"
        }
      };
    }

    if (name === "cae-satisfy-ack") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      if (getAtPath(effective, "kit.cae.persistence") !== true) {
        return {
          ok: false,
          code: "cae-persistence-disabled",
          message: "Set kit.cae.persistence to true to record acknowledgement satisfaction"
        };
      }
      const traceId = typeof args.traceId === "string" ? args.traceId.trim() : "";
      const ackToken = typeof args.ackToken === "string" ? args.ackToken.trim() : "";
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      const actor = typeof args.actor === "string" ? args.actor.trim() : "";
      if (!traceId || !ackToken || !activationId || !actor) {
        return {
          ok: false,
          code: "invalid-args",
          message: "traceId, ackToken, activationId, and actor are required strings"
        };
      }

      const loadedReg = loadRegistryForCae(ws, effective);
      if (!loadedReg.ok) {
        return {
          ok: false,
          code: loadedReg.code,
          message: loadedReg.message ?? "",
          remediation: { instructionPath: "src/modules/context-activation/instructions/cae-registry-validate.md" }
        };
      }
      const actRow = loadedReg.reg.activationById.get(activationId);
      if (!actRow) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown activationId '${activationId}'`
        };
      }
      const ackDef = actRow.acknowledgement as Record<string, unknown> | undefined;
      const expectedToken =
        ackDef && typeof ackDef.token === "string" ? ackDef.token.trim() : "";
      if (!expectedToken) {
        return {
          ok: false,
          code: "cae-ack-not-applicable",
          message: `Activation '${activationId}' has no acknowledgement.token; registry edits stay git+PR per .ai/cae/mutation-governance.md`
        };
      }
      if (ackToken !== expectedToken) {
        return {
          ok: false,
          code: "cae-ack-token-mismatch",
          message: "ackToken does not match registry acknowledgement.token for this activation"
        };
      }

      const db = openKitSqliteReadWrite(ws, effective);
      if (!db) {
        return {
          ok: false,
          code: "cae-kit-sqlite-unavailable",
          message: "Planning SQLite database not found or not openable"
        };
      }
      try {
        const snap = loadCaeTraceSnapshot(db, traceId);
        if (!snap) {
          return {
            ok: false,
            code: "cae-trace-not-found",
            message: `No persisted trace for traceId '${traceId}' — persist traces first (kit.cae.persistence + preflight or cae-evaluate).`
          };
        }
        insertCaeAckSatisfaction(db, { traceId, ackToken, activationId, actor });
      } finally {
        db.close();
      }
      return {
        ok: true,
        code: "cae-satisfy-ack-ok",
        data: {
          schemaVersion: 1,
          traceId,
          activationId,
          ackToken,
          actor
        }
      };
    }

    return { ok: false, code: "unknown-command", message: `Unhandled command '${name}'` };
  }
};
