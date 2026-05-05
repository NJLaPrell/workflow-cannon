import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { validateTaskSkillAttachments } from "../../../core/skills/task-skill-validation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { collectUnknownFeatureSlugWarnings } from "../feature-slug-validation.js";
import {
  allocateNextTaskId,
  digestPayload,
  findIdempotentAllocatedCreate,
  isRecordLike,
  mutationEvidence,
  nowIso,
  planningConcurrencySaveOpts,
  readIdempotencyValue
} from "../mutation-utils.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { resolveKnownFeatureSlugSet } from "../persistence/feature-registry-queries.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import { strictValidationError } from "./strict-store-validation.js";
import { findUnknownFeatureIds, taskTypeFailsClosedOnUnknownFeatures } from "../task-feature-mutation-validation.js";
import { validateKnownTaskTypeRequirements } from "../task-type-validation.js";
import { TaskEngineError } from "../transitions.js";
import type { TaskEntity, TaskPriority, TaskStatus } from "../types.js";
import { PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK } from "../phase-journal/phase-journal-constants.js";
import { isPassivelyExpiredActiveNote } from "../phase-journal/phase-journal-expiry.js";
import { guardPhaseNoteConvertTaskPayload } from "../phase-journal/phase-journal-secret-guard.js";
import {
  createPhaseJournalStore,
  markPhaseNoteConvertedInConnection,
  markPhaseNoteTaskSuggestionsConvertedInConnection,
  phaseNoteTaskSuggestionsTableExists
} from "../phase-journal/phase-journal-store.js";

const CONVERTIBLE_NOTE_TYPES_ARR = [...PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK];

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Create a **proposed** execution task from an active convertible phase note and mark the note
 * **`converted`** in the same planning SQLite transaction as the task persist.
 */
export async function runConvertPhaseNoteToTaskCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const noteId = readStringField(args, "noteId")?.trim() ?? "";
  if (!noteId) {
    return { ok: false, code: "invalid-phase-note-args", message: "noteId is required." };
  }

  const suggestionIdOpt = readStringField(args, "suggestionId")?.trim();

  const allocateId = args.allocateId !== false;
  if (!allocateId) {
    return {
      ok: false,
      code: "invalid-phase-note-args",
      message: "convert-phase-note-to-task requires allocateId true (omit or pass true) for server-side id allocation."
    };
  }

  const statusRaw = typeof args.status === "string" ? args.status.trim() : "proposed";
  if (statusRaw !== "proposed") {
    return {
      ok: false,
      code: "invalid-phase-note-args",
      message: "convert-phase-note-to-task only supports status \"proposed\"; promote beyond proposed via run-transition."
    };
  }

  const actor =
    typeof args.actor === "string"
      ? args.actor
      : ctx.resolvedActor !== undefined
        ? ctx.resolvedActor
        : undefined;

  const clientMutationId = readIdempotencyValue(args);
  const dryRun = args.dryRun === true;

  const db = planning.sqliteDual.getDatabase();
  const journal = createPhaseJournalStore(db);
  const gen = planning.sqliteDual.getPlanningGeneration();

  const note = journal.getById(noteId);
  if (!note) {
    return { ok: false, code: "phase-note-not-found", message: `Unknown noteId '${noteId}'.` };
  }
  if (note.status !== "active" || note.convertedTaskId) {
    return {
      ok: false,
      code: "phase-note-not-convertible",
      message: "Note is not an active unconverted phase note."
    };
  }
  if (isPassivelyExpiredActiveNote(note, Date.now())) {
    return {
      ok: false,
      code: "phase-note-expired",
      message: "Note is past expires_at while still active; extend via update-phase-note before converting."
    };
  }
  if (!PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK.has(note.noteType)) {
    return {
      ok: false,
      code: "phase-note-not-convertible",
      message: `Note type '${note.noteType}' cannot be converted to a task (allowed: ${CONVERTIBLE_NOTE_TYPES_ARR.join(", ")}).`
    };
  }

  if (suggestionIdOpt) {
    if (!phaseNoteTaskSuggestionsTableExists(db)) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: "suggestionId requires kit SQLite DDL for phase_note_task_suggestions (user_version 20+)."
      };
    }
    const row = db.prepare(`SELECT note_id FROM phase_note_task_suggestions WHERE id = ?`).get(suggestionIdOpt) as
      | { note_id: string }
      | undefined;
    if (!row || row.note_id !== noteId) {
      return {
        ok: false,
        code: "phase-note-suggestion-not-found",
        message: "suggestionId does not match the given noteId."
      };
    }
  }

  const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
  const title =
    typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : note.summary.trim();
  const summaryField =
    typeof args.summary === "string" && args.summary.trim().length > 0 ? args.summary.trim() : note.summary.trim();
  const description =
    typeof args.description === "string"
      ? args.description
      : note.details != null && note.details.length > 0
        ? note.details
        : undefined;

  const secretPayload = guardPhaseNoteConvertTaskPayload(args, {
    title,
    summary: summaryField,
    description: typeof description === "string" ? description : undefined
  });
  if (!secretPayload.ok) {
    return { ok: false, code: secretPayload.code, message: secretPayload.message };
  }

  const priority =
    typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
      ? (args.priority as TaskPriority)
      : undefined;

  const baseMeta: Record<string, unknown> =
    typeof args.metadata === "object" && args.metadata !== null && !Array.isArray(args.metadata)
      ? { ...(args.metadata as Record<string, unknown>) }
      : {};
  const prevPj = isRecordLike(baseMeta.phaseJournal) ? { ...(baseMeta.phaseJournal as Record<string, unknown>) } : {};
  baseMeta.phaseJournal = {
    ...prevPj,
    convertedFromNoteId: note.id,
    convertedFromNoteType: note.noteType
  };

  const timestamp = nowIso();
  const resolvedId = allocateNextTaskId(store.getAllTasks());
  const phaseLabel =
    note.phaseLabel && note.phaseLabel.trim().length > 0 ? note.phaseLabel.trim() : `Phase ${note.phaseKey}`;

  const task: TaskEntity = {
    id: resolvedId,
    title,
    type,
    status: statusRaw as TaskStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    priority,
    dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.filter((x) => typeof x === "string") : undefined,
    unblocks: Array.isArray(args.unblocks) ? args.unblocks.filter((x) => typeof x === "string") : undefined,
    phase: typeof args.phase === "string" && args.phase.trim().length > 0 ? args.phase.trim() : phaseLabel,
    phaseKey: typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : note.phaseKey,
    metadata: baseMeta,
    ownership: typeof args.ownership === "string" ? args.ownership : undefined,
    approach: typeof args.approach === "string" ? args.approach : undefined,
    summary: summaryField,
    description,
    risk: typeof args.risk === "string" ? args.risk : undefined,
    technicalScope: Array.isArray(args.technicalScope) ? args.technicalScope.filter((x) => typeof x === "string") : undefined,
    acceptanceCriteria: Array.isArray(args.acceptanceCriteria)
      ? args.acceptanceCriteria.filter((x) => typeof x === "string")
      : undefined,
    features: Array.isArray(args.features) ? args.features.filter((x) => typeof x === "string") : undefined
  };

  const createPayloadForDigest = {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    priority: task.priority,
    dependsOn: task.dependsOn ?? [],
    unblocks: task.unblocks ?? [],
    phase: task.phase ?? null,
    phaseKey: task.phaseKey ?? null,
    metadata: task.metadata ?? null,
    ownership: task.ownership ?? null,
    approach: task.approach ?? null,
    summary: task.summary ?? null,
    description: task.description ?? null,
    risk: task.risk ?? null,
    technicalScope: task.technicalScope ?? [],
    acceptanceCriteria: task.acceptanceCriteria ?? [],
    features: task.features ?? []
  };
  const payloadDigest = digestPayload(createPayloadForDigest);

  if (allocateId && clientMutationId) {
    const priorAlloc = findIdempotentAllocatedCreate(store, "create-task", clientMutationId);
    if (priorAlloc) {
      const existing = store.getTask(priorAlloc.taskId);
      if (!existing) {
        return {
          ok: false,
          code: "task-not-found",
          message: `Idempotent allocate replay expected task '${priorAlloc.taskId}' to exist`
        };
      }
      const replayDigest = digestPayload({
        id: existing.id,
        title: existing.title,
        type: existing.type,
        status: existing.status,
        priority: existing.priority,
        dependsOn: existing.dependsOn ?? [],
        unblocks: existing.unblocks ?? [],
        phase: existing.phase ?? null,
        phaseKey: existing.phaseKey ?? null,
        metadata: existing.metadata ?? null,
        ownership: existing.ownership ?? null,
        approach: existing.approach ?? null,
        summary: existing.summary ?? null,
        description: existing.description ?? null,
        risk: existing.risk ?? null,
        technicalScope: existing.technicalScope ?? [],
        acceptanceCriteria: existing.acceptanceCriteria ?? [],
        features: existing.features ?? []
      });
      if (priorAlloc.payloadDigest !== replayDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different create-task payload on ${existing.id}`
        };
      }
      const replayCreate: Record<string, unknown> = {
        task: existing,
        replayed: true,
        sourcePhaseNoteId: note.id
      };
      attachPolicyMeta(replayCreate, ctx, gen);
      return {
        ok: true,
        code: "task-create-idempotent-replay",
        message: `Idempotent create replay for task '${existing.id}'`,
        data: replayCreate
      };
    }
  }

  if (store.getTask(resolvedId)) {
    return { ok: false, code: "duplicate-task-id", message: `Task '${resolvedId}' already exists` };
  }

  const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
  if (knownTypeValidationError) {
    return {
      ok: false,
      code: knownTypeValidationError.code,
      message: knownTypeValidationError.message
    };
  }

  const pgCreate = planningGenPolicyGate(
    ctx,
    args,
    CLI_REMEDIATION_INSTRUCTIONS.createTask,
    gen
  );
  if (pgCreate.block) {
    return pgCreate.block;
  }

  const knownSlugs = resolveKnownFeatureSlugSet(db);
  const badFeat = findUnknownFeatureIds(task.features, knownSlugs);
  if (badFeat.length > 0 && taskTypeFailsClosedOnUnknownFeatures(task.type)) {
    return {
      ok: false,
      code: "unknown-feature-id",
      message: `Unknown feature id(s): ${badFeat.join(", ")}`
    };
  }
  const featureSlugWarnings = collectUnknownFeatureSlugWarnings(task.features, knownSlugs);

  const skillAttach = validateTaskSkillAttachments(
    ctx.workspacePath,
    ctx.effectiveConfig as Record<string, unknown> | undefined,
    task.metadata
  );
  if (!skillAttach.ok) {
    return { ok: false, code: skillAttach.code, message: skillAttach.message };
  }

  if (dryRun) {
    const dryData: Record<string, unknown> = {
      task,
      dryRun: true,
      allocateId: true,
      sourcePhaseNoteId: note.id
    };
    attachPolicyMeta(dryData, ctx, gen, [...(pgCreate.warnings ?? []), ...featureSlugWarnings]);
    return {
      ok: true,
      code: "task-create-dry-run",
      message: `Dry run: validated convert-phase-note-to-task for '${resolvedId}' (no persistence)`,
      data: dryData
    };
  }

  store.addTask(task);
  store.addMutationEvidence(
    mutationEvidence("create-task", resolvedId, actor, {
      initialStatus: task.status,
      source: "convert-phase-note-to-task",
      sourcePhaseNoteId: note.id,
      clientMutationId,
      payloadDigest,
      allocateId: true
    })
  );

  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }

  try {
    await store.save({
      ...planningConcurrencySaveOpts(args),
      beforePersistInSqliteTransaction: () => {
        const ok = markPhaseNoteConvertedInConnection(db, noteId, resolvedId, CONVERTIBLE_NOTE_TYPES_ARR);
        if (!ok) {
          throw new TaskEngineError(
            "phase-note-not-convertible",
            "Phase note could not be marked converted (concurrent convert, wrong type, or note no longer active)."
          );
        }
        markPhaseNoteTaskSuggestionsConvertedInConnection(db, noteId, resolvedId, suggestionIdOpt);
      }
    });
  } catch (err) {
    await store.load();
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const createdData: Record<string, unknown> = {
    task: store.getTask(resolvedId) ?? task,
    sourcePhaseNoteId: note.id
  };
  attachPolicyMeta(createdData, ctx, planning.sqliteDual.getPlanningGeneration(), [
    ...(pgCreate.warnings ?? []),
    ...featureSlugWarnings
  ]);
  return {
    ok: true,
    code: "phase-note-converted-to-task",
    message: `Created task '${resolvedId}' from phase note '${noteId}'`,
    data: createdData
  };
}
