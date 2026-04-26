import { Buffer } from "node:buffer";

import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import {
  BUILTIN_RUN_COMMAND_MANIFEST,
  builtinInstructionEntriesForModule
} from "../../contracts/builtin-run-command-manifest.js";
import {
  caeRegistryTablesReady,
  countCaeAckRows,
  countCaeTraceRows,
  getActiveCaeRegistryVersionId,
  insertCaeAckSatisfaction,
  insertCaeRegistryMutationAudit,
  listCaeAckSatisfactions,
  listCaeTraceSnapshotSummaries,
  loadCaeTraceSnapshot,
  openKitSqliteReadWrite,
  persistCaeTraceIfEnabled
} from "../../core/cae/cae-kit-sqlite.js";
import { tryHandleCaeRegistryAdminCommand } from "../../core/cae/cae-registry-admin-cli.js";
import { evaluateActivationBundle } from "../../core/cae/cae-evaluate.js";
import { countReadyTasksInPlanningSqlite } from "../../core/cae/cae-queue-snapshot.js";
import { buildEvaluationContext } from "../../core/cae/evaluation-context-builder.js";
import {
  hydrateTaskRowForCae,
  inferApprovalTierHint
} from "../../core/cae/cae-run-preflight.js";
import { loadCaeRegistryForKit } from "../../core/cae/cae-registry-effective.js";
import { loadCaeRegistry } from "../../core/cae/cae-registry-load.js";
import type { CaeLoadedRegistry } from "../../core/cae/cae-registry-load.js";
import { replaceActiveCaeRegistryFromLoaded } from "../../core/cae/cae-registry-sqlite.js";
import type { CaeEvaluationContext } from "../../core/cae/evaluation-context-types.js";
import { isSensitiveModuleCommandForEffective } from "../../core/policy.js";
import { getAtPath } from "../../core/workspace-kit-config.js";
import {
  getCaeSession,
  getLastCaeEvalIso,
  storeCaeSession,
  type CaeSessionRecord
} from "./trace-store.js";

type SqliteDatabase = NonNullable<ReturnType<typeof openKitSqliteReadWrite>>;

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

const CAE_SHADOW_FEEDBACK_STATE_ID = "context-activation.cae-shadow-feedback";

type CaeShadowFeedbackRow = {
  traceId: string;
  activationId: string;
  commandName: string;
  signal: "useful" | "noisy";
  actor: string;
  recordedAt: string;
  note?: string;
};

function loadShadowFeedbackRows(db: SqliteDatabase): CaeShadowFeedbackRow[] {
  const row = db
    .prepare(`SELECT state_json FROM workspace_module_state WHERE module_id = ?`)
    .get(CAE_SHADOW_FEEDBACK_STATE_ID) as { state_json: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.state_json) as { rows?: unknown };
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter((item): item is CaeShadowFeedbackRow => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const r = item as Record<string, unknown>;
      return (
        typeof r.traceId === "string" &&
        typeof r.activationId === "string" &&
        typeof r.commandName === "string" &&
        (r.signal === "useful" || r.signal === "noisy") &&
        typeof r.actor === "string" &&
        typeof r.recordedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function saveShadowFeedbackRows(db: SqliteDatabase, rows: CaeShadowFeedbackRow[]): void {
  const now = new Date().toISOString();
  const stateJson = JSON.stringify({ schemaVersion: 1, rows: rows.slice(-1000) });
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version = excluded.state_schema_version,
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`
  ).run(CAE_SHADOW_FEEDBACK_STATE_ID, stateJson, now);
}

function summarizeShadowFeedback(rows: CaeShadowFeedbackRow[]): Record<string, unknown> {
  const byActivation = new Map<string, { activationId: string; useful: number; noisy: number; total: number }>();
  for (const row of rows) {
    const cur = byActivation.get(row.activationId) ?? {
      activationId: row.activationId,
      useful: 0,
      noisy: 0,
      total: 0
    };
    cur[row.signal] += 1;
    cur.total += 1;
    byActivation.set(row.activationId, cur);
  }
  return {
    total: rows.length,
    useful: rows.filter((r) => r.signal === "useful").length,
    noisy: rows.filter((r) => r.signal === "noisy").length,
    byActivation: [...byActivation.values()].sort((a, b) => b.total - a.total || a.activationId.localeCompare(b.activationId))
  };
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

const GUIDANCE_PRODUCT_LABELS = {
  productName: "Guidance",
  technicalName: "Context Activation Engine (CAE)",
  terms: {
    cae: "Guidance system",
    activation: "Guidance item",
    artifact: "Source rule or playbook",
    bundle: "Guidance result",
    trace: "Why this appeared",
    shadowMode: "Preview mode",
    liveMode: "Applies now",
    enforcement: "Hard stop",
    acknowledgement: "I read this guidance",
    policyApproval: "Permission for a sensitive command"
  },
  families: {
    policy: "Rules to follow",
    think: "Things to consider",
    do: "Suggested steps",
    review: "Review checks"
  }
};

type CaeFamily = "policy" | "think" | "do" | "review";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function familyCountsFromBundle(bundle: Record<string, unknown>): Record<CaeFamily, number> {
  const families = asRecord(bundle.families);
  const count = (family: CaeFamily) => {
    const rows = families?.[family];
    return Array.isArray(rows) ? rows.length : 0;
  };
  return {
    policy: count("policy"),
    think: count("think"),
    do: count("do"),
    review: count("review")
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildTraceSummary(
  traceId: string,
  bundle: Record<string, unknown>,
  evaluationContext?: unknown
): Record<string, unknown> {
  const counts = familyCountsFromBundle(bundle);
  const pendingAcknowledgements = Array.isArray(bundle.pendingAcknowledgements)
    ? bundle.pendingAcknowledgements
    : [];
  const conflicts = asRecord(bundle.conflictShadowSummary);
  const conflictEntries = Array.isArray(conflicts?.entries) ? conflicts.entries : [];
  const ec = asRecord(evaluationContext);
  const task = asRecord(ec?.task);
  const command = asRecord(ec?.command);
  const summary: Record<string, unknown> = {
    traceId,
    storage: "sqlite",
    evalMode: bundle.evaluationPipelineMode === "shadow" ? "shadow" : "live",
    familyCounts: counts,
    totalGuidanceCount: counts.policy + counts.think + counts.do + counts.review,
    pendingAcknowledgementCount: pendingAcknowledgements.length,
    conflictCount: conflictEntries.length,
    bundleId: typeof bundle.bundleId === "string" ? bundle.bundleId : null
  };
  const taskId = optionalString(task?.taskId);
  const taskTitle = optionalString(task?.title);
  const commandName = optionalString(command?.name);
  if (taskId) summary.taskId = taskId;
  if (taskTitle) summary.taskTitle = taskTitle;
  if (commandName) summary.commandName = commandName;
  return summary;
}

function commandModuleId(commandName: string): string | undefined {
  return BUILTIN_RUN_COMMAND_MANIFEST.find((row) => row.name === commandName)?.moduleId;
}

function summarizeGuidanceCards(
  bundle: Record<string, unknown>,
  reg: CaeLoadedRegistry
): Record<CaeFamily, Record<string, unknown>[]> {
  const families = asRecord(bundle.families);
  const labelByFamily = GUIDANCE_PRODUCT_LABELS.families as Record<CaeFamily, string>;
  const out: Record<CaeFamily, Record<string, unknown>[]> = {
    policy: [],
    think: [],
    do: [],
    review: []
  };
  for (const family of ["policy", "think", "do", "review"] as CaeFamily[]) {
    const rows = Array.isArray(families?.[family]) ? (families[family] as Record<string, unknown>[]) : [];
    out[family] = rows.map((row) => {
      const artifactIds = Array.isArray(row.artifactIds)
        ? row.artifactIds.filter((id): id is string => typeof id === "string")
        : [];
      const sourceTitles = artifactIds
        .map((artifactId) => {
          const artifact = reg.artifactById.get(artifactId);
          return typeof artifact?.title === "string" && artifact.title.length > 0
            ? artifact.title
            : artifactId;
        })
        .slice(0, 5);
      return {
        activationId: String(row.activationId ?? ""),
        family,
        familyLabel: labelByFamily[family],
        title: sourceTitles[0] ?? String(row.activationId ?? "Guidance item"),
        attention:
          family === "policy"
            ? "required"
            : family === "review"
              ? "check"
              : "advisory",
        artifactIds,
        sourceTitles,
        priority: Number(row.priority ?? 0),
        aggregateTightness: Number(row.aggregateTightness ?? 0)
      };
    });
  }
  return out;
}

function summarizeTraceSnapshot(row: {
  traceId: string;
  createdAt: string;
  trace: Record<string, unknown>;
  bundle: Record<string, unknown>;
  summary: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    ...buildTraceSummary(row.traceId, row.bundle),
    ...(row.summary ?? {}),
    traceId: row.traceId,
    createdAt: row.createdAt,
    storage: "sqlite"
  };
}

function buildCaeHealthData(
  workspacePath: string,
  effective: Record<string, unknown>,
  includeDetails: boolean
): Record<string, unknown> {
  const caeEnabled = getAtPath(effective, "kit.cae.enabled") === true;
  const persistenceEnabled = getAtPath(effective, "kit.cae.persistence") === true;
  const load = loadRegistryForCae(workspacePath, effective);
  const registryStatus = load.ok ? "ok" : "invalid";
  const issues = load.ok ? [] : [{ code: load.code, detail: load.message ?? "" }];
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
    const db = openKitSqliteReadWrite(workspacePath, effective);
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
  if (includeDetails && persistenceEnabled) {
    const db = openKitSqliteReadWrite(workspacePath, effective);
    if (db) {
      try {
        const traceRowCount = countCaeTraceRows(db);
        data.traceRowCount = traceRowCount;
        data.ackRowCount = countCaeAckRows(db);
        if (traceRowCount > 0 && data.lastEvalAt === null) {
          data.lastEvalAtNote =
            "lastEvalAt is process-local; persisted traces exist even when this process has not evaluated CAE yet.";
        }
      } finally {
        db.close();
      }
    } else {
      data.traceRowCount = 0;
      data.ackRowCount = 0;
    }
  }
  return data;
}

function listRecentTraceSummariesForDashboard(
  workspacePath: string,
  effective: Record<string, unknown>,
  limit: number
): { available: boolean; rows: Record<string, unknown>[]; count: number; code?: string; message?: string } {
  if (getAtPath(effective, "kit.cae.persistence") !== true) {
    return {
      available: false,
      rows: [],
      count: 0,
      code: "cae-persistence-disabled",
      message: "Enable kit.cae.persistence to list durable Guidance checks."
    };
  }
  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (!db) {
    return {
      available: false,
      rows: [],
      count: 0,
      code: "cae-kit-sqlite-unavailable",
      message: "Planning SQLite database not found or not openable"
    };
  }
  try {
    const rows = listCaeTraceSnapshotSummaries(db, { limit }).map(summarizeTraceSnapshot);
    return { available: true, rows, count: rows.length };
  } finally {
    db.close();
  }
}

function buildDashboardSummaryData(
  workspacePath: string,
  effective: Record<string, unknown>
): Record<string, unknown> {
  const health = buildCaeHealthData(workspacePath, effective, true);
  const loaded = loadRegistryForCae(workspacePath, effective);
  const validation = loaded.ok
    ? {
        ok: true,
        code: "cae-registry-validate-ok",
        registryContentHash: loaded.reg.registryDigest,
        artifactCount: loaded.reg.artifactById.size,
        activationCount: loaded.reg.activationById.size
      }
    : { ok: false, code: loaded.code, message: loaded.message };

  const recentTraces = listRecentTraceSummariesForDashboard(workspacePath, effective, 10);
  const acknowledgements: Record<string, unknown> = { available: false, count: 0, rows: [] };
  const feedback: Record<string, unknown> = { available: false, summary: summarizeShadowFeedback([]), rows: [] };
  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (db) {
    try {
      const ackRows = listCaeAckSatisfactions(db, { limit: 10 });
      acknowledgements.available = true;
      acknowledgements.count = countCaeAckRows(db);
      acknowledgements.rows = ackRows;
      const feedbackRows = loadShadowFeedbackRows(db);
      feedback.available = true;
      feedback.summary = summarizeShadowFeedback(feedbackRows);
      feedback.rows = feedbackRows
        .slice()
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        .slice(0, 10);
    } finally {
      db.close();
    }
  }

  return {
    schemaVersion: 1,
    product: GUIDANCE_PRODUCT_LABELS,
    health,
    validation,
    recentTraces,
    acknowledgements,
    feedback
  };
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

    const adminRes = tryHandleCaeRegistryAdminCommand(name, args, ws, effective);
    if (adminRes !== undefined) {
      return adminRes;
    }

    if (name === "cae-dashboard-summary") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      return {
        ok: true,
        code: "cae-dashboard-summary-ok",
        data: buildDashboardSummaryData(ws, effective)
      };
    }

    if (name === "cae-recent-traces") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const limit = typeof args.limit === "number" ? Math.floor(args.limit) : 25;
      const recent = listRecentTraceSummariesForDashboard(ws, effective, limit);
      if (!recent.available) {
        return {
          ok: false,
          code: recent.code ?? "cae-traces-unavailable",
          message: recent.message ?? "Recent CAE traces are unavailable"
        };
      }
      return {
        ok: true,
        code: "cae-recent-traces-ok",
        data: {
          schemaVersion: 1,
          rows: recent.rows,
          count: recent.count,
          storage: "sqlite",
          retention: {
            maxRows: 2000,
            note: "Durable CAE trace snapshots are pruned oldest-first after 2000 rows."
          }
        }
      };
    }

    if (name === "cae-guidance-preview") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const commandName =
        typeof args.commandName === "string" && args.commandName.trim().length > 0
          ? args.commandName.trim()
          : "";
      if (!commandName) {
        return { ok: false, code: "invalid-args", message: "commandName is required" };
      }
      const taskId =
        typeof args.taskId === "string" && args.taskId.trim().length > 0
          ? args.taskId.trim()
          : undefined;
      const moduleId =
        typeof args.moduleId === "string" && args.moduleId.trim().length > 0
          ? args.moduleId.trim()
          : commandModuleId(commandName);
      const commandArgs = asRecord(args.commandArgs) ?? {};
      const argvSummary =
        typeof args.argvSummary === "string" && args.argvSummary.trim().length > 0
          ? args.argvSummary.trim()
          : undefined;
      const phase = String(args.currentKitPhase ?? getAtPath(effective, "kit.currentPhaseNumber") ?? "0");
      const loaded = loadRegistryForCae(ws, effective);
      if (!loaded.ok) return loaded;

      const hydratedTask = taskId ? hydrateTaskRowForCae(ws, effective, taskId) : null;
      const evaluationContext = buildEvaluationContext({
        taskRow: hydratedTask ?? (taskId ? { id: taskId, status: "ready", phaseKey: null } : null),
        command: { name: commandName, moduleId, args: commandArgs, argvSummary },
        workspace: { currentKitPhase: phase },
        governance: {
          policyApprovalRequired: isSensitiveModuleCommandForEffective(commandName, commandArgs, effective),
          approvalTierHint: inferApprovalTierHint(commandName, commandArgs, effective)
        },
        queue: {
          readyQueueDepth: countReadyTasksInPlanningSqlite(ws, effective),
          suggestedNextTaskId: null
        }
      });
      const evalMode = args.evalMode === "live" ? "live" : "shadow";
      const { bundle, trace, traceId } = evaluateActivationBundle(evaluationContext, loaded.reg, {
        evalMode
      });
      storeCaeSession(traceId, { bundle, trace });
      const persist = getAtPath(effective, "kit.cae.persistence") === true;
      persistCaeTraceIfEnabled(
        ws,
        effective,
        persist,
        traceId,
        trace,
        bundle,
        buildTraceSummary(traceId, bundle, evaluationContext)
      );
      const cards = summarizeGuidanceCards(bundle, loaded.reg);
      const counts = familyCountsFromBundle(bundle);
      return {
        ok: true,
        code: "cae-guidance-preview-ok",
        data: {
          schemaVersion: 1,
          product: GUIDANCE_PRODUCT_LABELS,
          evalMode,
          modeLabel: evalMode === "shadow" ? "Preview mode" : "Applies now",
          traceId,
          ephemeral: !persist,
          evaluationContext,
          bundle,
          trace,
          guidanceCards: cards,
          familyCounts: counts,
          totalGuidanceCount: counts.policy + counts.think + counts.do + counts.review,
          pendingAcknowledgements: bundle.pendingAcknowledgements,
          conflictShadowSummary: bundle.conflictShadowSummary
        }
      };
    }

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
      persistCaeTraceIfEnabled(
        ws,
        effective,
        persist,
        traceId,
        trace,
        bundle,
        buildTraceSummary(traceId, bundle, ec)
      );
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
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: "cae-import-json-registry",
          versionId,
          note,
          payload: {
            artifactCount: loadedSeed.value.artifactById.size,
            activationCount: loadedSeed.value.activationById.size
          }
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
      const includeDetails = args.includeDetails === true;
      const data = buildCaeHealthData(ws, effective, includeDetails);
      return { ok: true, code: "cae-health-ok", data };
    }

    if (name === "cae-list-acks") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const db = openKitSqliteReadWrite(ws, effective);
      if (!db) {
        return {
          ok: false,
          code: "cae-kit-sqlite-unavailable",
          message: "Planning SQLite database not found or not openable"
        };
      }
      try {
        const traceId = typeof args.traceId === "string" ? args.traceId.trim() : undefined;
        const activationId =
          typeof args.activationId === "string" ? args.activationId.trim() : undefined;
        const limit = typeof args.limit === "number" ? args.limit : undefined;
        const rows = listCaeAckSatisfactions(db, { traceId, activationId, limit });
        return {
          ok: true,
          code: "cae-list-acks-ok",
          data: {
            schemaVersion: 1,
            rows,
            count: rows.length,
            filters: {
              traceId: traceId ?? null,
              activationId: activationId ?? null
            }
          }
        };
      } finally {
        db.close();
      }
    }

    if (name === "cae-record-shadow-feedback") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const traceId = typeof args.traceId === "string" ? args.traceId.trim() : "";
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      const commandName = typeof args.commandName === "string" ? args.commandName.trim() : "";
      const actor = typeof args.actor === "string" ? args.actor.trim() : "";
      const signal = args.signal === "useful" || args.signal === "noisy" ? args.signal : "";
      const note = typeof args.note === "string" && args.note.trim().length > 0 ? args.note.trim() : undefined;
      if (!traceId || !activationId || !commandName || !actor || !signal) {
        return {
          ok: false,
          code: "invalid-args",
          message: "traceId, activationId, commandName, actor, and signal ('useful'|'noisy') are required"
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
        const feedback: CaeShadowFeedbackRow = {
          traceId,
          activationId,
          commandName,
          signal,
          actor,
          recordedAt: new Date().toISOString(),
          note
        };
        const rows = [...loadShadowFeedbackRows(db), feedback];
        saveShadowFeedbackRows(db, rows);
        return {
          ok: true,
          code: "cae-record-shadow-feedback-ok",
          data: {
            schemaVersion: 1,
            feedback,
            summary: summarizeShadowFeedback(rows)
          }
        };
      } finally {
        db.close();
      }
    }

    if (name === "cae-shadow-feedback-report") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const db = openKitSqliteReadWrite(ws, effective);
      if (!db) {
        return {
          ok: false,
          code: "cae-kit-sqlite-unavailable",
          message: "Planning SQLite database not found or not openable"
        };
      }
      try {
        const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
        const commandName = typeof args.commandName === "string" ? args.commandName.trim() : "";
        const signal = args.signal === "useful" || args.signal === "noisy" ? args.signal : "";
        const limit = Math.min(200, Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : 50));
        let rows = loadShadowFeedbackRows(db);
        if (activationId) rows = rows.filter((r) => r.activationId === activationId);
        if (commandName) rows = rows.filter((r) => r.commandName === commandName);
        if (signal) rows = rows.filter((r) => r.signal === signal);
        const sortedRows = rows
          .slice()
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
          .slice(0, limit);
        return {
          ok: true,
          code: "cae-shadow-feedback-report-ok",
          data: {
            schemaVersion: 1,
            summary: summarizeShadowFeedback(rows),
            rows: sortedRows,
            filters: {
              activationId: activationId || null,
              commandName: commandName || null,
              signal: signal || null
            }
          }
        };
      } finally {
        db.close();
      }
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
