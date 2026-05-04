import type { ModuleCommandResult } from "../../../contracts/module-contract.js";
import type { TaskEntity } from "../types.js";
import {
  PHASE_JOURNAL_MIN_KIT_USER_VERSION,
  PHASE_NOTE_DETAILS_MAX,
  PHASE_NOTE_PRIORITIES,
  PHASE_NOTE_REFS_MAX,
  PHASE_NOTE_REF_TYPES,
  PHASE_NOTE_SUMMARY_MAX,
  PHASE_NOTE_TYPES,
  PHASE_NOTES_RUN_TRANSITION_MAX
} from "./phase-journal-constants.js";
import { inferPhaseKeyFromTask } from "./phase-journal-phase-key.js";
import type { CreatePhaseNoteInput } from "./phase-journal-types.js";

function fail(code: string, message: string): { ok: false; result: ModuleCommandResult } {
  return { ok: false, result: { ok: false, code, message } };
}

function phaseJournalVersionError(current: number): { ok: false; result: ModuleCommandResult } {
  return {
    ok: false,
    result: {
      ok: false,
      code: "phase-journal-kit-version",
      message: `Phase journal commands require kit SQLite user_version >= ${PHASE_JOURNAL_MIN_KIT_USER_VERSION} (current ${current}); open the workspace DB once with a current workspace-kit to migrate.`
    }
  };
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

/**
 * Parse and validate optional `phaseNotes` on `run-transition` before any lifecycle mutation.
 * Notes inherit `phaseKey` from the transition task; `taskId` per note defaults to that task.
 */
export function resolveRunTransitionPhaseNotes(
  args: Record<string, unknown>,
  transitionTask: TaskEntity | undefined,
  kitUserVersion: number,
  getTask: (id: string) => TaskEntity | undefined
): { ok: true; inputs: CreatePhaseNoteInput[] } | { ok: false; result: ModuleCommandResult } {
  const raw = args.phaseNotes;
  if (raw === undefined || raw === null) {
    return { ok: true, inputs: [] };
  }
  if (!Array.isArray(raw)) {
    return fail("invalid-run-transition-phase-notes", "phaseNotes must be an array when provided.");
  }
  if (raw.length === 0) {
    return { ok: true, inputs: [] };
  }
  if (kitUserVersion < PHASE_JOURNAL_MIN_KIT_USER_VERSION) {
    return phaseJournalVersionError(kitUserVersion);
  }
  if (!transitionTask) {
    return fail("phase-notes-task-required", "phaseNotes require a valid transition task.");
  }
  const phaseKey = inferPhaseKeyFromTask(transitionTask);
  if (!phaseKey) {
    return fail(
      "phase-notes-phase-unknown",
      "phaseNotes require the transition task to have phaseKey or a parseable phase label."
    );
  }
  if (raw.length > PHASE_NOTES_RUN_TRANSITION_MAX) {
    return fail(
      "invalid-run-transition-phase-notes",
      `phaseNotes may include at most ${PHASE_NOTES_RUN_TRANSITION_MAX} entries.`
    );
  }

  const seenIdempotency = new Set<string>();
  const inputs: CreatePhaseNoteInput[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return fail("invalid-run-transition-phase-notes", "Each phaseNotes entry must be an object.");
    }
    const o = entry as Record<string, unknown>;

    const noteType = readStringField(o, "noteType")?.trim() ?? "";
    if (!PHASE_NOTE_TYPES.has(noteType)) {
      return fail("invalid-phase-note-type", `noteType must be one of: ${[...PHASE_NOTE_TYPES].join(", ")}`);
    }

    const summary = readStringField(o, "summary") ?? "";
    if (!summary.trim()) {
      return fail("invalid-phase-note-args", "Each phase note requires a non-empty summary.");
    }
    if (summary.length > PHASE_NOTE_SUMMARY_MAX) {
      return fail("invalid-phase-note-args", `summary exceeds ${PHASE_NOTE_SUMMARY_MAX} characters`);
    }

    const detailsRaw = readStringField(o, "details");
    if (detailsRaw && detailsRaw.length > PHASE_NOTE_DETAILS_MAX) {
      return fail("invalid-phase-note-args", `details exceeds ${PHASE_NOTE_DETAILS_MAX} characters`);
    }

    const refsRaw = o.refs;
    const refsIn: { refType: string; refValue: string }[] = [];
    if (refsRaw !== undefined) {
      if (!Array.isArray(refsRaw)) {
        return fail("invalid-phase-note-args", "refs must be an array when provided.");
      }
      if (refsRaw.length > PHASE_NOTE_REFS_MAX) {
        return fail("invalid-phase-note-args", `refs may include at most ${PHASE_NOTE_REFS_MAX} entries`);
      }
      for (const r of refsRaw) {
        const parsed = parseRefInput(r);
        if (!parsed) {
          return fail("invalid-phase-note-args", "Each ref needs non-empty type and value strings.");
        }
        if (!PHASE_NOTE_REF_TYPES.has(parsed.type)) {
          return fail(
            "invalid-phase-note-ref-type",
            `ref type '${parsed.type}' is not allowed for MVP phase notes.`
          );
        }
        refsIn.push({ refType: parsed.type, refValue: parsed.value });
      }
    }

    const priorityRaw = readStringField(o, "priority")?.trim() ?? "normal";
    if (!PHASE_NOTE_PRIORITIES.has(priorityRaw)) {
      return fail(
        "invalid-phase-note-priority",
        `priority must be one of: ${[...PHASE_NOTE_PRIORITIES].join(", ")}`
      );
    }

    const idempotencyKeyRaw = readStringField(o, "idempotencyKey")?.trim();
    if (idempotencyKeyRaw) {
      if (seenIdempotency.has(idempotencyKeyRaw)) {
        return fail(
          "invalid-run-transition-phase-notes",
          "Duplicate idempotencyKey values are not allowed within a single phaseNotes batch."
        );
      }
      seenIdempotency.add(idempotencyKeyRaw);
    }

    const explicitTaskId = readStringField(o, "taskId")?.trim();
    let taskId: string | null = transitionTask.id;
    if (explicitTaskId) {
      const other = getTask(explicitTaskId);
      if (!other) {
        return fail("phase-note-task-not-found", `Unknown taskId '${explicitTaskId}' on phase note.`);
      }
      const inferred = inferPhaseKeyFromTask(other);
      if (!inferred || inferred !== phaseKey) {
        return fail(
          "phase-note-phase-task-mismatch",
          `phase note taskId '${explicitTaskId}' is not in phase ${phaseKey}.`
        );
      }
      taskId = explicitTaskId;
    }

    inputs.push({
      phaseKey,
      phaseLabel: readStringField(o, "phaseLabel")?.trim() ?? null,
      taskId,
      author: readStringField(o, "author")?.trim() ?? null,
      authorKind: readStringField(o, "authorKind")?.trim() ?? null,
      sessionId: readStringField(o, "sessionId")?.trim() ?? null,
      sourceCommand: "run-transition",
      planningGeneration: null,
      policyTraceId: readStringField(o, "policyTraceId")?.trim() ?? null,
      noteType,
      summary: summary.trim(),
      details: detailsRaw?.trim() ? detailsRaw : null,
      priority: priorityRaw as CreatePhaseNoteInput["priority"],
      expiresAt: readStringField(o, "expiresAt")?.trim() ?? null,
      idempotencyKey: idempotencyKeyRaw ?? null,
      refs: refsIn
    });
  }

  return { ok: true, inputs };
}
