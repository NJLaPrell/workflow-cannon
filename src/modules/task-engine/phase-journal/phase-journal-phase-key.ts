import type { WorkspaceStatusSnapshot } from "../dashboard/dashboard-status.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import type { TaskEntity } from "../types.js";

/** Resolve stable phase key from task metadata (phaseKey or phase label). */
export function inferPhaseKeyFromTask(task: TaskEntity | undefined): string | null {
  if (!task) {
    return null;
  }
  if (typeof task.phaseKey === "string" && task.phaseKey.trim()) {
    return task.phaseKey.trim();
  }
  const label = typeof task.phase === "string" ? task.phase : "";
  const m = /\b(?:phase|Phase)\s*([0-9]+)\b/.exec(label);
  if (m) {
    return m[1];
  }
  return null;
}

export type PhaseJournalPhaseKeySource = "phaseKey" | "task" | "workspace-status" | "config";

export type ResolvePhaseKeyForPhaseJournalReadResult =
  | { ok: true; phaseKey: string; source: PhaseJournalPhaseKeySource }
  | {
      ok: false;
      code: "phase-note-task-not-found" | "phase-note-phase-task-mismatch" | "phase-note-phase-unresolved";
      message: string;
    };

/**
 * Resolve `phaseKey` for read-only phase journal commands (`list-phase-notes`, `get-phase-context`,
 * `propose-tasks-from-phase-notes`).
 *
 * Precedence: explicit **`phaseKey`** → infer from **`taskId`** task metadata → canonical workspace phase
 * (`kit_workspace_status` / `kit.currentPhaseNumber` via {@link resolveCanonicalPhase}).
 */
export function resolvePhaseKeyForPhaseJournalRead(args: {
  phaseKey?: string | undefined;
  taskId?: string | undefined;
  task: TaskEntity | undefined;
  effectiveConfig: Record<string, unknown> | undefined;
  workspaceStatus: WorkspaceStatusSnapshot | null;
}): ResolvePhaseKeyForPhaseJournalReadResult {
  const phaseKeyTrim = args.phaseKey?.trim();
  const taskIdTrim = args.taskId?.trim();

  if (taskIdTrim) {
    if (!args.task) {
      return {
        ok: false,
        code: "phase-note-task-not-found",
        message: `Unknown taskId '${taskIdTrim}'.`
      };
    }
  }

  if (phaseKeyTrim) {
    if (taskIdTrim && args.task) {
      const inferred = inferPhaseKeyFromTask(args.task);
      if (inferred && inferred !== phaseKeyTrim) {
        return {
          ok: false,
          code: "phase-note-phase-task-mismatch",
          message: `phaseKey '${phaseKeyTrim}' does not match task ${taskIdTrim} phase context (${inferred ?? "unknown"}).`
        };
      }
    }
    return { ok: true, phaseKey: phaseKeyTrim, source: "phaseKey" };
  }

  if (taskIdTrim && args.task) {
    const inferred = inferPhaseKeyFromTask(args.task);
    if (!inferred) {
      return {
        ok: false,
        code: "phase-note-phase-unresolved",
        message: `Provide phaseKey or a taskId whose task has phaseKey/phase metadata (task '${taskIdTrim}' has none).`
      };
    }
    return { ok: true, phaseKey: inferred, source: "task" };
  }

  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: args.effectiveConfig,
    workspaceStatus: args.workspaceStatus
  });
  if (phaseRes.canonicalPhaseKey) {
    return {
      ok: true,
      phaseKey: phaseRes.canonicalPhaseKey,
      source: phaseRes.source === "workspace-status" ? "workspace-status" : "config"
    };
  }

  return {
    ok: false,
    code: "phase-note-phase-unresolved",
    message:
      "Provide phaseKey or taskId for phase inference, or set canonical workspace phase (workspace-kit run set-current-phase / kit_workspace_status / kit.currentPhaseNumber)."
  };
}
