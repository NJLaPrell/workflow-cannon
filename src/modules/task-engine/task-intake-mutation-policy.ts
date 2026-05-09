import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { TaskIntakeEnforcementMode } from "./policy-config.js";
import { resolveTaskIntakePolicy } from "./task-intake-policy-resolver.js";
import type { GuardResult, TaskEntity, TaskStatus, TransitionGuard } from "./types.js";

export type TaskIntakeMutationKind = "create-proposed" | "create-ready" | "create-research" | "accept-to-ready";

const SYSTEM_TASK_FIELDS_ON_CREATE = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "archived",
  "archivedAt"
]);

export function readIntakeModuleIdFromArgs(args: Record<string, unknown>): string | null {
  const top = typeof args.moduleId === "string" && args.moduleId.trim() ? args.moduleId.trim() : null;
  if (top) {
    return top;
  }
  const meta = args.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = (meta as Record<string, unknown>).moduleId;
    if (typeof m === "string" && m.trim()) {
      return m.trim();
    }
  }
  return null;
}

export function readIntakeModuleIdFromTask(task: TaskEntity): string | null {
  const meta = task.metadata?.moduleId;
  if (typeof meta === "string" && meta.trim()) {
    return meta.trim();
  }
  if (typeof task.ownership === "string" && task.ownership.trim()) {
    return task.ownership.trim();
  }
  return null;
}

export function classifyCreateIntakeKind(status: TaskStatus): TaskIntakeMutationKind {
  if (status === "ready") {
    return "create-ready";
  }
  if (status === "research") {
    return "create-research";
  }
  return "create-proposed";
}

export function filterCreateMissingRequired(paths: string[]): string[] {
  return paths.filter((p) => !SYSTEM_TASK_FIELDS_ON_CREATE.has(p));
}

export function shouldBlockTaskIntake(
  enforcement: TaskIntakeEnforcementMode,
  kind: TaskIntakeMutationKind,
  hasHardViolations: boolean
): boolean {
  if (!hasHardViolations) {
    return false;
  }
  if (enforcement === "off" || enforcement === "advisory") {
    return false;
  }
  if (enforcement === "enforce-on-accept") {
    return kind === "accept-to-ready";
  }
  return kind === "accept-to-ready" || kind === "create-ready";
}

export function buildTaskIntakeResponseSlice(
  resolution: ReturnType<typeof resolveTaskIntakePolicy>,
  effectiveMissingRequired?: string[]
): Record<string, unknown> {
  return {
    policyProfile: resolution.resolvedPolicy.profileName,
    enforcementMode: resolution.resolvedPolicy.enforcementMode,
    missingRequiredFields: resolution.missingRequiredFields,
    effectiveMissingRequiredFields: effectiveMissingRequired ?? resolution.missingRequiredFields,
    missingRecommendedFields: resolution.missingRecommendedFields,
    forbiddenPresentFields: resolution.forbiddenPresentFields,
    fieldRuleViolations: resolution.fieldRuleViolations
  };
}

function intakeHardForCreate(
  resolution: ReturnType<typeof resolveTaskIntakePolicy>,
  effectiveMissingRequired: string[]
): boolean {
  return (
    effectiveMissingRequired.length > 0 ||
    resolution.forbiddenPresentFields.length > 0 ||
    resolution.fieldRuleViolations.length > 0
  );
}

function intakeHardForAccept(resolution: ReturnType<typeof resolveTaskIntakePolicy>): boolean {
  return (
    resolution.missingRequiredFields.length > 0 ||
    resolution.forbiddenPresentFields.length > 0 ||
    resolution.fieldRuleViolations.length > 0
  );
}

function resolverWarningStrings(resolution: ReturnType<typeof resolveTaskIntakePolicy>): string[] {
  return resolution.warnings.map((w) => `task-intake:${w.code}: ${w.message}`);
}

function advisoryDetailStrings(
  resolution: ReturnType<typeof resolveTaskIntakePolicy>,
  effectiveMissingRequired: string[]
): string[] {
  const lines: string[] = [];
  if (effectiveMissingRequired.length > 0) {
    lines.push(`task-intake:missing-required:${effectiveMissingRequired.join(",")}`);
  }
  if (resolution.missingRecommendedFields.length > 0) {
    lines.push(`task-intake:missing-recommended:${resolution.missingRecommendedFields.join(",")}`);
  }
  if (resolution.forbiddenPresentFields.length > 0) {
    lines.push(`task-intake:forbidden-present:${resolution.forbiddenPresentFields.join(",")}`);
  }
  if (resolution.fieldRuleViolations.length > 0) {
    lines.push(`task-intake:field-rule-violations:${resolution.fieldRuleViolations.length}`);
  }
  return lines;
}

function createBlockedMessage(
  resolution: ReturnType<typeof resolveTaskIntakePolicy>,
  effectiveMissingRequired: string[]
): string {
  const parts: string[] = ["Task intake policy rejected this create."];
  if (effectiveMissingRequired.length > 0) {
    parts.push(`Missing required: ${effectiveMissingRequired.join(", ")}`);
  }
  if (resolution.forbiddenPresentFields.length > 0) {
    parts.push(`Forbidden fields present: ${resolution.forbiddenPresentFields.join(", ")}`);
  }
  if (resolution.fieldRuleViolations.length > 0) {
    parts.push(`${resolution.fieldRuleViolations.length} field rule violation(s).`);
  }
  return parts.join(" ");
}

function acceptBlockedMessage(resolution: ReturnType<typeof resolveTaskIntakePolicy>): string {
  const parts: string[] = ["Task intake policy rejected proposed → ready acceptance."];
  if (resolution.missingRequiredFields.length > 0) {
    parts.push(`Missing required: ${resolution.missingRequiredFields.join(", ")}`);
  }
  if (resolution.forbiddenPresentFields.length > 0) {
    parts.push(`Forbidden fields present: ${resolution.forbiddenPresentFields.join(", ")}`);
  }
  if (resolution.fieldRuleViolations.length > 0) {
    parts.push(`${resolution.fieldRuleViolations.length} field rule violation(s).`);
  }
  return parts.join(" ");
}

export function evaluateIntakeForCreate(input: {
  effectiveConfig: Record<string, unknown> | undefined;
  task: TaskEntity;
  moduleId?: string | null;
}): {
  intakePayload: Record<string, unknown>;
  stringWarnings: string[];
  block: ModuleCommandResult | null;
} {
  const status = input.task.status;
  const action = status === "ready" ? "create-ready" : "create-task";
  const resolution = resolveTaskIntakePolicy({
    effectiveConfig: input.effectiveConfig,
    task: input.task,
    action,
    targetStatus: status,
    moduleId: input.moduleId ?? null,
    category: typeof input.task.metadata?.category === "string" ? input.task.metadata.category : null,
    phaseKey: input.task.phaseKey ?? null
  });
  const kind = classifyCreateIntakeKind(status);
  const effectiveMissingRequired = filterCreateMissingRequired(resolution.missingRequiredFields);
  const hasHard = intakeHardForCreate(resolution, effectiveMissingRequired);
  const enforcement = resolution.resolvedPolicy.enforcementMode;
  const intakePayload = buildTaskIntakeResponseSlice(resolution, effectiveMissingRequired);
  const block = shouldBlockTaskIntake(enforcement, kind, hasHard)
    ? ({
        ok: false,
        code: "task-intake-blocked",
        message: createBlockedMessage(resolution, effectiveMissingRequired),
        data: { taskIntake: intakePayload }
      } as ModuleCommandResult)
    : null;
  const stringWarnings = [
    ...resolverWarningStrings(resolution),
    ...(enforcement === "advisory" ? advisoryDetailStrings(resolution, effectiveMissingRequired) : [])
  ];
  return { intakePayload, stringWarnings, block };
}

export function evaluateIntakeForAccept(input: {
  effectiveConfig: Record<string, unknown> | undefined;
  task: TaskEntity;
}): {
  intakePayload: Record<string, unknown>;
  hasHard: boolean;
  block: boolean;
  advisoryStrings: string[];
} {
  const resolution = resolveTaskIntakePolicy({
    effectiveConfig: input.effectiveConfig,
    task: input.task,
    action: "accept",
    targetStatus: "ready",
    moduleId: readIntakeModuleIdFromTask(input.task),
    category: typeof input.task.metadata?.category === "string" ? input.task.metadata.category : null,
    phaseKey: input.task.phaseKey ?? null
  });
  const hasHard = intakeHardForAccept(resolution);
  const enforcement = resolution.resolvedPolicy.enforcementMode;
  const block = shouldBlockTaskIntake(enforcement, "accept-to-ready", hasHard);
  const intakePayload = buildTaskIntakeResponseSlice(resolution);
  const advisoryStrings = [
    ...resolverWarningStrings(resolution),
    ...(enforcement === "advisory" && hasHard ? advisoryDetailStrings(resolution, resolution.missingRequiredFields) : [])
  ];
  return { intakePayload, hasHard, block, advisoryStrings };
}

export function createTaskIntakeAcceptGuard(options: {
  effectiveConfig: Record<string, unknown> | undefined;
}): TransitionGuard {
  return {
    name: "task-intake",
    canTransition(task: TaskEntity, targetState: TaskStatus): GuardResult {
      if (task.status !== "proposed" || targetState !== "ready") {
        return { allowed: true, guardName: "task-intake" };
      }
      const resolution = resolveTaskIntakePolicy({
        effectiveConfig: options.effectiveConfig,
        task,
        action: "accept",
        targetStatus: "ready",
        moduleId: readIntakeModuleIdFromTask(task),
        category: typeof task.metadata?.category === "string" ? task.metadata.category : null,
        phaseKey: task.phaseKey ?? null
      });
      const hasHard = intakeHardForAccept(resolution);
      const enforcement = resolution.resolvedPolicy.enforcementMode;
      const block = shouldBlockTaskIntake(enforcement, "accept-to-ready", hasHard);
      if (block) {
        return {
          allowed: false,
          guardName: "task-intake",
          code: "task-intake-blocked",
          message: acceptBlockedMessage(resolution)
        };
      }
      const advisoryStrings = [
        ...resolverWarningStrings(resolution),
        ...(enforcement === "advisory" && hasHard
          ? advisoryDetailStrings(resolution, resolution.missingRequiredFields)
          : [])
      ];
      const msg = advisoryStrings.length > 0 ? advisoryStrings.join(" | ") : undefined;
      return {
        allowed: true,
        guardName: "task-intake",
        code: hasHard ? "task-intake-advisory" : "task-intake-ok",
        message: msg
      };
    }
  };
}
