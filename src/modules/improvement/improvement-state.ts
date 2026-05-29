import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { persistAllowlistedModuleStateWithPlanningSync } from "../task-engine/persistence/module-state-planning-events-runtime.js";
import {
  archiveSidecarFile,
  persistModuleStateRow,
  readSidecarJsonFile
} from "../../core/state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { resolvePolicyTraceIdFromLineCursor } from "../../core/state/kit-policy-traces-sqlite.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";

type ImprovementStateLoadResult = ImprovementStateDocument & {
  _legacyPolicyTraceLineCursor?: number;
};

export const IMPROVEMENT_STATE_SCHEMA_VERSION = 4 as const;

/** Max scout rotation rows retained (FIFO trim on save). */
export const SCOUT_ROTATION_HISTORY_MAX = 32;

export type ScoutRotationEntry = {
  primaryLens: string;
  adversarialLens?: string;
  targetZone: string;
  questionStem: string;
  runAt: string;
};

export type TranscriptRetryEntry = {
  relativePath: string;
  attempts: number;
  lastErrorCode: string;
  lastErrorMessage: string;
  nextRetryAt: string;
};

export type ImprovementStateDocument = {
  schemaVersion: typeof IMPROVEMENT_STATE_SCHEMA_VERSION;
  /** Monotonic kit_policy_traces.id cursor for policy-deny ingestion. */
  lastIngestedPolicyTraceId: number;
  mutationLineCursor: number;
  transitionLogLengthCursor: number;
  transcriptLineCursors: Record<string, number>;
  lastSyncRunAt: string | null;
  lastIngestRunAt: string | null;
  /** Bounded queue of transcript files that failed to copy; retried on subsequent syncs. */
  transcriptRetryQueue: TranscriptRetryEntry[];
  /** Last scout-report rotations (optional `persistRotation` runs). */
  scoutRotationHistory: ScoutRotationEntry[];
};

export const IMPROVEMENT_STATE_SIDECAR_REL = ".workspace-kit/improvement/state.json";

const IMPROVEMENT_MODULE_STATE_ID = "improvement";

export function emptyImprovementState(): ImprovementStateDocument {
  return {
    schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION,
    lastIngestedPolicyTraceId: 0,
    mutationLineCursor: 0,
    transitionLogLengthCursor: 0,
    transcriptLineCursors: {},
    lastSyncRunAt: null,
    lastIngestRunAt: null,
    transcriptRetryQueue: [],
    scoutRotationHistory: []
  };
}

function normalizeScoutRotationHistory(raw: unknown): ScoutRotationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoutRotationEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const primaryLens = typeof o.primaryLens === "string" ? o.primaryLens : "";
    const targetZone = typeof o.targetZone === "string" ? o.targetZone : "";
    const questionStem = typeof o.questionStem === "string" ? o.questionStem : "";
    const runAt = typeof o.runAt === "string" ? o.runAt : "";
    if (!primaryLens || !targetZone || !questionStem || !runAt) continue;
    out.push({
      primaryLens,
      adversarialLens: typeof o.adversarialLens === "string" ? o.adversarialLens : undefined,
      targetZone,
      questionStem,
      runAt
    });
  }
  if (out.length <= SCOUT_ROTATION_HISTORY_MAX) return out;
  return out.slice(-SCOUT_ROTATION_HISTORY_MAX);
}

function migrateFromV1(raw: Record<string, unknown>): ImprovementStateDocument {
  const base = emptyImprovementState();
  return {
    ...base,
    lastIngestedPolicyTraceId:
      typeof raw.lastIngestedPolicyTraceId === "number" ? raw.lastIngestedPolicyTraceId : 0,
    mutationLineCursor: typeof raw.mutationLineCursor === "number" ? raw.mutationLineCursor : 0,
    transitionLogLengthCursor:
      typeof raw.transitionLogLengthCursor === "number" ? raw.transitionLogLengthCursor : 0,
    transcriptLineCursors:
      raw.transcriptLineCursors && typeof raw.transcriptLineCursors === "object" && raw.transcriptLineCursors !== null
        ? (raw.transcriptLineCursors as Record<string, number>)
        : {},
    lastSyncRunAt: typeof raw.lastSyncRunAt === "string" ? raw.lastSyncRunAt : null,
    lastIngestRunAt: typeof raw.lastIngestRunAt === "string" ? raw.lastIngestRunAt : null,
    scoutRotationHistory: normalizeScoutRotationHistory(raw.scoutRotationHistory)
  };
}

function normalizeLoadedDoc(raw: Record<string, unknown>): ImprovementStateLoadResult {
  const ver = raw.schemaVersion;
  if (ver === 1) {
    return migrateFromV1(raw);
  }
  if (ver === 2 || ver === 3) {
    const doc = raw as ImprovementStateDocument & { policyTraceLineCursor?: number };
    const legacyLineCursor =
      typeof doc.policyTraceLineCursor === "number" ? doc.policyTraceLineCursor : 0;
    const lastIngestedPolicyTraceId =
      typeof (raw as Record<string, unknown>).lastIngestedPolicyTraceId === "number"
        ? ((raw as Record<string, unknown>).lastIngestedPolicyTraceId as number)
        : 0;
    return {
      ...emptyImprovementState(),
      ...doc,
      schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION,
      lastIngestedPolicyTraceId,
      _legacyPolicyTraceLineCursor: legacyLineCursor > 0 && lastIngestedPolicyTraceId === 0 ? legacyLineCursor : 0,
      transcriptLineCursors: doc.transcriptLineCursors ?? {},
      transcriptRetryQueue: Array.isArray(doc.transcriptRetryQueue)
        ? doc.transcriptRetryQueue.filter(
            (e): e is TranscriptRetryEntry =>
              e !== null &&
              typeof e === "object" &&
              typeof (e as TranscriptRetryEntry).relativePath === "string"
          )
        : [],
      scoutRotationHistory: normalizeScoutRotationHistory(doc.scoutRotationHistory)
    };
  }
  if (ver !== IMPROVEMENT_STATE_SCHEMA_VERSION) {
    return emptyImprovementState();
  }
  const doc = raw as ImprovementStateDocument;
  return {
    ...emptyImprovementState(),
    ...doc,
    lastIngestedPolicyTraceId:
      typeof doc.lastIngestedPolicyTraceId === "number" ? doc.lastIngestedPolicyTraceId : 0,
    transcriptLineCursors: doc.transcriptLineCursors ?? {},
    transcriptRetryQueue: Array.isArray(doc.transcriptRetryQueue)
      ? doc.transcriptRetryQueue.filter(
          (e): e is TranscriptRetryEntry =>
            e !== null &&
            typeof e === "object" &&
            typeof (e as TranscriptRetryEntry).relativePath === "string"
        )
      : [],
    scoutRotationHistory: normalizeScoutRotationHistory(doc.scoutRotationHistory)
  };
}

/** Append one scout rotation row and trim to cap (mutates and returns same doc). */
export function appendScoutRotationEntry(doc: ImprovementStateDocument, entry: ScoutRotationEntry): ImprovementStateDocument {
  const next = [...doc.scoutRotationHistory, entry];
  doc.scoutRotationHistory =
    next.length > SCOUT_ROTATION_HISTORY_MAX ? next.slice(-SCOUT_ROTATION_HISTORY_MAX) : next;
  return doc;
}

export async function loadImprovementState(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<ImprovementStateDocument> {
  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const unified = new UnifiedStateDb(workspacePath, dbRel);
  const row = unified.getModuleState(IMPROVEMENT_MODULE_STATE_ID);
  if (row?.state) {
    return await finalizeImprovementStateLoad(
      workspacePath,
      normalizeLoadedDoc(row.state as Record<string, unknown>),
      effectiveConfig
    );
  }
  const sidecar = await readSidecarJsonFile(workspacePath, IMPROVEMENT_STATE_SIDECAR_REL);
  if (sidecar.ok) {
    const doc = normalizeLoadedDoc(sidecar.value);
    const finalized = await finalizeImprovementStateLoad(workspacePath, doc, effectiveConfig);
    persistModuleStateRow({
      workspacePath,
      databaseRelativePath: dbRel,
      moduleId: IMPROVEMENT_MODULE_STATE_ID,
      stateSchemaVersion: finalized.schemaVersion,
      state: finalized as unknown as Record<string, unknown>
    });
    await archiveSidecarFile(workspacePath, IMPROVEMENT_STATE_SIDECAR_REL);
    return finalized;
  }
  if ("corrupt" in sidecar && sidecar.corrupt) {
    await archiveSidecarFile(workspacePath, IMPROVEMENT_STATE_SIDECAR_REL);
    return emptyImprovementState();
  }
  return emptyImprovementState();
}

async function finalizeImprovementStateLoad(
  workspacePath: string,
  doc: ImprovementStateLoadResult,
  effectiveConfig?: Record<string, unknown>
): Promise<ImprovementStateDocument> {
  const legacy = doc._legacyPolicyTraceLineCursor ?? 0;
  delete doc._legacyPolicyTraceLineCursor;
  if (legacy > 0 && doc.lastIngestedPolicyTraceId === 0) {
    doc.lastIngestedPolicyTraceId = resolvePolicyTraceIdFromLineCursor(
      workspacePath,
      legacy,
      effectiveConfig
    );
    await saveImprovementState(workspacePath, doc, effectiveConfig);
  }
  return doc;
}

export async function saveImprovementState(
  workspacePath: string,
  doc: ImprovementStateDocument,
  effectiveConfig?: Record<string, unknown>,
  options?: { commandName?: string; clientMutationId?: string; policyApproval?: { confirmed: boolean; rationale: string } }
): Promise<ModuleCommandResult | null> {
  const out: ImprovementStateDocument = {
    ...doc,
    schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION
  };
  return persistAllowlistedModuleStateWithPlanningSync({
    workspacePath,
    effectiveConfig,
    moduleId: IMPROVEMENT_MODULE_STATE_ID,
    state: out as unknown as Record<string, unknown>,
    documentSchemaVersion: out.schemaVersion,
    commandName: options?.commandName ?? "save-improvement-state",
    clientMutationId: options?.clientMutationId,
    policyApproval: options?.policyApproval
  });
}
