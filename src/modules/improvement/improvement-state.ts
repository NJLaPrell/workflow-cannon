import fs from "node:fs/promises";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath
} from "../task-engine/planning-config.js";

export const IMPROVEMENT_STATE_SCHEMA_VERSION = 2 as const;

export type TranscriptRetryEntry = {
  relativePath: string;
  attempts: number;
  lastErrorCode: string;
  lastErrorMessage: string;
  nextRetryAt: string;
};

export type ImprovementStateDocument = {
  schemaVersion: typeof IMPROVEMENT_STATE_SCHEMA_VERSION;
  policyTraceLineCursor: number;
  mutationLineCursor: number;
  transitionLogLengthCursor: number;
  transcriptLineCursors: Record<string, number>;
  lastSyncRunAt: string | null;
  lastIngestRunAt: string | null;
  /** Bounded queue of transcript files that failed to copy; retried on subsequent syncs. */
  transcriptRetryQueue: TranscriptRetryEntry[];
};

const DEFAULT_REL = ".workspace-kit/improvement/state.json";

const IMPROVEMENT_MODULE_STATE_ID = "improvement";

function statePath(workspacePath: string): string {
  return path.join(workspacePath, DEFAULT_REL);
}

export function emptyImprovementState(): ImprovementStateDocument {
  return {
    schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION,
    policyTraceLineCursor: 0,
    mutationLineCursor: 0,
    transitionLogLengthCursor: 0,
    transcriptLineCursors: {},
    lastSyncRunAt: null,
    lastIngestRunAt: null,
    transcriptRetryQueue: []
  };
}

function migrateFromV1(raw: Record<string, unknown>): ImprovementStateDocument {
  const base = emptyImprovementState();
  return {
    ...base,
    policyTraceLineCursor:
      typeof raw.policyTraceLineCursor === "number" ? raw.policyTraceLineCursor : 0,
    mutationLineCursor: typeof raw.mutationLineCursor === "number" ? raw.mutationLineCursor : 0,
    transitionLogLengthCursor:
      typeof raw.transitionLogLengthCursor === "number" ? raw.transitionLogLengthCursor : 0,
    transcriptLineCursors:
      raw.transcriptLineCursors && typeof raw.transcriptLineCursors === "object" && raw.transcriptLineCursors !== null
        ? (raw.transcriptLineCursors as Record<string, number>)
        : {},
    lastSyncRunAt: typeof raw.lastSyncRunAt === "string" ? raw.lastSyncRunAt : null,
    lastIngestRunAt: typeof raw.lastIngestRunAt === "string" ? raw.lastIngestRunAt : null
  };
}

function normalizeLoadedDoc(raw: Record<string, unknown>): ImprovementStateDocument {
  const ver = raw.schemaVersion;
  if (ver === 1) {
    return migrateFromV1(raw);
  }
  if (ver !== IMPROVEMENT_STATE_SCHEMA_VERSION) {
    return emptyImprovementState();
  }
  const doc = raw as ImprovementStateDocument;
  return {
    ...emptyImprovementState(),
    ...doc,
    transcriptLineCursors: doc.transcriptLineCursors ?? {},
    transcriptRetryQueue: Array.isArray(doc.transcriptRetryQueue)
      ? doc.transcriptRetryQueue.filter(
          (e): e is TranscriptRetryEntry =>
            e !== null &&
            typeof e === "object" &&
            typeof (e as TranscriptRetryEntry).relativePath === "string"
        )
      : []
  };
}

async function loadImprovementStateFromFile(workspacePath: string): Promise<ImprovementStateDocument | null> {
  const fp = statePath(workspacePath);
  try {
    const rawText = await fs.readFile(fp, "utf8");
    const raw = JSON.parse(rawText) as Record<string, unknown>;
    return normalizeLoadedDoc(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw e;
  }
}

export async function loadImprovementState(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<ImprovementStateDocument> {
  if (getTaskPersistenceBackend(effectiveConfig) === "sqlite") {
    const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
    const unified = new UnifiedStateDb(workspacePath, planningSqliteDatabaseRelativePath(ctx));
    const row = unified.getModuleState(IMPROVEMENT_MODULE_STATE_ID);
    if (row?.state) {
      return normalizeLoadedDoc(row.state as Record<string, unknown>);
    }
    const fromFile = await loadImprovementStateFromFile(workspacePath);
    if (fromFile) {
      return fromFile;
    }
    return emptyImprovementState();
  }

  const fromFile = await loadImprovementStateFromFile(workspacePath);
  return fromFile ?? emptyImprovementState();
}

export async function saveImprovementState(
  workspacePath: string,
  doc: ImprovementStateDocument,
  effectiveConfig?: Record<string, unknown>
): Promise<void> {
  const out: ImprovementStateDocument = {
    ...doc,
    schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION
  };
  if (getTaskPersistenceBackend(effectiveConfig) === "sqlite") {
    const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
    const unified = new UnifiedStateDb(workspacePath, planningSqliteDatabaseRelativePath(ctx));
    unified.setModuleState(
      IMPROVEMENT_MODULE_STATE_ID,
      out.schemaVersion,
      out as unknown as Record<string, unknown>
    );
    return;
  }
  const fp = statePath(workspacePath);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, `${JSON.stringify(out, null, 2)}\n`, "utf8");
}
