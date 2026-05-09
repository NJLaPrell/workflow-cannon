import { hydrateTaskRowForCae } from "../../core/cae/cae-run-preflight.js";
import type { TaskEngineTaskRowSlice } from "../../core/cae/evaluation-context-builder.js";
import { readIntakeModuleIdFromArgs } from "../task-engine/task-intake-mutation-policy.js";
import {
  compactTaskIntakeReadout,
  resolveTaskIntakeForAcceptTriage,
  taskIntakeReadoutHasSignal
} from "../task-engine/task-intake-readout-hints.js";
import { resolveTaskIntakePolicy } from "../task-engine/task-intake-policy-resolver.js";
import type { TaskEntity, TaskStatus } from "../task-engine/types.js";
import type { GuidanceCardsByFamily } from "./maintainer-delivery-guidance.js";

type CaeFamily = "policy" | "think" | "do" | "review";

const THINK_FAMILY_LABEL = "Things to consider";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sliceToTaskEntity(slice: TaskEngineTaskRowSlice): TaskEntity {
  return {
    id: slice.id,
    status: slice.status as TaskEntity["status"],
    type: typeof slice.type === "string" && slice.type.length > 0 ? slice.type : "execution",
    title: typeof slice.title === "string" && slice.title.length > 0 ? slice.title : "",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    phaseKey: slice.phaseKey ?? undefined,
    metadata: slice.metadata ?? undefined
  };
}

function buildIntakeGuidanceTitles(r: ReturnType<typeof resolveTaskIntakePolicy>): string[] {
  const pol = r.resolvedPolicy;
  const lines: string[] = [
    `Task intake profile: ${pol.profileName} (enforcement: ${pol.enforcementMode}) for ${pol.action} → ${pol.context.targetStatus ?? "?"}.`
  ];
  if (r.missingRequiredFields.length > 0) {
    lines.push(`Missing required fields: ${r.missingRequiredFields.slice(0, 10).join(", ")}`);
  }
  if (r.missingRecommendedFields.length > 0) {
    lines.push(`Missing recommended fields: ${r.missingRecommendedFields.slice(0, 10).join(", ")}`);
  }
  if (r.forbiddenPresentFields.length > 0) {
    lines.push(`Forbidden fields present: ${r.forbiddenPresentFields.slice(0, 8).join(", ")}`);
  }
  if (r.fieldRuleViolations.length > 0) {
    lines.push(
      `Field rule issues: ${r.fieldRuleViolations
        .slice(0, 4)
        .map((v) => `${v.field}(${v.rule})`)
        .join("; ")}`
    );
  }
  if (r.warnings.length > 0) {
    lines.push(`Resolver warnings: ${r.warnings.map((w) => w.code).join(", ")}`);
  }
  lines.push("Resolve details: workspace-kit run resolve-task-intake-policy (read-only).");
  return lines;
}

function resolveIntakeForCaePreview(
  workspacePath: string,
  effective: Record<string, unknown>,
  taskId: string | undefined,
  commandName: string,
  args: Record<string, unknown>
): ReturnType<typeof resolveTaskIntakePolicy> | null {
  if (commandName === "create-task") {
    const statusRaw = typeof args.status === "string" ? args.status : "proposed";
    const typ = typeof args.type === "string" ? args.type : "execution";
    return resolveTaskIntakePolicy({
      effectiveConfig: effective,
      task: null,
      action: "create-task",
      targetStatus: statusRaw as TaskStatus,
      type: typ,
      moduleId: readIntakeModuleIdFromArgs(args),
      metadata: isRecord(args.metadata) ? args.metadata : null,
      fields: args
    });
  }
  if (commandName === "run-transition" && String(args.action) === "accept") {
    if (!taskId) {
      return null;
    }
    const slice = hydrateTaskRowForCae(workspacePath, effective, taskId);
    if (!slice) {
      return null;
    }
    return resolveTaskIntakeForAcceptTriage(sliceToTaskEntity(slice), effective);
  }
  if (!taskId) {
    return null;
  }
  const slice = hydrateTaskRowForCae(workspacePath, effective, taskId);
  if (!slice) {
    return null;
  }
  return resolveTaskIntakeForAcceptTriage(sliceToTaskEntity(slice), effective);
}

/**
 * When intake signals gaps or warnings, prepend a compact think-family card (no network).
 */
export async function prependTaskIntakePolicyGuidanceCard(
  workspacePath: string,
  effective: Record<string, unknown>,
  taskId: string | undefined,
  commandName: string,
  commandArgs: Record<string, unknown> | undefined,
  cards: GuidanceCardsByFamily
): Promise<void> {
  const args = commandArgs ?? {};
  const resolution = resolveIntakeForCaePreview(workspacePath, effective, taskId, commandName, args);
  if (!resolution || !taskIntakeReadoutHasSignal(resolution)) {
    return;
  }
  const sourceTitles = buildIntakeGuidanceTitles(resolution);
  const card: Record<string, unknown> = {
    activationId: "cae.advisory.task-intake-policy.v1",
    family: "think" satisfies CaeFamily,
    familyLabel: THINK_FAMILY_LABEL,
    title: sourceTitles[1] ?? sourceTitles[0] ?? "Task intake policy",
    attention: "advisory",
    artifactIds: [],
    sourceTitles,
    priority: 850,
    aggregateTightness: 0,
    detail: {
      taskId: taskId ?? null,
      commandName,
      synthetic: true,
      intake: compactTaskIntakeReadout(resolution)
    }
  };
  cards.think = [card, ...cards.think];
}
