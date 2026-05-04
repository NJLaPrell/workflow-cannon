import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import {
  PHASE_JOURNAL_MIN_KIT_USER_VERSION,
  PHASE_NOTE_TASK_SUGGESTIONS_MIN_KIT_USER_VERSION,
  PHASE_NOTE_DETAILS_MAX,
  PHASE_NOTE_LIST_DEFAULT_LIMIT,
  PHASE_NOTE_LIST_MAX_LIMIT,
  PHASE_NOTE_PRIORITIES,
  PHASE_NOTE_REFS_MAX,
  PHASE_NOTE_REF_TYPES,
  PHASE_NOTE_STATUSES,
  PHASE_NOTE_SUMMARY_MAX,
  PHASE_NOTE_TYPES,
  PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK
} from "../phase-journal/phase-journal-constants.js";
import { projectPhaseNote, projectPhaseNoteTaskSuggestion, type PhaseNoteProjection } from "../phase-journal/phase-journal-projections.js";
import {
  filterOutPassiveExpiredActiveNotes,
  validatePhaseNoteExpiresAtForWrite
} from "../phase-journal/phase-journal-expiry.js";
import {
  createPhaseJournalStore,
  phaseNoteTaskSuggestionsTableExists,
  upsertPhaseNoteTaskSuggestionFromNote
} from "../phase-journal/phase-journal-store.js";
import type { CreatePhaseNoteInput, PhaseNoteStatus, UpdateActivePhaseNotePatch } from "../phase-journal/phase-journal-types.js";
import { sortPhaseNotesForContext } from "../phase-journal/phase-journal-scoring.js";
import { inferPhaseKeyFromTask, resolvePhaseKeyForPhaseJournalRead, type PhaseJournalPhaseKeySource } from "../phase-journal/phase-journal-phase-key.js";
import { runConvertPhaseNoteToTaskCommand } from "./phase-journal-convert-command.js";

function readKitUserVersion(db: { pragma: (name: string, options?: { simple: boolean }) => unknown }): number {
  const raw = db.pragma("user_version", { simple: true });
  return typeof raw === "number" ? raw : Number(raw);
}

function phaseJournalVersionError(current: number): ModuleCommandResult {
  return {
    ok: false,
    code: "phase-journal-kit-version",
    message: `Phase journal commands require kit SQLite user_version >= ${PHASE_JOURNAL_MIN_KIT_USER_VERSION} (current ${current}); open the workspace DB once with a current workspace-kit to migrate.`
  };
}

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function resolveJournalReadPhaseKeyForArgs(
  cmdArgs: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
):
  | { ok: true; phaseKey: string; phaseKeySource: PhaseJournalPhaseKeySource }
  | { ok: false; code: string; message: string } {
  const taskId = readStringField(cmdArgs, "taskId");
  const phaseKeyIn = readStringField(cmdArgs, "phaseKey");
  const task = taskId ? planning.taskStore.getTask(taskId) : undefined;
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
  const r = resolvePhaseKeyForPhaseJournalRead({
    phaseKey: phaseKeyIn,
    taskId,
    task,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message };
  }
  return { ok: true, phaseKey: r.phaseKey, phaseKeySource: r.source };
}

function parseRefInput(raw: unknown): { type: string; value: string } | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type.trim() : "";
  const value = typeof o.value === "string" ? o.value.trim() : "";
  if (!type || !value) {
    return null;
  }
  return { type, value };
}

export async function resolvePhaseJournalCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): Promise<ModuleCommandResult | null> {
  const names = new Set([
    "add-phase-note",
    "convert-phase-note-to-task",
    "list-phase-notes",
    "get-phase-context",
    "propose-tasks-from-phase-notes",
    "dismiss-phase-note",
    "supersede-phase-note",
    "update-phase-note"
  ]);
  if (!names.has(command.name)) {
    return null;
  }

  const db = planning.sqliteDual.getDatabase();
  const uv = readKitUserVersion(db);
  if (uv < PHASE_JOURNAL_MIN_KIT_USER_VERSION) {
    return phaseJournalVersionError(uv);
  }

  const store = createPhaseJournalStore(db);
  const args = (command.args ?? {}) as Record<string, unknown>;
  const gen = planning.sqliteDual.getPlanningGeneration();

  const okData = (data: Record<string, unknown>, code: string, message: string): ModuleCommandResult => {
    attachPolicyMeta(data, ctx, gen);
    return { ok: true, code, message, data };
  };

  if (command.name === "add-phase-note") {
    const taskId = readStringField(args, "taskId");
    let phaseKey = readStringField(args, "phaseKey");
    if (!phaseKey && taskId) {
      phaseKey = inferPhaseKeyFromTask(planning.taskStore.getTask(taskId)) ?? undefined;
    }
    if (!phaseKey?.trim()) {
      return { ok: false, code: "invalid-phase-note-args", message: "Provide phaseKey or a taskId whose task has phaseKey/phase metadata." };
    }
    phaseKey = phaseKey.trim();

    if (taskId) {
      const task = planning.taskStore.getTask(taskId);
      if (!task) {
        return { ok: false, code: "phase-note-task-not-found", message: `Unknown taskId '${taskId}'.` };
      }
      const inferred = inferPhaseKeyFromTask(task);
      if (inferred && inferred !== phaseKey) {
        return {
          ok: false,
          code: "phase-note-phase-task-mismatch",
          message: `phaseKey '${phaseKey}' does not match task ${taskId} phase context (${inferred ?? "unknown"}).`
        };
      }
    }

    const noteType = readStringField(args, "noteType")?.trim() ?? "";
    if (!PHASE_NOTE_TYPES.has(noteType)) {
      return {
        ok: false,
        code: "invalid-phase-note-type",
        message: `noteType must be one of: ${[...PHASE_NOTE_TYPES].join(", ")}`
      };
    }

    const summary = readStringField(args, "summary") ?? "";
    if (!summary.trim()) {
      return { ok: false, code: "invalid-phase-note-args", message: "summary is required." };
    }
    if (summary.length > PHASE_NOTE_SUMMARY_MAX) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: `summary exceeds ${PHASE_NOTE_SUMMARY_MAX} characters`
      };
    }

    const detailsRaw = readStringField(args, "details");
    if (detailsRaw && detailsRaw.length > PHASE_NOTE_DETAILS_MAX) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: `details exceeds ${PHASE_NOTE_DETAILS_MAX} characters`
      };
    }

    const refsRaw = args.refs;
    const refsIn: { refType: string; refValue: string }[] = [];
    if (refsRaw !== undefined) {
      if (!Array.isArray(refsRaw)) {
        return { ok: false, code: "invalid-phase-note-args", message: "refs must be an array when provided." };
      }
      if (refsRaw.length > PHASE_NOTE_REFS_MAX) {
        return {
          ok: false,
          code: "invalid-phase-note-args",
          message: `refs may include at most ${PHASE_NOTE_REFS_MAX} entries`
        };
      }
      for (const r of refsRaw) {
        const parsed = parseRefInput(r);
        if (!parsed) {
          return { ok: false, code: "invalid-phase-note-args", message: "Each ref needs non-empty type and value strings." };
        }
        if (!PHASE_NOTE_REF_TYPES.has(parsed.type)) {
          return {
            ok: false,
            code: "invalid-phase-note-ref-type",
            message: `ref type '${parsed.type}' is not allowed for MVP phase notes.`
          };
        }
        refsIn.push({ refType: parsed.type, refValue: parsed.value });
      }
    }

    const priorityRaw = readStringField(args, "priority")?.trim() ?? "normal";
    if (!PHASE_NOTE_PRIORITIES.has(priorityRaw)) {
      return { ok: false, code: "invalid-phase-note-priority", message: `priority must be one of: ${[...PHASE_NOTE_PRIORITIES].join(", ")}` };
    }

    const idempotencyKey = readStringField(args, "idempotencyKey")?.trim() || null;

    const expiresAtRaw = readStringField(args, "expiresAt")?.trim() ?? null;
    const expiryGate = validatePhaseNoteExpiresAtForWrite(expiresAtRaw, Date.now());
    if (!expiryGate.ok) {
      return { ok: false, code: "invalid-phase-note-args", message: expiryGate.message };
    }

    const input: CreatePhaseNoteInput = {
      phaseKey,
      phaseLabel: readStringField(args, "phaseLabel")?.trim() ?? null,
      taskId: taskId ?? null,
      author: readStringField(args, "author")?.trim() ?? null,
      authorKind: readStringField(args, "authorKind")?.trim() ?? null,
      sessionId: readStringField(args, "sessionId")?.trim() ?? null,
      sourceCommand: "add-phase-note",
      planningGeneration: gen,
      policyTraceId: readStringField(args, "policyTraceId")?.trim() ?? null,
      noteType,
      summary: summary.trim(),
      details: detailsRaw?.trim() ? detailsRaw : null,
      priority: priorityRaw as CreatePhaseNoteInput["priority"],
      expiresAt: expiresAtRaw,
      idempotencyKey,
      refs: refsIn
    };

    try {
      const result = store.createNoteIdempotent(input);
      const data: Record<string, unknown> = {
        created: result.created,
        note: projectPhaseNote(result.note)
      };
      return okData(data, "phase-note-created", result.created ? "Phase note created" : "Phase note returned (idempotent)");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("SQLITE_CONSTRAINT") || msg.includes("UNIQUE")) {
        return {
          ok: false,
          code: "phase-note-idempotency-conflict",
          message: "idempotency_key collides with a different note payload; use a fresh key."
        };
      }
      throw err;
    }
  }

  if (command.name === "list-phase-notes") {
    const taskId = readStringField(args, "taskId");
    const pr = resolveJournalReadPhaseKeyForArgs(args, ctx, planning);
    if (!pr.ok) {
      return pr;
    }
    const phaseKey = pr.phaseKey;
    const phaseKeySource = pr.phaseKeySource;

    let statusFilter: PhaseNoteStatus | PhaseNoteStatus[] | undefined;
    if (args.status === undefined) {
      statusFilter = "active";
    } else if (typeof args.status === "string") {
      if (!PHASE_NOTE_STATUSES.has(args.status)) {
        return { ok: false, code: "invalid-phase-note-status", message: `Invalid status '${args.status}'.` };
      }
      statusFilter = args.status as PhaseNoteStatus;
    } else if (Array.isArray(args.status)) {
      const st: PhaseNoteStatus[] = [];
      for (const s of args.status) {
        if (typeof s !== "string" || !PHASE_NOTE_STATUSES.has(s)) {
          return { ok: false, code: "invalid-phase-note-status", message: "status array entries must be valid phase note statuses." };
        }
        st.push(s as PhaseNoteStatus);
      }
      statusFilter = st;
    } else {
      return { ok: false, code: "invalid-phase-note-args", message: "status must be a string or string[] when provided." };
    }

    const limitRaw = args.limit;
    let limit = PHASE_NOTE_LIST_DEFAULT_LIMIT;
    if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
      limit = Math.min(Math.max(limitRaw, 1), PHASE_NOTE_LIST_MAX_LIMIT);
    }

    let rows = store.listNotes({ phaseKey, status: statusFilter, limit: PHASE_NOTE_LIST_MAX_LIMIT });
    const includeExpired = args.includeExpired === true;
    rows = filterOutPassiveExpiredActiveNotes(rows, includeExpired, Date.now());
    const noteTypeFilter = readStringField(args, "noteType")?.trim();
    if (noteTypeFilter) {
      if (!PHASE_NOTE_TYPES.has(noteTypeFilter)) {
        return { ok: false, code: "invalid-phase-note-type", message: `Invalid noteType filter '${noteTypeFilter}'.` };
      }
      rows = rows.filter((r) => r.noteType === noteTypeFilter);
    }
    if (taskId) {
      rows = rows.filter((r) => r.taskId === taskId);
    }
    rows = rows.slice(0, limit);

    const projections: PhaseNoteProjection[] = rows.map(projectPhaseNote);
    return okData(
      { phaseKey, phaseKeySource, notes: projections, count: projections.length },
      "phase-notes-listed",
      "Listed phase notes"
    );
  }

  if (command.name === "get-phase-context") {
    const taskId = readStringField(args, "taskId");
    const pr = resolveJournalReadPhaseKeyForArgs(args, ctx, planning);
    if (!pr.ok) {
      return pr;
    }
    const phaseKey = pr.phaseKey;
    const phaseKeySource = pr.phaseKeySource;

    const limitRaw = args.limit;
    let limit = PHASE_NOTE_LIST_DEFAULT_LIMIT;
    if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
      limit = Math.min(Math.max(limitRaw, 1), PHASE_NOTE_LIST_MAX_LIMIT);
    }

    const refKeys = new Set<string>();
    if (Array.isArray(args.refs)) {
      for (const r of args.refs) {
        const p = parseRefInput(r);
        if (p) {
          refKeys.add(`${p.type}:${p.value}`);
        }
      }
    }

    const includeExpired = args.includeExpired === true;
    const pool = filterOutPassiveExpiredActiveNotes(
      store.listNotes({ phaseKey, status: "active", limit: 200 }),
      includeExpired,
      Date.now()
    );
    const sorted = sortPhaseNotesForContext(pool, { phaseKey, taskId, refKeys });
    const picked = sorted.slice(0, limit).map(projectPhaseNote);
    return okData(
      { phaseKey, phaseKeySource, taskId: taskId ?? null, notes: picked, count: picked.length },
      "phase-context",
      "Resolved phase context"
    );
  }

  if (command.name === "propose-tasks-from-phase-notes") {
    const taskId = readStringField(args, "taskId");
    const pr = resolveJournalReadPhaseKeyForArgs(args, ctx, planning);
    if (!pr.ok) {
      return pr;
    }
    const phaseKey = pr.phaseKey;
    const phaseKeySource = pr.phaseKeySource;

    const limitRaw = args.limit;
    let limit = PHASE_NOTE_LIST_DEFAULT_LIMIT;
    if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
      limit = Math.min(Math.max(limitRaw, 1), PHASE_NOTE_LIST_MAX_LIMIT);
    }

    const pool = filterOutPassiveExpiredActiveNotes(
      store.listNotes({ phaseKey, status: "active", limit: PHASE_NOTE_LIST_MAX_LIMIT }),
      false,
      Date.now()
    );
    const convertible = pool
      .filter((n) => PHASE_NOTE_TYPES_CONVERTIBLE_TO_TASK.has(n.noteType))
      .filter((n) => (taskId ? n.taskId === taskId : true))
      .slice(0, limit);
    const proposals = convertible.map(projectPhaseNote);

    const persist = args.persist === true;
    if (!persist) {
      return okData(
        {
          phaseKey,
          phaseKeySource,
          taskId: taskId ?? null,
          proposals,
          persistedSuggestions: [],
          persisted: false,
          count: proposals.length
        },
        "phase-note-proposals-listed",
        "Listed convertible phase notes as proposals (read-only; no task writes)"
      );
    }

    if (uv < PHASE_NOTE_TASK_SUGGESTIONS_MIN_KIT_USER_VERSION) {
      return {
        ok: false,
        code: "phase-note-suggestions-kit-version",
        message: `persist requires kit SQLite user_version >= ${PHASE_NOTE_TASK_SUGGESTIONS_MIN_KIT_USER_VERSION} (current ${uv}).`
      };
    }
    if (!phaseNoteTaskSuggestionsTableExists(db)) {
      return {
        ok: false,
        code: "phase-note-suggestions-table-missing",
        message:
          "phase_note_task_suggestions table is missing; reopen planning SQLite with a current workspace-kit to migrate."
      };
    }

    const persistedSuggestions = convertible.map((n) =>
      projectPhaseNoteTaskSuggestion(upsertPhaseNoteTaskSuggestionFromNote(db, n))
    );
    return okData(
      {
        phaseKey,
        phaseKeySource,
        taskId: taskId ?? null,
        proposals,
        persistedSuggestions,
        persisted: true,
        count: proposals.length
      },
      "phase-note-proposals-persisted",
      "Upserted phase_note_task_suggestions rows for convertible notes"
    );
  }

  if (command.name === "convert-phase-note-to-task") {
    return await runConvertPhaseNoteToTaskCommand(ctx, planning, planning.taskStore, args);
  }

  if (command.name === "update-phase-note") {
    const noteId = readStringField(args, "noteId")?.trim() ?? "";
    if (!noteId) {
      return { ok: false, code: "invalid-phase-note-args", message: "noteId is required." };
    }
    const nowMs = Date.now();
    const patch: UpdateActivePhaseNotePatch = {};
    if (typeof args.summary === "string") {
      const s = args.summary.trim();
      if (!s) {
        return { ok: false, code: "invalid-phase-note-args", message: "summary, when provided, must be non-empty." };
      }
      if (s.length > PHASE_NOTE_SUMMARY_MAX) {
        return {
          ok: false,
          code: "invalid-phase-note-args",
          message: `summary exceeds ${PHASE_NOTE_SUMMARY_MAX} characters`
        };
      }
      patch.summary = s;
    }
    if ("details" in args) {
      if (args.details !== null && typeof args.details !== "string") {
        return { ok: false, code: "invalid-phase-note-args", message: "details must be a string or null." };
      }
      const d = args.details === null ? null : String(args.details).trim();
      if (d && d.length > PHASE_NOTE_DETAILS_MAX) {
        return {
          ok: false,
          code: "invalid-phase-note-args",
          message: `details exceeds ${PHASE_NOTE_DETAILS_MAX} characters`
        };
      }
      patch.details = d;
    }
    if ("expiresAt" in args) {
      const rawExp = args.expiresAt;
      if (rawExp !== null && typeof rawExp !== "string") {
        return { ok: false, code: "invalid-phase-note-args", message: "expiresAt must be a string or null." };
      }
      const expFin = rawExp === null ? null : String(rawExp).trim() || null;
      if (expFin) {
        const v = validatePhaseNoteExpiresAtForWrite(expFin, nowMs);
        if (!v.ok) {
          return { ok: false, code: "invalid-phase-note-args", message: v.message };
        }
      }
      patch.expiresAt = expFin;
    }
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: "Provide at least one of: summary, details, expiresAt."
      };
    }
    const existing = store.getById(noteId);
    if (!existing) {
      return { ok: false, code: "phase-note-not-found", message: `Unknown noteId '${noteId}'.` };
    }
    if (existing.status !== "active") {
      return { ok: false, code: "phase-note-not-updatable", message: "Only active phase notes can be updated." };
    }
    const updated = store.updateActivePhaseNote(noteId, patch, {
      planningGeneration: gen,
      updatedAt: new Date().toISOString()
    });
    if (!updated) {
      return {
        ok: false,
        code: "phase-note-not-found",
        message: `Unknown noteId '${noteId}' or note not active.`
      };
    }
    return okData({ note: projectPhaseNote(updated) }, "phase-note-updated", "Updated phase note");
  }

  if (command.name === "dismiss-phase-note") {
    const noteId = readStringField(args, "noteId")?.trim() ?? "";
    if (!noteId) {
      return { ok: false, code: "invalid-phase-note-args", message: "noteId is required." };
    }
    const reason = readStringField(args, "reason")?.trim() ?? "";
    if (!reason) {
      return { ok: false, code: "invalid-phase-note-args", message: "reason is required (audit discipline); not persisted in MVP schema." };
    }
    if (reason.length > 2000) {
      return { ok: false, code: "invalid-phase-note-args", message: "reason is too long." };
    }
    const existing = store.getById(noteId);
    if (!existing) {
      return { ok: false, code: "phase-note-not-found", message: `Unknown noteId '${noteId}'.` };
    }
    store.dismissNote(noteId);
    const updated = store.getById(noteId);
    if (!updated) {
      return { ok: false, code: "phase-note-not-found", message: `Note '${noteId}' missing after dismiss.` };
    }
    return okData({ note: projectPhaseNote(updated), reasonAcknowledged: true }, "phase-note-dismissed", "Phase note dismissed");
  }

  if (command.name === "supersede-phase-note") {
    const noteId = readStringField(args, "noteId")?.trim() ?? "";
    const supersededBy = readStringField(args, "supersededBy")?.trim() ?? "";
    if (!noteId || !supersededBy) {
      return { ok: false, code: "invalid-phase-note-args", message: "noteId and supersededBy are required." };
    }
    if (noteId === supersededBy) {
      return { ok: false, code: "invalid-phase-note-args", message: "noteId and supersededBy must differ." };
    }
    const from = store.getById(noteId);
    const to = store.getById(supersededBy);
    if (!from || !to) {
      return { ok: false, code: "phase-note-not-found", message: "noteId and supersededBy must both exist." };
    }
    if (from.phaseKey !== to.phaseKey) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: "supersede requires both notes in the same phase_key."
      };
    }
    if (to.status !== "active") {
      return { ok: false, code: "invalid-phase-note-args", message: "supersededBy note must be active." };
    }
    const nowMs = Date.now();
    if (filterOutPassiveExpiredActiveNotes([to], false, nowMs).length === 0) {
      return {
        ok: false,
        code: "invalid-phase-note-args",
        message: "supersededBy note must not be past expires_at while still active; extend expiry or pick another note."
      };
    }
    store.supersedeNote(noteId, supersededBy);
    const updated = store.getById(noteId);
    if (!updated) {
      return { ok: false, code: "phase-note-not-found", message: `Note '${noteId}' missing after supersede.` };
    }
    return okData({ note: projectPhaseNote(updated) }, "phase-note-superseded", "Phase note superseded");
  }

  return null;
}
