import { randomUUID } from "node:crypto";
import { openPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  createStash,
  getHeadSha,
  isGitRepo,
  isWorkingTreeCleanIgnoringWorkspaceKit,
  readWorkingTreeManifest
} from "./checkpoint-git.js";
import { assertCheckpointKitSchema, insertCheckpoint } from "./checkpoint-store.js";

const SKIP_AUTO = new Set([
  "create-checkpoint",
  "list-checkpoints",
  "compare-checkpoint",
  "rewind-to-checkpoint"
]);

export type AutoCheckpointConfig = {
  enabled: boolean;
  beforeCommands: string[];
  stashWhenDirty: boolean;
};

export function readAutoCheckpointConfig(
  effective: Record<string, unknown> | undefined
): AutoCheckpointConfig {
  const def: AutoCheckpointConfig = {
    enabled: false,
    beforeCommands: ["run-transition"],
    stashWhenDirty: true
  };
  const kit = effective?.kit;
  if (!kit || typeof kit !== "object" || Array.isArray(kit)) {
    return def;
  }
  const ac = (kit as Record<string, unknown>).autoCheckpoint;
  if (!ac || typeof ac !== "object" || Array.isArray(ac)) {
    return def;
  }
  const o = ac as Record<string, unknown>;
  const enabled = o.enabled === true;
  let beforeCommands = def.beforeCommands;
  if (Array.isArray(o.beforeCommands)) {
    const next = o.beforeCommands.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
    if (next.length > 0) {
      beforeCommands = next;
    }
  }
  const stashWhenDirty = o.stashWhenDirty !== false;
  return { enabled, beforeCommands, stashWhenDirty };
}

function isCheckpointsModuleDisabled(effective: Record<string, unknown> | undefined): boolean {
  const mods = effective?.modules;
  if (!mods || typeof mods !== "object" || Array.isArray(mods)) {
    return false;
  }
  const disabled = (mods as Record<string, unknown>).disabled;
  if (!Array.isArray(disabled)) {
    return false;
  }
  return disabled.some((x) => x === "checkpoints");
}

/**
 * When kit.autoCheckpoint.enabled, persist a head or stash checkpoint before selected commands.
 * Fail-closed on errors (operator opted in).
 */
export async function tryAutoCheckpointBeforeRun(opts: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown>;
  subcommand: string;
  actor: string | null;
}): Promise<
  { ok: true; checkpointId?: string; skippedReason?: string } | { ok: false; code: string; message: string }
> {
  const cfg = readAutoCheckpointConfig(opts.effectiveConfig);
  if (!cfg.enabled) {
    return { ok: true, skippedReason: "disabled" };
  }
  if (!cfg.beforeCommands.includes(opts.subcommand)) {
    return { ok: true, skippedReason: "not-listed" };
  }
  if (SKIP_AUTO.has(opts.subcommand)) {
    return { ok: true, skippedReason: "checkpoint-command" };
  }
  if (isCheckpointsModuleDisabled(opts.effectiveConfig)) {
    return {
      ok: false,
      code: "auto-checkpoint-module-disabled",
      message:
        "kit.autoCheckpoint.enabled but modules.disabled includes 'checkpoints'; re-enable module or turn off autoCheckpoint"
    };
  }
  if (!isGitRepo(opts.workspacePath)) {
    return {
      ok: false,
      code: "auto-checkpoint-no-git",
      message: "kit.autoCheckpoint.enabled but workspace is not a git repository"
    };
  }

  let planning;
  try {
    planning = await openPlanningStores({
      workspacePath: opts.workspacePath,
      effectiveConfig: opts.effectiveConfig,
      runtimeVersion: "0.1",
      resolvedActor: opts.actor ?? undefined
    });
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "auto-checkpoint-store-error",
      message: `Failed to open planning stores: ${(err as Error).message}`
    };
  }

  const dbPathAbs = planning.sqliteDual.dbPath;
  const schemaOk = assertCheckpointKitSchema(dbPathAbs);
  if (!schemaOk.ok) {
    return { ok: false, code: "auto-checkpoint-schema", message: schemaOk.message };
  }

  const db = planning.sqliteDual.getDatabase();
  const id = `ckpt_${randomUUID()}`;
  const now = new Date().toISOString();
  const head = getHeadSha(opts.workspacePath);
  if (!head.ok) {
    return { ok: false, code: "auto-checkpoint-git-head", message: head.error };
  }
  if (!head.sha) {
    return { ok: false, code: "auto-checkpoint-git-head", message: "git rev-parse returned empty" };
  }

  const manifestR = readWorkingTreeManifest(opts.workspacePath);
  if (!manifestR.ok) {
    return { ok: false, code: "auto-checkpoint-manifest", message: manifestR.error };
  }
  if (!manifestR.paths) {
    return { ok: false, code: "auto-checkpoint-manifest", message: "manifest unavailable" };
  }

  const clean = isWorkingTreeCleanIgnoringWorkspaceKit(opts.workspacePath);
  if (clean) {
    insertCheckpoint(db, {
      id,
      createdAt: now,
      actor: opts.actor,
      actionType: "auto",
      refKind: "head",
      gitHeadSha: head.sha,
      manifest: manifestR.paths,
      metadata: { trigger: opts.subcommand, auto: true }
    });
    planning.sqliteDual.persistSync();
    planning.sqliteDual.closeDatabase();
    return { ok: true, checkpointId: id };
  }

  if (!cfg.stashWhenDirty) {
    return {
      ok: false,
      code: "auto-checkpoint-dirty-worktree",
      message:
        "kit.autoCheckpoint enabled with stashWhenDirty=false but working tree is dirty; commit/stash manually or enable stashWhenDirty"
    };
  }

  const stash = createStash(opts.workspacePath, `workspace-kit:auto-checkpoint:${opts.subcommand}:${id}`);
  if (!stash.ok) {
    return { ok: false, code: "auto-checkpoint-stash-failed", message: stash.error };
  }
  if (!stash.stashSha) {
    return { ok: false, code: "auto-checkpoint-stash-failed", message: "stash ref missing after push" };
  }

  const headAfter = getHeadSha(opts.workspacePath);
  const sha = headAfter.ok && headAfter.sha ? headAfter.sha : head.sha;

  insertCheckpoint(db, {
    id,
    createdAt: now,
    actor: opts.actor,
    actionType: "auto",
    refKind: "stash",
    gitHeadSha: sha,
    secondaryRef: stash.stashSha,
    manifest: manifestR.paths,
    metadata: { trigger: opts.subcommand, auto: true }
  });
  planning.sqliteDual.persistSync();
  planning.sqliteDual.closeDatabase();
  return { ok: true, checkpointId: id };
}
