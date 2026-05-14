import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { attachPolicyMeta } from "./attach-planning-response-meta.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings
} from "./planning-config.js";
import {
  digestPayload,
  findIdempotentMutation,
  mutationEvidence,
  readIdempotencyValue,
  readOptionalExpectedPlanningGeneration
} from "./mutation-utils.js";
import type { OpenedPlanningStores } from "./persistence/planning-open.js";
import type { TaskStore } from "./persistence/store.js";
import {
  buildOrderedPhaseCatalogList,
  collectPhaseCatalogHintsFromTasks,
  deletePhaseCatalogRow,
  enrichFuturePhaseCatalogWithTaskSummaries,
  normalizeCatalogShortDescription,
  phaseCatalogTableAvailable,
  upsertPhaseCatalogRow,
  validatePhaseCatalogKey
} from "./persistence/phase-catalog-store.js";
import {
  kitWorkspaceStatusPublicToSnapshot,
  openSqliteDualForWorkspaceStatus,
  readKitWorkspaceStatusRow,
  readWorkspaceStatusSnapshotFromDual
} from "./persistence/workspace-status-store.js";
import { parseLeadingPhaseOrdinal, resolveCanonicalPhase } from "./phase-resolution.js";
import { TaskEngineError } from "./transitions.js";

function nowIso(): string {
  return new Date().toISOString();
}

const phaseCatalogMutationCache = new Map<string, string>();

function phaseCatalogMutationCacheKey(workspacePath: string, phaseKey: string, clientMutationId: string): string {
  return `${workspacePath}::${phaseKey}::${clientMutationId}`;
}

export async function runListPhaseCatalog(ctx: ModuleLifecycleContext): Promise<ModuleCommandResult> {
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const ws = readKitWorkspaceStatusRow(db);
    const taskHints = collectPhaseCatalogHintsFromTasks(dual.taskDocument.tasks);
    const phasesRaw = buildOrderedPhaseCatalogList(db, ws, taskHints);
    const phases = enrichFuturePhaseCatalogWithTaskSummaries(
      phasesRaw,
      dual.taskDocument.tasks,
      ws?.currentKitPhase ?? null
    );
    const data: Record<string, unknown> = {
      schemaVersion: 1,
      phases,
      supported: phaseCatalogTableAvailable(db)
    };
    attachPolicyMeta(data, ctx, dual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-catalog-listed",
      message:
        phases.length === 0
          ? "Phase catalog is empty"
          : phases.length === 1
            ? "Listed 1 phase catalog entry"
            : `Listed ${phases.length} phase catalog entries`,
      data
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to list phase catalog: ${(e as Error).message}`
    };
  }
}

export async function runUpsertPhaseCatalogEntry(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  rawArgs: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const pkRaw = typeof rawArgs.phaseKey === "string" ? rawArgs.phaseKey : "";
  const phaseKey = validatePhaseCatalogKey(pkRaw);
  if (!phaseKey) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "upsert-phase-catalog-entry requires phaseKey (non-empty; letters, digits, dot, underscore, hyphen; max 64 chars)"
    };
  }

  const remove = rawArgs.remove === true;
  const actorRaw = typeof rawArgs.actor === "string" ? rawArgs.actor.trim() : "";
  const actor = actorRaw.length > 0 ? actorRaw : undefined;
  const clientMutationId = readIdempotencyValue(rawArgs);
  const descNorm = normalizeCatalogShortDescription(rawArgs.shortDescription);
  if (!descNorm.ok) {
    return { ok: false, code: "invalid-task-schema", message: descNorm.message };
  }
  if (remove && !descNorm.omit && rawArgs.shortDescription !== undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "upsert-phase-catalog-entry cannot combine remove:true with shortDescription"
    };
  }

  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const assignedOrd = parseLeadingPhaseOrdinal(phaseKey);
  const wsOrd =
    phaseRes.canonicalPhaseKey !== undefined && phaseRes.canonicalPhaseKey !== null
      ? parseLeadingPhaseOrdinal(phaseRes.canonicalPhaseKey)
      : null;
  if (assignedOrd !== null && wsOrd !== null && assignedOrd < wsOrd) {
    return {
      ok: false,
      code: "phase-target-before-current-workspace-phase",
      message: `upsert-phase-catalog-entry rejects '${phaseKey}' because its leading phase number (${assignedOrd}) is before workspace current kit phase (${phaseRes.canonicalPhaseKey})`
    };
  }

  const gate = enforcePlanningGenerationPolicy(
    getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    rawArgs
  );
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const dual = planning.sqliteDual;
  const db = dual.getDatabase();
  if (!phaseCatalogTableAvailable(db)) {
    return {
      ok: false,
      code: "phase-catalog-unavailable",
      message: "kit_phase_catalog requires planning SQLite user_version 23+ (upgrade workspace-kit / reopen DB)"
    };
  }

  let nextShort: string | null;
  if (remove) {
    nextShort = null;
  } else if (descNorm.omit) {
    const row = db
      .prepare("SELECT short_description FROM kit_phase_catalog WHERE phase_key = ?")
      .get(phaseKey) as { short_description: string | null } | undefined;
    nextShort = row?.short_description ?? null;
  } else {
    nextShort = descNorm.value;
  }

  const payloadDigest = digestPayload({
    command: "upsert-phase-catalog-entry",
    phaseKey,
    remove,
    shortDescription: nextShort
  });
  if (clientMutationId) {
    const cacheKey = phaseCatalogMutationCacheKey(ctx.workspacePath, phaseKey, clientMutationId);
    const cachedDigest = phaseCatalogMutationCache.get(cacheKey);
    if (cachedDigest !== undefined) {
      if (cachedDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different upsert-phase-catalog-entry payload on ${phaseKey}`
        };
      }
      const wsReplay = readKitWorkspaceStatusRow(db);
      const taskHintsReplay = collectPhaseCatalogHintsFromTasks(dual.taskDocument.tasks);
      const phasesRawReplay = buildOrderedPhaseCatalogList(db, wsReplay, taskHintsReplay);
      const phasesReplay = enrichFuturePhaseCatalogWithTaskSummaries(
        phasesRawReplay,
        dual.taskDocument.tasks,
        wsReplay?.currentKitPhase ?? null
      );
      const replayData: Record<string, unknown> = {
        schemaVersion: 1,
        phaseKey,
        removed: remove,
        shortDescription: remove ? null : nextShort,
        phases: phasesReplay,
        workspaceStatus: wsReplay ? kitWorkspaceStatusPublicToSnapshot(wsReplay) : null,
        replayed: true
      };
      attachPolicyMeta(replayData, ctx, dual.getPlanningGeneration());
      return {
        ok: true,
        code: remove ? "phase-catalog-entry-remove-idempotent-replay" : "phase-catalog-entry-upsert-idempotent-replay",
        message: `Idempotent upsert-phase-catalog-entry replay for '${phaseKey}'`,
        data: replayData
      };
    }

    const prior = findIdempotentMutation(store, "upsert-phase-catalog-entry", phaseKey, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different upsert-phase-catalog-entry payload on ${phaseKey}`
        };
      }
      const wsReplay = readKitWorkspaceStatusRow(db);
      const taskHintsReplay = collectPhaseCatalogHintsFromTasks(dual.taskDocument.tasks);
      const phasesRawReplay = buildOrderedPhaseCatalogList(db, wsReplay, taskHintsReplay);
      const phasesReplay = enrichFuturePhaseCatalogWithTaskSummaries(
        phasesRawReplay,
        dual.taskDocument.tasks,
        wsReplay?.currentKitPhase ?? null
      );
      const replayData: Record<string, unknown> = {
        schemaVersion: 1,
        phaseKey,
        removed: remove,
        shortDescription: remove ? null : nextShort,
        phases: phasesReplay,
        workspaceStatus: wsReplay ? kitWorkspaceStatusPublicToSnapshot(wsReplay) : null,
        replayed: true
      };
      attachPolicyMeta(replayData, ctx, dual.getPlanningGeneration());
      return {
        ok: true,
        code: remove ? "phase-catalog-entry-remove-idempotent-replay" : "phase-catalog-entry-upsert-idempotent-replay",
        message: `Idempotent upsert-phase-catalog-entry replay for '${phaseKey}'`,
        data: replayData
      };
    }
  }

  try {
    store.addMutationEvidence(
      mutationEvidence("upsert-phase-catalog-entry", phaseKey, actor, {
        phaseKey,
        remove,
        shortDescription: nextShort,
        clientMutationId,
        payloadDigest
      })
    );
    await store.save({
      expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(rawArgs),
      beforePersistInSqliteTransaction: () => {
        if (remove) {
          deletePhaseCatalogRow(db, phaseKey);
        } else {
          upsertPhaseCatalogRow(db, phaseKey, nextShort, nowIso());
        }
      },
    });
    if (clientMutationId) {
      phaseCatalogMutationCache.set(
        phaseCatalogMutationCacheKey(ctx.workspacePath, phaseKey, clientMutationId),
        payloadDigest
      );
    }
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message, data: e.details as Record<string, unknown> | undefined };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `upsert-phase-catalog-entry failed: ${(e as Error).message}`
    };
  }

  const wsAfter = readKitWorkspaceStatusRow(db);
  const taskHintsAfter = collectPhaseCatalogHintsFromTasks(dual.taskDocument.tasks);
  const phasesRaw = buildOrderedPhaseCatalogList(db, wsAfter, taskHintsAfter);
  const phases = enrichFuturePhaseCatalogWithTaskSummaries(
    phasesRaw,
    dual.taskDocument.tasks,
    wsAfter?.currentKitPhase ?? null
  );
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    phaseKey,
    removed: remove,
    shortDescription: remove ? null : nextShort,
    phases,
    workspaceStatus: wsAfter ? kitWorkspaceStatusPublicToSnapshot(wsAfter) : null
  };
  mergePlanningGenerationPolicyWarnings(data, gate.warnings);
  attachPolicyMeta(data, ctx, dual.getPlanningGeneration());
  return {
    ok: true,
    code: remove ? "phase-catalog-entry-removed" : "phase-catalog-entry-upserted",
    message: remove ? `Removed phase catalog entry '${phaseKey}'` : `Upserted phase catalog entry '${phaseKey}'`,
    data
  };
}
