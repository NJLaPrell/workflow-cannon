import { randomUUID } from "node:crypto";
import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores, type OpenedPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { TASK_ID_RE } from "../task-engine/mutation-utils.js";
import {
  applyStashSha,
  diffNameStatus,
  getHeadSha,
  isGitRepo,
  isWorkingTreeClean,
  isWorkingTreeCleanIgnoringWorkspaceKit,
  readWorkingTreeManifest,
  createStash,
  resetHard,
  rewindBlockedByManifest
} from "./checkpoint-git.js";
import {
  assertCheckpointKitSchema,
  getCheckpointById,
  insertCheckpoint,
  listCheckpoints,
  type CheckpointRow
} from "./checkpoint-store.js";

export { readAutoCheckpointConfig, tryAutoCheckpointBeforeRun } from "./checkpoint-auto.js";

function serializeCheckpoint(row: CheckpointRow): Record<string, unknown> {
  return {
    id: row.id,
    createdAt: row.createdAt,
    taskId: row.taskId,
    actor: row.actor,
    label: row.label,
    actionType: row.actionType,
    refKind: row.refKind,
    gitHeadSha: row.gitHeadSha,
    secondaryRef: row.secondaryRef,
    manifest: row.manifest,
    metadata: row.metadata
  };
}

async function openPlanningForCheckpoints(
  ctx: Parameters<NonNullable<WorkflowModule["onCommand"]>>[1]
): Promise<{ ok: true; planning: OpenedPlanningStores } | { ok: false; result: ModuleCommandResult }> {
  try {
    const planning = await openPlanningStores(ctx);
    const schemaOk = assertCheckpointKitSchema(planning.sqliteDual.dbPath);
    if (!schemaOk.ok) {
      return {
        ok: false,
        result: { ok: false, code: "checkpoint-schema", message: schemaOk.message }
      };
    }
    return { ok: true, planning };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, result: { ok: false, code: err.code, message: err.message } };
    }
    return {
      ok: false,
      result: {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open planning stores: ${(err as Error).message}`
      }
    };
  }
}

export const checkpointsModule: WorkflowModule = {
  registration: {
    id: "checkpoints",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["checkpoints"],
    dependsOn: [],
    optionalPeers: ["task-engine"],
    enabledByDefault: true,
    config: {
      path: "src/modules/checkpoints/config.md",
      format: "md",
      description: "Task-linked git checkpoints in kit SQLite (Phase 64)."
    },
    instructions: {
      directory: "src/modules/checkpoints/instructions",
      entries: builtinInstructionEntriesForModule("checkpoints")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;
    const ws = ctx.workspacePath;

    if (!isGitRepo(ws)) {
      return {
        ok: false,
        code: "checkpoint-no-git",
        message: "checkpoints commands require a git repository at the workspace root"
      };
    }

    const opened = await openPlanningForCheckpoints(ctx);
    if (!opened.ok) {
      return opened.result;
    }
    const { planning } = opened;
    try {
      const db = planning.sqliteDual.getDatabase();

    if (name === "list-checkpoints") {
      const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
      const limit =
        typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 100;
      const rows = listCheckpoints(db, { taskId: taskId || undefined, limit });
      return {
        ok: true,
        code: "checkpoints-listed",
        message: `Listed ${rows.length} checkpoint(s)`,
        data: { checkpoints: rows.map(serializeCheckpoint), count: rows.length }
      };
    }

    if (name === "compare-checkpoint") {
      const checkpointId = typeof args.checkpointId === "string" ? args.checkpointId.trim() : "";
      if (!checkpointId) {
        return { ok: false, code: "invalid-args", message: "compare-checkpoint requires checkpointId" };
      }
      const row = getCheckpointById(db, checkpointId);
      if (!row) {
        return { ok: false, code: "checkpoint-not-found", message: `No checkpoint '${checkpointId}'` };
      }
      const head = getHeadSha(ws);
      if (!head.ok) {
        return { ok: false, code: "checkpoint-git-error", message: head.error };
      }
      if (!head.sha) {
        return { ok: false, code: "checkpoint-git-error", message: "git rev-parse returned empty" };
      }
      const fromRef = row.refKind === "stash" && row.secondaryRef ? row.secondaryRef : row.gitHeadSha;
      const diff = diffNameStatus(ws, fromRef, head.sha);
      if (!diff.ok) {
        return { ok: false, code: "checkpoint-git-diff-failed", message: diff.error };
      }
      return {
        ok: true,
        code: "checkpoint-compared",
        message: "Compared checkpoint ref to current HEAD",
        data: {
          checkpointId,
          refKind: row.refKind,
          compareFrom: fromRef,
          compareTo: head.sha,
          nameStatusLines: diff.stdout ? diff.stdout.split("\n").filter(Boolean) : []
        }
      };
    }

    if (name === "create-checkpoint") {
      const mode = args.mode === "stash" ? "stash" : "head";
      const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
      if (taskId && !TASK_ID_RE.test(taskId)) {
        return { ok: false, code: "invalid-args", message: "taskId must match T### pattern when set" };
      }
      const label = typeof args.label === "string" ? args.label.trim().slice(0, 200) : "";
      const id =
        typeof args.id === "string" && args.id.trim() ? args.id.trim().slice(0, 128) : `ckpt_${randomUUID()}`;
      const now = new Date().toISOString();
      const actor = typeof ctx.resolvedActor === "string" ? ctx.resolvedActor : null;

      const head = getHeadSha(ws);
      if (!head.ok) {
        return { ok: false, code: "checkpoint-git-error", message: head.error };
      }
      if (!head.sha) {
        return { ok: false, code: "checkpoint-git-error", message: "git rev-parse returned empty" };
      }
      const manifestR = readWorkingTreeManifest(ws);
      if (!manifestR.ok) {
        return { ok: false, code: "checkpoint-manifest-error", message: manifestR.error };
      }
      if (!manifestR.paths) {
        return { ok: false, code: "checkpoint-manifest-error", message: "manifest unavailable" };
      }

      if (mode === "stash") {
        if (manifestR.paths.length === 0) {
          insertCheckpoint(db, {
            id,
            createdAt: now,
            taskId: taskId || null,
            actor,
            label: label || null,
            actionType: "manual",
            refKind: "head",
            gitHeadSha: head.sha,
            manifest: manifestR.paths,
            metadata: { note: "stash mode with clean tree; recorded as head" }
          });
          planning.sqliteDual.persistSync();
          return {
            ok: true,
            code: "checkpoint-created",
            message: "Checkpoint created (clean tree; head record)",
            data: { checkpointId: id, refKind: "head" as const }
          };
        }
        const stash = createStash(ws, `workspace-kit:checkpoint:${id}`);
        if (!stash.ok) {
          return { ok: false, code: "checkpoint-stash-failed", message: stash.error };
        }
        if (!stash.stashSha) {
          return { ok: false, code: "checkpoint-stash-failed", message: "stash ref missing after push" };
        }
        const headAfter = getHeadSha(ws);
        const sha = headAfter.ok && headAfter.sha ? headAfter.sha : head.sha;
        insertCheckpoint(db, {
          id,
          createdAt: now,
          taskId: taskId || null,
          actor,
          label: label || null,
          actionType: "manual",
          refKind: "stash",
          gitHeadSha: sha,
          secondaryRef: stash.stashSha,
          manifest: manifestR.paths
        });
        planning.sqliteDual.persistSync();
        return {
          ok: true,
          code: "checkpoint-created",
          message: "Checkpoint created (stash)",
          data: { checkpointId: id, refKind: "stash" as const, stashSha: stash.stashSha }
        };
      }

      insertCheckpoint(db, {
        id,
        createdAt: now,
        taskId: taskId || null,
        actor,
        label: label || null,
        actionType: "manual",
        refKind: "head",
        gitHeadSha: head.sha,
        manifest: manifestR.paths
      });
      planning.sqliteDual.persistSync();
      return {
        ok: true,
        code: "checkpoint-created",
        message: "Checkpoint created (head pointer)",
        data: { checkpointId: id, refKind: "head" as const }
      };
    }

    if (name === "rewind-to-checkpoint") {
      const checkpointId = typeof args.checkpointId === "string" ? args.checkpointId.trim() : "";
      if (!checkpointId) {
        return { ok: false, code: "invalid-args", message: "rewind-to-checkpoint requires checkpointId" };
      }
      const force = args.force === true;
      const row = getCheckpointById(db, checkpointId);
      if (!row) {
        return { ok: false, code: "checkpoint-not-found", message: `No checkpoint '${checkpointId}'` };
      }
      const block = rewindBlockedByManifest(row.manifest, ws);
      if (block) {
        return { ok: false, code: "checkpoint-rewind-refused", message: block };
      }
      if (!force && !isWorkingTreeCleanIgnoringWorkspaceKit(ws)) {
        return {
          ok: false,
          code: "checkpoint-rewind-dirty",
          message:
            "Working tree is not clean; pass force:true to allow destructive rewind, or stash/commit first"
        };
      }

      if (row.refKind === "stash") {
        if (!row.secondaryRef) {
          return {
            ok: false,
            code: "checkpoint-rewind-invalid",
            message: "Stash checkpoint missing secondaryRef"
          };
        }
        const applied = applyStashSha(ws, row.secondaryRef);
        if (!applied.ok) {
          return {
            ok: false,
            code: "checkpoint-rewind-failed",
            message: `git stash apply failed: ${applied.error}`
          };
        }
        return {
          ok: true,
          code: "checkpoint-rewound",
          message: "Applied stash checkpoint",
          data: { checkpointId, refKind: "stash", stashSha: row.secondaryRef }
        };
      }

      const reset = resetHard(ws, row.gitHeadSha);
      if (!reset.ok) {
        return {
          ok: false,
          code: "checkpoint-rewind-failed",
          message: `git reset --hard failed: ${reset.error}`
        };
      }
      return {
        ok: true,
        code: "checkpoint-rewound",
        message: "Reset hard to recorded HEAD",
        data: { checkpointId, refKind: "head", commitSha: row.gitHeadSha }
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `checkpoints module: unhandled command '${name}'`
    };
    } finally {
      planning.sqliteDual.closeDatabase();
    }
  }
};
