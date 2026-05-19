import path from "node:path";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  archiveSidecarFile,
  persistModuleStateRow,
  readSidecarJsonFile
} from "../../core/state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";

export const BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL = path.join(
  ".workspace-kit",
  "agent-behavior",
  "interview-session.json"
);

const MODULE_ID = "agent-behavior-interview";
const STATE_SCHEMA = 1;

export type BehaviorInterviewSessionV1 = {
  schemaVersion: 1;
  updatedAt: string;
  stepIndex: number;
  answers: Record<string, string>;
};

function dbRelativePath(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): string {
  return planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig
  } as ModuleLifecycleContext);
}

function parseSession(raw: unknown): BehaviorInterviewSessionV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const parsed = raw as BehaviorInterviewSessionV1;
  if (parsed.schemaVersion !== 1) return null;
  if (typeof parsed.stepIndex !== "number") return null;
  if (!parsed.answers || typeof parsed.answers !== "object") return null;
  return parsed;
}

export async function persistBehaviorInterviewSession(
  workspacePath: string,
  snapshot: Omit<BehaviorInterviewSessionV1, "schemaVersion" | "updatedAt">,
  effectiveConfig?: Record<string, unknown>
): Promise<void> {
  const full: BehaviorInterviewSessionV1 = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot
  };
  const rel = dbRelativePath(workspacePath, effectiveConfig);
  persistModuleStateRow({
    workspacePath,
    databaseRelativePath: rel,
    moduleId: MODULE_ID,
    stateSchemaVersion: STATE_SCHEMA,
    state: full as unknown as Record<string, unknown>
  });
  await archiveSidecarFile(workspacePath, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
}

export async function clearBehaviorInterviewSession(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<void> {
  const rel = dbRelativePath(workspacePath, effectiveConfig);
  const db = new UnifiedStateDb(workspacePath, rel);
  db.deleteModuleState(MODULE_ID);
  await archiveSidecarFile(workspacePath, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
}

export async function readBehaviorInterviewSession(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<BehaviorInterviewSessionV1 | null> {
  const rel = dbRelativePath(workspacePath, effectiveConfig);
  const db = new UnifiedStateDb(workspacePath, rel);
  const row = db.getModuleState(MODULE_ID);
  if (row?.state) {
    return parseSession(row.state);
  }
  const sidecar = await readSidecarJsonFile(workspacePath, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
  if (sidecar.ok) {
    const parsed = parseSession(sidecar.value);
    if (parsed) {
      persistModuleStateRow({
        workspacePath,
        databaseRelativePath: rel,
        moduleId: MODULE_ID,
        stateSchemaVersion: STATE_SCHEMA,
        state: parsed as unknown as Record<string, unknown>
      });
      await archiveSidecarFile(workspacePath, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
      return parsed;
    }
  }
  if ("corrupt" in sidecar && sidecar.corrupt) {
    await archiveSidecarFile(workspacePath, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
  }
  return null;
}
