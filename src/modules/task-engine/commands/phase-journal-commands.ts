import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskEntity } from "../types.js";
import {
  PHASE_JOURNAL_MIN_KIT_USER_VERSION,
  PHASE_NOTE_DETAILS_MAX,
  PHASE_NOTE_LIST_DEFAULT_LIMIT,
  PHASE_NOTE_LIST_MAX_LIMIT,
  PHASE_NOTE_PRIORITIES,
  PHASE_NOTE_REFS_MAX,
  PHASE_NOTE_REF_TYPES,
  PHASE_NOTE_STATUSES,
  PHASE_NOTE_SUMMARY_MAX,
  PHASE_NOTE_TYPES
} from "../phase-journal/phase-journal-constants.js";
import { projectPhaseNote, type PhaseNoteProjection } from "../phase-journal/phase-journal-projections.js";
import { createPhaseJournalStore } from "../phase-journal/phase-journal-store.js";
import type { CreatePhaseNoteInput, PhaseNoteStatus } from "../phase-journal/phase-journal-types.js";
import { sortPhaseNotesForContext } from "../phase-journal/phase-journal-scoring.js";

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

function inferPhaseKeyFromTask(task: TaskEntity | undefined): string | null {
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

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
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

export function resolvePhaseJournalCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  const names = new Set([
    "add-phase-note",
    "list-phase-notes",
    "get-phase-context",
    "dismiss-phase-note",
    "supersede-phase-note"
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
      expiresAt: readStringField(args, "expiresAt")?.trim() ?? null,
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
    let phaseKey = readStringField(args, "phaseKey");
    if (!phaseKey && taskId) {
      phaseKey = inferPhaseKeyFromTask(planning.taskStore.getTask(taskId)) ?? undefined;
    }
    if (!phaseKey?.trim()) {
      return { ok: false, code: "invalid-phase-note-args", message: "Provide phaseKey or taskId for phase inference." };
    }
    phaseKey = phaseKey.trim();

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
    return okData({ phaseKey, notes: projections, count: projections.length }, "phase-notes-listed", "Listed phase notes");
  }

  if (command.name === "get-phase-context") {
    const taskId = readStringField(args, "taskId");
    let phaseKey = readStringField(args, "phaseKey");
    if (!phaseKey && taskId) {
      phaseKey = inferPhaseKeyFromTask(planning.taskStore.getTask(taskId)) ?? undefined;
    }
    if (!phaseKey?.trim()) {
      return { ok: false, code: "invalid-phase-note-args", message: "Provide phaseKey or taskId for phase inference." };
    }
    phaseKey = phaseKey.trim();

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

    const pool = store.listNotes({ phaseKey, status: "active", limit: 200 });
    const sorted = sortPhaseNotesForContext(pool, { phaseKey, taskId, refKeys });
    const picked = sorted.slice(0, limit).map(projectPhaseNote);
    return okData({ phaseKey, taskId: taskId ?? null, notes: picked, count: picked.length }, "phase-context", "Resolved phase context");
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
    store.supersedeNote(noteId, supersededBy);
    const updated = store.getById(noteId);
    if (!updated) {
      return { ok: false, code: "phase-note-not-found", message: `Note '${noteId}' missing after supersede.` };
    }
    return okData({ note: projectPhaseNote(updated) }, "phase-note-superseded", "Phase note superseded");
  }

  return null;
}
