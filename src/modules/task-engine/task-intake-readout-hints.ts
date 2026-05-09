import { readIntakeModuleIdFromTask } from "./task-intake-mutation-policy.js";
import { resolveTaskIntakePolicy } from "./task-intake-policy-resolver.js";
import type { TaskEntity } from "./types.js";

const MAX_PATHS = 12;
const MAX_VIOLATIONS = 5;

/** Compact intake snapshot for agent readouts (no full explain chain). */
export type TaskIntakeReadoutCompactV1 = {
  schemaVersion: 1;
  profileName: string;
  enforcementMode: string;
  actionContext: string;
  missingRequiredFields: string[];
  missingRecommendedFields: string[];
  forbiddenPresentFields: string[];
  fieldRuleViolations: Array<{ field: string; rule: string }>;
  warningCodes?: string[];
};

export function compactTaskIntakeReadout(
  r: ReturnType<typeof resolveTaskIntakePolicy>
): TaskIntakeReadoutCompactV1 {
  const pol = r.resolvedPolicy;
  const actionContext = `${pol.action}/${pol.context.targetStatus ?? "?"}`;
  const out: TaskIntakeReadoutCompactV1 = {
    schemaVersion: 1,
    profileName: pol.profileName,
    enforcementMode: pol.enforcementMode,
    actionContext,
    missingRequiredFields: r.missingRequiredFields.slice(0, MAX_PATHS),
    missingRecommendedFields: r.missingRecommendedFields.slice(0, MAX_PATHS),
    forbiddenPresentFields: r.forbiddenPresentFields.slice(0, MAX_PATHS),
    fieldRuleViolations: r.fieldRuleViolations.slice(0, MAX_VIOLATIONS).map((v) => ({ field: v.field, rule: v.rule }))
  };
  if (r.warnings.length > 0) {
    out.warningCodes = r.warnings.map((w) => w.code);
  }
  return out;
}

/** Intake as evaluated for proposed→ready acceptance (triage on existing rows). */
export function resolveTaskIntakeForAcceptTriage(
  task: TaskEntity,
  effectiveConfig: Record<string, unknown> | undefined
): ReturnType<typeof resolveTaskIntakePolicy> {
  return resolveTaskIntakePolicy({
    effectiveConfig,
    task,
    action: "accept",
    targetStatus: "ready",
    moduleId: readIntakeModuleIdFromTask(task)
  });
}

export function taskIntakeReadoutHasSignal(r: ReturnType<typeof resolveTaskIntakePolicy>): boolean {
  return (
    r.warnings.length > 0 ||
    r.missingRequiredFields.length > 0 ||
    r.missingRecommendedFields.length > 0 ||
    r.forbiddenPresentFields.length > 0 ||
    r.fieldRuleViolations.length > 0
  );
}

export function buildTaskIntakeReadoutBundle(input: {
  effectiveConfig: Record<string, unknown> | undefined;
  suggestedNext: TaskEntity | null;
  /** Optional: small set of proposed tasks for triage headlines (caller caps length). */
  proposedHeadlineTasks?: TaskEntity[];
}): {
  taskIntakeSuggestedNext?: TaskIntakeReadoutCompactV1 | null;
  taskIntakeProposedHeadlines?: Array<{ id: string; title: string; intake: TaskIntakeReadoutCompactV1 }>;
} {
  if (input.effectiveConfig === undefined) {
    return {};
  }
  const out: {
    taskIntakeSuggestedNext?: TaskIntakeReadoutCompactV1 | null;
    taskIntakeProposedHeadlines?: Array<{ id: string; title: string; intake: TaskIntakeReadoutCompactV1 }>;
  } = {};
  if (input.suggestedNext) {
    const r = resolveTaskIntakeForAcceptTriage(input.suggestedNext, input.effectiveConfig);
    out.taskIntakeSuggestedNext = compactTaskIntakeReadout(r);
  } else {
    out.taskIntakeSuggestedNext = null;
  }
  if (input.proposedHeadlineTasks?.length) {
    out.taskIntakeProposedHeadlines = input.proposedHeadlineTasks.map((t) => {
      const r = resolveTaskIntakeForAcceptTriage(t, input.effectiveConfig);
      return { id: t.id, title: t.title, intake: compactTaskIntakeReadout(r) };
    });
  }
  return out;
}
