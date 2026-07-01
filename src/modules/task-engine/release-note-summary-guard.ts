import {
  classifyReleaseNoteTask,
  loadFeatureTaxonomyForReleaseNotes,
  loadReleaseNotesStyle,
  type ClassifiedReleaseNoteTask
} from "../documentation/release-notes.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import { isPhaseDeliveryTask } from "./delivery-evidence.js";
import type { GuardResult, TaskEntity, TaskStatus, TransitionContext, TransitionGuard } from "./types.js";

export const RELEASE_NOTE_SUMMARY_METADATA_KEY = "releaseNoteSummary";
export const USER_FACING_SUMMARY_METADATA_KEY = "userFacingSummary";
export const RELEASE_NOTE_WAIVER_METADATA_KEY = "releaseNoteWaiver";

export type ReleaseNoteSummaryEnforcementMode = "off" | "advisory" | "enforce";

export type ReleaseNoteSummaryViolation = {
  taskId: string;
  title: string;
  status: TaskStatus;
  phaseKey: string | null;
  code: string;
  message: string;
  missingFields: string[];
};

export type ReleaseNoteSummaryEvaluation = {
  required: boolean;
  satisfied: boolean;
  satisfiedBy: "summary" | "waiver" | "not-required" | null;
  violations: ReleaseNoteSummaryViolation[];
};

type ReleaseNoteSummaryGuardOptions = {
  enforcementMode?: ReleaseNoteSummaryEnforcementMode;
  workspacePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readExplicitSummary(task: TaskEntity): string | null {
  const metadata = task.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const releaseNoteSummary = metadata[RELEASE_NOTE_SUMMARY_METADATA_KEY];
  if (nonEmptyString(releaseNoteSummary)) {
    return releaseNoteSummary.trim();
  }
  const userFacingSummary = metadata[USER_FACING_SUMMARY_METADATA_KEY];
  if (nonEmptyString(userFacingSummary)) {
    return userFacingSummary.trim();
  }
  return null;
}

function missingReleaseNoteWaiverFields(value: unknown): string[] {
  if (!isRecord(value)) {
    return [RELEASE_NOTE_WAIVER_METADATA_KEY];
  }
  const missing: string[] = [];
  if (value.schemaVersion !== 1) missing.push("releaseNoteWaiver.schemaVersion");
  if (!nonEmptyString(value.actor)) missing.push("releaseNoteWaiver.actor");
  if (!nonEmptyString(value.rationale)) missing.push("releaseNoteWaiver.rationale");
  if (!nonEmptyString(value.timestamp)) missing.push("releaseNoteWaiver.timestamp");
  if (!nonEmptyString(value.scope)) missing.push("releaseNoteWaiver.scope");
  return missing;
}

function isReleaseNoteSummaryOptedOut(task: TaskEntity): boolean {
  const metadata = task.metadata;
  return Boolean(isRecord(metadata) && metadata.releaseNoteRequired === false);
}

/** Pragmatic scope: task would appear in public release notes per documentation-module rules. */
export function isPragmaticReleaseNoteAudience(classified: ClassifiedReleaseNoteTask): boolean {
  if (classified.changeKind === "chore") {
    return false;
  }
  return classified.includeInPublicSections;
}

export function validateReleaseNoteSummaryText(value: unknown): { ok: true; summary: string } | { ok: false; missingFields: string[] } {
  if (!nonEmptyString(value)) {
    return { ok: false, missingFields: [RELEASE_NOTE_SUMMARY_METADATA_KEY] };
  }
  const style = loadReleaseNotesStyle();
  const trimmed = value.trim();
  if (trimmed.length < style.minPublicDescriptionLength) {
    return { ok: false, missingFields: [`${RELEASE_NOTE_SUMMARY_METADATA_KEY}.length`] };
  }
  return { ok: true, summary: trimmed };
}

export function evaluateReleaseNoteSummary(
  task: TaskEntity,
  workspacePath: string
): ReleaseNoteSummaryEvaluation {
  if (!isPhaseDeliveryTask(task) || isReleaseNoteSummaryOptedOut(task)) {
    return {
      required: false,
      satisfied: true,
      satisfiedBy: "not-required",
      violations: []
    };
  }

  const taxonomy = loadFeatureTaxonomyForReleaseNotes(workspacePath);
  const classified = classifyReleaseNoteTask(task, taxonomy);
  if (!isPragmaticReleaseNoteAudience(classified)) {
    return {
      required: false,
      satisfied: true,
      satisfiedBy: "not-required",
      violations: []
    };
  }

  const explicitSummary = readExplicitSummary(task);
  if (explicitSummary) {
    const validated = validateReleaseNoteSummaryText(explicitSummary);
    if (validated.ok) {
      return {
        required: true,
        satisfied: true,
        satisfiedBy: "summary",
        violations: []
      };
    }
    return {
      required: true,
      satisfied: false,
      satisfiedBy: null,
      violations: [
        {
          taskId: task.id,
          title: task.title,
          status: task.status,
          phaseKey: inferTaskPhaseKey(task),
          code: "release-note-summary-too-short",
          message: "metadata.releaseNoteSummary (or userFacingSummary) must be a non-empty adopters-facing sentence.",
          missingFields: validated.missingFields
        }
      ]
    };
  }

  const metadata = task.metadata ?? {};
  const waiverMissing = missingReleaseNoteWaiverFields(metadata[RELEASE_NOTE_WAIVER_METADATA_KEY]);
  if (waiverMissing.length === 0) {
    return {
      required: true,
      satisfied: true,
      satisfiedBy: "waiver",
      violations: []
    };
  }

  return {
    required: true,
    satisfied: false,
    satisfiedBy: null,
    violations: [
      {
        taskId: task.id,
        title: task.title,
        status: task.status,
        phaseKey: inferTaskPhaseKey(task),
        code: "release-note-summary-missing",
        message:
          "User-visible phased tasks require metadata.releaseNoteSummary (or metadata.userFacingSummary) before complete.",
        missingFields: [RELEASE_NOTE_SUMMARY_METADATA_KEY, ...waiverMissing]
      }
    ]
  };
}

export function readReleaseNoteSummaryEnforcementMode(
  effectiveConfig: Record<string, unknown> | undefined
): ReleaseNoteSummaryEnforcementMode {
  const tasks = effectiveConfig?.tasks;
  const tasksObj = isRecord(tasks) ? tasks : undefined;
  const releaseNotes = tasksObj?.releaseNotes;
  const releaseNotesObj = isRecord(releaseNotes) ? releaseNotes : undefined;
  const raw = releaseNotesObj?.enforcementMode;
  if (raw === "off" || raw === "advisory" || raw === "enforce") {
    return raw;
  }
  return "advisory";
}

export function buildPhaseReleaseNotePreflight(args: {
  tasks: TaskEntity[];
  workspacePath: string;
  phaseKey?: string | null;
  includeInProgress?: boolean;
}): {
  schemaVersion: 1;
  phaseKey: string | null;
  checkedTaskCount: number;
  violationCount: number;
  violations: ReleaseNoteSummaryViolation[];
} {
  const includeInProgress = args.includeInProgress ?? true;
  const targetPhase = args.phaseKey?.trim() || null;
  const statuses: TaskStatus[] = includeInProgress ? ["completed", "in_progress"] : ["completed"];

  const checked = args.tasks.filter((task) => {
    if (!statuses.includes(task.status)) return false;
    if (!isPhaseDeliveryTask(task)) return false;
    if (targetPhase === null) return true;
    return inferTaskPhaseKey(task) === targetPhase;
  });

  const violations = checked.flatMap((task) => evaluateReleaseNoteSummary(task, args.workspacePath).violations);

  return {
    schemaVersion: 1,
    phaseKey: targetPhase,
    checkedTaskCount: checked.length,
    violationCount: violations.length,
    violations
  };
}

export function createReleaseNoteSummaryGuard(options: ReleaseNoteSummaryGuardOptions): TransitionGuard {
  const enforcementMode = options.enforcementMode ?? "advisory";
  return {
    name: "release-note-summary",
    canTransition(task: TaskEntity, targetState: TaskStatus, _context: TransitionContext): GuardResult {
      if (targetState !== "completed" || enforcementMode === "off") {
        return { allowed: true, guardName: "release-note-summary" };
      }

      const evaluation = evaluateReleaseNoteSummary(task, options.workspacePath);
      if (!evaluation.required || evaluation.satisfied) {
        const code =
          evaluation.satisfiedBy === "waiver"
            ? "release-note-waiver-present"
            : evaluation.satisfiedBy === "summary"
              ? "release-note-summary-present"
              : "release-note-summary-not-required";
        return { allowed: true, guardName: "release-note-summary", code };
      }

      const violation = evaluation.violations[0];
      const blocking = enforcementMode === "enforce";
      return {
        allowed: !blocking,
        guardName: "release-note-summary",
        code: blocking
          ? (violation?.code ?? "release-note-summary-missing")
          : "release-note-summary-advisory",
        message:
          violation?.message ??
          "User-visible release note summary is missing for complete."
      };
    }
  };
}
