import type {
  ModuleCommandResult,
  ModuleLifecycleContext,
  WorkflowModule
} from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import type { TaskEntity, TaskMutationType, TaskPriority, TaskStatus } from "./types.js";
import { createKitLifecycleHookBus } from "../../core/kit-lifecycle-hooks.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../core/transcript-completion-hook.js";
import { TaskStore } from "./persistence/store.js";
import { TransitionService } from "./service.js";
import { TaskEngineError, getAllowedTransitionsFrom } from "./transitions.js";
import {
  filterTasksByQueueNamespace,
  getNextActions,
  isImprovementLikeTask
} from "./suggestions.js";
import { buildQueueGitAlignmentReport, probeGitHead } from "./queue/queue-git-alignment.js";
import {
  buildPhaseDeliveryPreflight,
  createDeliveryEvidenceGuard,
  readDeliveryEvidenceEnforcementMode
} from "./delivery-evidence.js";
import { buildReleaseEvidenceManifest } from "./release-evidence-manifest.js";
import {
  loadTasksFromSnapshotFile,
  parseTasksFromSnapshotPayload,
  replayQueueFromTasks
} from "./queue/replay-queue-snapshot.js";
import { runClassifyKitState } from "./kit-state-classifier.js";
import { inferTaskPhaseKey, resolveCanonicalPhase } from "./phase-resolution.js";
import { buildQueueHealthReport, buildQueueHintsForTasks } from "./queue/queue-health.js";
import { openPlanningStores, type OpenedPlanningStores } from "./persistence/planning-open.js";
import { readWorkspaceStatusSnapshotFromDual } from "./persistence/workspace-status-store.js";
import { runBackupPlanningSqlite } from "./persistence/backup-planning-sqlite-runtime.js";
import { runMigrateTaskPersistence } from "./persistence/migrate-task-persistence-runtime.js";
import { runGetKitPersistenceMap } from "./persistence/kit-persistence-map-runtime.js";
import { runTaskPersistenceReadiness } from "./persistence/task-persistence-readiness.js";
import { runUpdateWorkspacePhaseSnapshot } from "./update-workspace-phase-snapshot-runtime.js";
import {
  runExportWorkspaceStatus,
  runGetWorkspaceStatus,
  runPhaseStatus,
  runSetCurrentPhase,
  runUpdateWorkspaceStatus,
  runWorkspaceStatusHistory
} from "./workspace-status-commands-runtime.js";
import { runAssignTaskPhase, runClearTaskPhase } from "./task-engine-phase-mutations.js";
import { runWishlistStoreCommand } from "./wishlist/task-engine-wishlist-on-command.js";
import { runDashboardSummaryCommand } from "./dashboard/task-engine-dashboard-on-command.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings,
  planningSqliteDatabaseRelativePath,
  planningStrictValidationEnabled
} from "./planning-config.js";
import { validateTaskSetForStrictMode } from "./strict-task-validation.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";
import { runSynthesizeTranscriptChurnCommand } from "./synthesize-transcript-churn-runtime.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "./transcript-churn.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { isWishlistIntakeTask, WISHLIST_INTAKE_TASK_TYPE } from "./wishlist/wishlist-intake.js";
import {
  buildTaskFromConversionPayload,
  digestPayload,
  findIdempotentMutation,
  isRecordLike,
  mutationEvidence,
  nowIso,
  readIdempotencyValue,
  readMetadataPath,
  planningConcurrencySaveOpts,
  readOptionalExpectedPlanningGeneration,
  SAFE_METADATA_PATH_RE,
  TASK_ID_RE
} from "./mutation-utils.js";
import { collectUnknownFeatureSlugWarnings } from "./feature-slug-validation.js";
import {
  featureRegistryActiveOnConnection,
  listFeatureIdsForComponent,
  listRegistryComponents,
  listRegistryFeatures,
  resolveKnownFeatureSlugSet
} from "./persistence/feature-registry-queries.js";
import { runBackfillTaskFeatureLinks } from "./persistence/backfill-task-feature-links-runtime.js";
import { runExportFeatureTaxonomyJson } from "./persistence/export-feature-taxonomy-json-runtime.js";
import { findUnknownFeatureIds, taskTypeFailsClosedOnUnknownFeatures } from "./task-feature-mutation-validation.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../core/cli-remediation.js";
import { buildRunArgsSchemaOnlyPayload } from "../../core/run-args-pilot-validation.js";
import { POLICY_APPROVAL_TWO_LANES_DOC } from "../../core/policy.js";
import { validateTaskSkillAttachments } from "../skills/task-skill-validation.js";
import { summarizeTeamAssignmentsForNextActions } from "../team-execution/assignment-store.js";
import { collectDoctorContractIssues } from "../../cli/doctor-contract-validation.js";

async function composeAgentSessionSnapshotPayload(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): Promise<Record<string, unknown>> {
  const tasks = planning.taskStore.getActiveTasks();
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
  const suggestion = getNextActions(tasks);
  const qh = buildQueueHealthReport({
    tasks,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const doctorKitPhaseIssues: Array<{ path: string; reason: string }> = [];
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
  const teamExecutionContext = summarizeTeamAssignmentsForNextActions(
    planning.sqliteDual.getDatabase(),
    (id) => taskTitleById.get(id) ?? null
  );
  return {
    schemaVersion: 1,
    refreshedAt: new Date().toISOString(),
    suggestedNext: suggestion.suggestedNext
      ? {
          id: suggestion.suggestedNext.id,
          title: suggestion.suggestedNext.title,
          status: suggestion.suggestedNext.status
        }
      : null,
    stateSummary: suggestion.stateSummary,
    queueHealthSummary: qh.summary,
    canonicalPhase: {
      canonicalPhaseKey: phaseRes.canonicalPhaseKey,
      phaseSource: phaseRes.source,
      configMatchesWorkspaceStatus: phaseRes.configMatchesWorkspaceStatus
    },
    doctorKitPhaseIssues,
    teamExecutionContext
  };
}

function readQueueNamespaceArg(args: Record<string, unknown>): string | undefined {
  const q = args.queueNamespace;
  return typeof q === "string" && q.trim().length > 0 ? q.trim() : undefined;
}

const MUTABLE_TASK_FIELDS = new Set([
  "title",
  "type",
  "priority",
  "dependsOn",
  "unblocks",
  "phase",
  "phaseKey",
  "metadata",
  "ownership",
  "approach",
  "summary",
  "description",
  "risk",
  "technicalScope",
  "acceptanceCriteria",
  "features"
]);

const PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function normalizePlanningExecutionDraftTasks(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  timestamp: string,
  commandLabel: string
): { ok: true; tasks: TaskEntity[] } | { ok: false; result: ModuleCommandResult } {
  const tasksRaw = args.tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-task-schema",
        message: `${commandLabel} requires non-empty tasks array`,
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
      }
    };
  }
  const planRef =
    typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
  const planningTypeMeta =
    typeof args.planningType === "string" && args.planningType.trim().length > 0 ? args.planningType.trim() : undefined;
  const targetPhaseKey =
    typeof args.targetPhaseKey === "string" && args.targetPhaseKey.trim().length > 0
      ? args.targetPhaseKey.trim()
      : undefined;
  if (targetPhaseKey && !PHASE_KEY_RE.test(targetPhaseKey)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-task-schema",
        message: "targetPhaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
      }
    };
  }
  const targetPhase =
    typeof args.targetPhase === "string" && args.targetPhase.trim().length > 0 ? args.targetPhase.trim() : undefined;
  const desiredStatus =
    args.desiredStatus === "ready" || args.desiredStatus === "proposed"
      ? (args.desiredStatus as "ready" | "proposed")
      : undefined;
  if (args.desiredStatus !== undefined && desiredStatus === undefined) {
    return {
      ok: false,
      result: { ok: false, code: "invalid-task-schema", message: "desiredStatus must be 'proposed' or 'ready'" }
    };
  }

  const built: TaskEntity[] = [];
  for (const row of tasksRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: "Each tasks[] row must be an object",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    const rowObj = row as Record<string, unknown>;
    const rowPhaseKey =
      typeof rowObj.phaseKey === "string" && rowObj.phaseKey.trim().length > 0 ? rowObj.phaseKey.trim() : undefined;
    const rowStatus = rowObj.status === "ready" || rowObj.status === "proposed" ? rowObj.status : undefined;
    if (rowPhaseKey && !PHASE_KEY_RE.test(rowPhaseKey)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: "Task phaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
        }
      };
    }
    const normalizedRow = { ...rowObj };
    if (targetPhaseKey) {
      normalizedRow.phase = targetPhase ?? `Phase ${targetPhaseKey}`;
    }
    const bt = buildTaskFromConversionPayload(normalizedRow, timestamp);
    if (!bt.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: bt.message,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    let task = bt.task;
    task = {
      ...task,
      status: (desiredStatus ?? rowStatus ?? task.status) as TaskStatus,
      phaseKey: targetPhaseKey ?? rowPhaseKey ?? task.phaseKey,
      phase: targetPhaseKey ? (targetPhase ?? `Phase ${targetPhaseKey}`) : task.phase
    };
    const nextMeta: Record<string, unknown> = { ...(task.metadata ?? {}) };
    if (planRef) {
      nextMeta.planRef = planRef;
    }
    if (planningTypeMeta) {
      const prevProv = isRecordLike(nextMeta.planningProvenance)
        ? { ...(nextMeta.planningProvenance as Record<string, unknown>) }
        : {};
      prevProv.planningType = planningTypeMeta;
      prevProv.source = "persist-planning-execution-drafts";
      nextMeta.planningProvenance = prevProv;
    }
    if (Object.keys(nextMeta).length > 0) {
      task = { ...task, metadata: nextMeta };
    }
    const typeErr = validateKnownTaskTypeRequirements(task);
    if (typeErr) {
      return { ok: false, result: { ok: false, code: typeErr.code, message: typeErr.message } };
    }
    const skillAttach = validateTaskSkillAttachments(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined,
      task.metadata
    );
    if (!skillAttach.ok) {
      return { ok: false, result: { ok: false, code: skillAttach.code, message: skillAttach.message } };
    }
    built.push(task);
  }

  const seen = new Set<string>();
  for (const t of built) {
    if (seen.has(t.id)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: `Duplicate task id in tasks[]: ${t.id}`,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    seen.add(t.id);
  }

  return { ok: true, tasks: built };
}

function reviewPlanningExecutionDraftGaps(tasks: TaskEntity[]): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  const textFor = (task: TaskEntity): string =>
    [
      task.title,
      task.approach,
      ...(task.technicalScope ?? []),
      ...(task.acceptanceCriteria ?? [])
    ].join("\n").toLowerCase();
  const allText = tasks.map(textFor).join("\n");
  const has = (re: RegExp): boolean => re.test(allText);

  for (const task of tasks) {
    const scopeCount = task.technicalScope?.length ?? 0;
    const acceptanceCount = task.acceptanceCriteria?.length ?? 0;
    if (scopeCount > 5 || acceptanceCount > 5 || scopeCount + acceptanceCount > 10) {
      findings.push({
        code: "oversized-task",
        severity: "warning",
        taskId: task.id,
        message: "Task may be too broad; split UX/CAE work into smaller implementation, verification, and rollout slices."
      });
    }
    const vagueCriteria = (task.acceptanceCriteria ?? []).filter((c) => c.trim().length < 15 || /^(works|done|complete)$/i.test(c.trim()));
    if (vagueCriteria.length > 0) {
      findings.push({
        code: "unclear-acceptance-criteria",
        severity: "warning",
        taskId: task.id,
        message: "Acceptance criteria should describe observable behavior, verification, or evidence."
      });
    }
  }

  if (!has(/\b(test|tests|verify|verification|validation|check|coverage|e2e|unit)\b/)) {
    findings.push({
      code: "missing-verification-coverage",
      severity: "error",
      message: "Batch is missing an explicit verification or test coverage slice."
    });
  }
  if (!has(/\b(rollback|revert|activation|activate|toggle|flag|disable|fallback)\b/)) {
    findings.push({
      code: "missing-rollback-activation-slice",
      severity: "error",
      message: "Batch is missing rollback, activation, feature-flag, or fallback coverage."
    });
  }
  if (!has(/\b(empty|first-run|first run|initial|blank|no data|fresh workspace)\b/)) {
    findings.push({
      code: "missing-empty-first-run-behavior",
      severity: "error",
      message: "Batch is missing empty, first-run, or no-data behavior coverage."
    });
  }
  return findings;
}

function strictValidationError(
  store: TaskStore,
  effectiveConfig: Record<string, unknown> | undefined
): string | null {
  if (!planningStrictValidationEnabled({ effectiveConfig })) {
    return null;
  }
  return validateTaskSetForStrictMode(store.getAllTasks());
}

function planningGenPolicyGate(
  ctx: { effectiveConfig?: Record<string, unknown> },
  args: Record<string, unknown>,
  instructionPath: string
): { block: ModuleCommandResult | null; warnings?: string[] } {
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const gate = enforcePlanningGenerationPolicy(policy, args);
  if (!gate.ok) {
    return {
      block: {
        ok: false,
        code: gate.code,
        message: gate.message,
        remediation: {
          instructionPath,
          docPath: CLI_REMEDIATION_DOCS.planningGenerationAdr
        }
      }
    };
  }
  return { block: null, warnings: gate.warnings };
}

function attachPolicyMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  planningGen: number,
  warnings?: string[]
): void {
  data.planningGeneration = planningGen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

function readPlanString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function dependencyBlockersForAction(task: TaskEntity, action: string | undefined, tasks: TaskEntity[]): string[] {
  const needsDependencyCheck =
    (task.status === "ready" && action === "start") || (task.status === "blocked" && action === "unblock");
  if (!needsDependencyCheck) {
    return [];
  }
  const byId = new Map(tasks.map((row) => [row.id, row]));
  return (task.dependsOn ?? []).filter((depId) => byId.get(depId)?.status !== "completed");
}

function withPlanField(sampleArgs: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  return Object.hasOwn(sampleArgs, key) ? sampleArgs : { ...sampleArgs, [key]: value };
}

function buildReadyRunArgs(
  schemaPayload: Record<string, unknown>,
  commandName: string,
  args: Record<string, unknown>,
  planningGeneration: number,
  planningPolicy: string
): Record<string, unknown> {
  let readyArgs =
    schemaPayload.sampleArgs && typeof schemaPayload.sampleArgs === "object" && !Array.isArray(schemaPayload.sampleArgs)
      ? { ...(schemaPayload.sampleArgs as Record<string, unknown>) }
      : {};
  const taskId = readPlanString(args, "taskId");
  const action = readPlanString(args, "action");
  if (taskId) {
    readyArgs = withPlanField(readyArgs, "taskId", taskId);
  }
  if (action) {
    readyArgs = withPlanField(readyArgs, "action", action);
  }
  const planning = schemaPayload.planningGeneration as Record<string, unknown> | undefined;
  if (planningPolicy === "require" && planning?.cliPrelude === true) {
    readyArgs = withPlanField(readyArgs, "expectedPlanningGeneration", planningGeneration);
  }
  const idempotency = schemaPayload.idempotency as Record<string, unknown> | undefined;
  if (idempotency?.clientMutationId === true) {
    readyArgs = withPlanField(readyArgs, "clientMutationId", `${commandName}-<stable-retry-key>`);
  }
  const policy = schemaPayload.policy as Record<string, unknown> | undefined;
  if (policy?.jsonApprovalRequired === true) {
    readyArgs = withPlanField(readyArgs, "policyApproval", {
      confirmed: true,
      rationale: "<human-approved rationale>"
    });
  }
  return readyArgs;
}

function buildAgentMutationPlan(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): ModuleCommandResult {
  const commandName = readPlanString(args, "commandName");
  if (!commandName) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "agent-mutation-plan requires commandName.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/agent-mutation-plan.md" }
    };
  }

  const schemaPayload = buildRunArgsSchemaOnlyPayload(commandName);
  if (!schemaPayload) {
    return {
      ok: false,
      code: "unknown-command",
      message: `No schema-only metadata found for workspace-kit run command '${commandName}'.`,
      remediation: { docPath: CLI_REMEDIATION_DOCS.agentCliMap }
    };
  }

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const planningPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const readyArgs = buildReadyRunArgs(schemaPayload, commandName, args, planningGeneration, planningPolicy);
  const readyArgv = `workspace-kit run ${commandName} '${JSON.stringify(readyArgs)}'`;
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    commandName,
    schemaOnly: schemaPayload,
    policy: {
      ...(schemaPayload.policy as Record<string, unknown> | undefined),
      approvalLane: "JSON policyApproval in the run args object",
      envApprovalApplies: false,
      envApprovalWarning: `WORKSPACE_KIT_POLICY_APPROVAL does not approve workspace-kit run commands; use JSON policyApproval. See ${POLICY_APPROVAL_TWO_LANES_DOC}.`
    },
    planning: {
      planningGeneration,
      planningGenerationPolicy: planningPolicy,
      expectedPlanningGenerationRequired:
        planningPolicy === "require" &&
        (schemaPayload.planningGeneration as Record<string, unknown> | undefined)?.cliPrelude === true,
      expectedPlanningGenerationValue: planningGeneration
    },
    idempotency: {
      ...(schemaPayload.idempotency as Record<string, unknown> | undefined),
      recommendation:
        (schemaPayload.idempotency as Record<string, unknown> | undefined)?.clientMutationId === true
          ? "Use a stable clientMutationId when retrying after ambiguous command output."
          : "No clientMutationId field is declared for this command schema."
    },
    readyRun: {
      args: readyArgs,
      argv: readyArgv
    },
    remediation: {
      instructionPath: schemaPayload.instructionPath,
      remediationContract: schemaPayload.remediationContract
    }
  };

  if (commandName === "run-transition") {
    const taskId = readPlanString(args, "taskId");
    const requestedAction = readPlanString(args, "action");
    const task = taskId ? planning.taskStore.getTask(taskId) : undefined;
    if (!taskId) {
      data.lifecycle = { requested: false, message: "Pass taskId to include task-specific allowedActions." };
    } else if (!task) {
      data.lifecycle = {
        requested: true,
        taskId,
        found: false,
        validNow: false,
        message: `Task '${taskId}' was not found.`
      };
    } else {
      const allowedActions = getAllowedTransitionsFrom(task.status).map((entry) => ({
        action: entry.action,
        targetStatus: entry.to
      }));
      const blockers = dependencyBlockersForAction(task, requestedAction, planning.taskStore.getAllTasks());
      const lifecycleAllowed = requestedAction
        ? allowedActions.some((entry) => entry.action === requestedAction)
        : null;
      data.lifecycle = {
        requested: true,
        taskId,
        found: true,
        taskStatus: task.status,
        allowedActions,
        requestedAction: requestedAction ?? null,
        lifecycleAllowed,
        dependencyBlockers: blockers,
        validNow: lifecycleAllowed === true && blockers.length === 0
      };
    }
  }

  attachPolicyMeta(data, ctx, planningGeneration);
  return {
    ok: true,
    code: "agent-mutation-plan",
    message: `Prepared mutation plan for workspace-kit run ${commandName}`,
    data
  };
}

const TASK_INTENT_ACTIONS: Record<string, string> = {
  "start-task": "start",
  "complete-task": "complete"
};

function hasPriorTransitionForClientMutationId(store: TaskStore, clientMutationId: string | undefined): boolean {
  return (
    clientMutationId !== undefined &&
    store.getTransitionLog().some((entry) => entry.clientMutationId === clientMutationId)
  );
}

async function runTaskIntentTransition(
  commandName: string,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const action = TASK_INTENT_ACTIONS[commandName];
  const taskId = readPlanString(args, "taskId");
  if (!action || !taskId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: `${commandName} requires taskId.`,
      remediation: { instructionPath: `src/modules/task-engine/instructions/${commandName}.md` }
    };
  }
  const clientMutationId = readIdempotencyValue(args);
  const pgTransition = planningGenPolicyGate(
    ctx,
    args,
    `src/modules/task-engine/instructions/${commandName}.md`
  );
  if (pgTransition.block && !hasPriorTransitionForClientMutationId(planning.taskStore, clientMutationId)) {
    return pgTransition.block;
  }
  const hookBus = createKitLifecycleHookBus(ctx.workspacePath, (ctx.effectiveConfig ?? {}) as Record<string, unknown>);
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const service = new TransitionService(
    planning.taskStore,
    [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
    hookBus.isEnabled() ? hookBus : undefined
  );
  try {
    const result = await service.runTransition({
      taskId,
      action,
      actor: readPlanString(args, "actor"),
      expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(args),
      clientMutationId
    });
    const data: Record<string, unknown> = {
      intent: commandName,
      taskId,
      action,
      evidence: result.evidence,
      autoUnblocked: result.autoUnblocked,
      replayed: result.replayed === true
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: result.replayed ? "task-intent-idempotent-replay" : "task-intent-applied",
      message: `${commandName}: ${taskId} via ${action}`,
      data
    };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

async function runClaimNextTaskIntent(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const clientMutationId = readIdempotencyValue(args);
  const pgTransition = planningGenPolicyGate(
    ctx,
    args,
    "src/modules/task-engine/instructions/claim-next-task.md"
  );
  if (pgTransition.block && !hasPriorTransitionForClientMutationId(planning.taskStore, clientMutationId)) {
    return pgTransition.block;
  }
  const ns = readQueueNamespaceArg(args);
  const activeTasks = planning.taskStore.getActiveTasks();
  const suggestion = getNextActions(activeTasks, ns ? { queueNamespace: ns } : undefined);
  const suggested = suggestion.suggestedNext;
  if (!suggested) {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "no-runnable-task",
      suggestedNext: null
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: "No runnable task available to claim.",
      data
    };
  }
  const current = planning.taskStore.getTask(suggested.id);
  if (!current || current.status !== "ready") {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "suggested-task-changed",
      suggestedTaskId: suggested.id,
      currentStatus: current?.status ?? null
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: "Suggested task changed before claim.",
      data
    };
  }
  const blockers = dependencyBlockersForAction(current, "start", activeTasks);
  if (blockers.length > 0) {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "dependency-blocked",
      suggestedTaskId: suggested.id,
      dependencyBlockers: blockers
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: `Suggested task '${suggested.id}' is dependency-blocked.`,
      data
    };
  }
  const hookBus = createKitLifecycleHookBus(ctx.workspacePath, (ctx.effectiveConfig ?? {}) as Record<string, unknown>);
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const service = new TransitionService(
    planning.taskStore,
    [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
    hookBus.isEnabled() ? hookBus : undefined
  );
  try {
    const result = await service.runTransition({
      taskId: suggested.id,
      action: "start",
      actor: readPlanString(args, "actor"),
      expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(args),
      clientMutationId
    });
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      taskId: suggested.id,
      action: "start",
      evidence: result.evidence,
      autoUnblocked: result.autoUnblocked,
      replayed: result.replayed === true
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: result.replayed ? "task-intent-idempotent-replay" : "task-intent-applied",
      message: `Claimed ${suggested.id} — ${suggested.title}`,
      data
    };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.22.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["task-engine"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
    },
    instructions: {
      directory: "src/modules/task-engine/instructions",
      entries: builtinInstructionEntriesForModule("task-engine")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    if (command.name === "migrate-task-persistence") {
      return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
    }
    if (command.name === "task-persistence-readiness") {
      return runTaskPersistenceReadiness(ctx, args as Record<string, unknown>);
    }
    if (command.name === "backup-planning-sqlite") {
      return runBackupPlanningSqlite(ctx, args as Record<string, unknown>);
    }
    if (command.name === "get-kit-persistence-map") {
      return runGetKitPersistenceMap(ctx);
    }
    if (command.name === "update-workspace-phase-snapshot") {
      return runUpdateWorkspacePhaseSnapshot(ctx, args as Record<string, unknown>);
    }
    if (command.name === "get-workspace-status") {
      return runGetWorkspaceStatus(ctx, args as Record<string, unknown>);
    }
    if (command.name === "classify-kit-state") {
      return runClassifyKitState(ctx, args as Record<string, unknown>);
    }
    if (command.name === "update-workspace-status") {
      return runUpdateWorkspaceStatus(ctx, args as Record<string, unknown>);
    }
    if (command.name === "set-current-phase") {
      return runSetCurrentPhase(ctx, args as Record<string, unknown>);
    }
    if (command.name === "export-workspace-status") {
      return runExportWorkspaceStatus(ctx, args as Record<string, unknown>);
    }
    if (command.name === "workspace-status-history") {
      return runWorkspaceStatusHistory(ctx, args as Record<string, unknown>);
    }
    if (command.name === "list-module-states" || command.name === "get-module-state") {
      const unified = new UnifiedStateDb(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
      const dbAbs = unified.dbPath;
      let kitSqliteUserVersion: number | null = null;
      try {
        const fs = await import("node:fs");
        if (fs.existsSync(dbAbs)) {
          kitSqliteUserVersion = readKitSqliteUserVersion(dbAbs);
        }
      } catch {
        kitSqliteUserVersion = null;
      }
      if (command.name === "list-module-states") {
        return {
          ok: true,
          code: "module-states-listed",
          message: "Listed module state rows",
          data: { rows: unified.listModuleStates(), kitSqliteUserVersion }
        };
      }
      const moduleId = typeof args.moduleId === "string" ? args.moduleId.trim() : "";
      if (!moduleId) {
        return { ok: false, code: "invalid-task-schema", message: "get-module-state requires moduleId" };
      }
      const row = unified.getModuleState(moduleId);
      return row
        ? {
            ok: true,
            code: "module-state-read",
            message: `Read module state for ${moduleId}`,
            data: { row }
          }
        : {
            ok: false,
            code: "task-not-found",
            message: `No module state found for '${moduleId}'`
          };
    }

    let planning;
    try {
      planning = await openPlanningStores(ctx);
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open task planning stores: ${(err as Error).message}`
      };
    }
    const store = planning.taskStore;

    if (command.name === "agent-session-snapshot" || command.name === "agent-bootstrap") {
      if (command.name === "agent-bootstrap") {
        const doctorIssues = await collectDoctorContractIssues(ctx.workspacePath);
        if (doctorIssues.length > 0) {
          const data: Record<string, unknown> = { doctor: { ok: false, issues: doctorIssues } };
          attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
          return {
            ok: false,
            code: "agent-bootstrap-doctor-failed",
            message: `Doctor contract check failed (${doctorIssues.length} issue(s)); run workspace-kit doctor and fix reported paths.`,
            data
          };
        }
      }
      const snapshotData = await composeAgentSessionSnapshotPayload(ctx, planning);
      attachPolicyMeta(snapshotData, ctx, planning.sqliteDual.getPlanningGeneration());
      if (command.name === "agent-bootstrap") {
        snapshotData.doctor = { ok: true, issues: [] as Array<{ path: string; reason: string }> };
        return {
          ok: true,
          code: "agent-bootstrap",
          message: "Doctor passed; composed session snapshot for agent cold start",
          data: snapshotData
        };
      }
      return {
        ok: true,
        code: "agent-session-snapshot",
        message: "Read-only composed snapshot for session reload",
        data: snapshotData
      };
    }

    if (command.name === "agent-mutation-plan") {
      return buildAgentMutationPlan(ctx, planning, args as Record<string, unknown>);
    }

    if (command.name === "claim-next-task") {
      return runClaimNextTaskIntent(ctx, planning, args as Record<string, unknown>);
    }

    if (command.name === "start-task" || command.name === "complete-task") {
      return runTaskIntentTransition(command.name, ctx, planning, args as Record<string, unknown>);
    }

    if (command.name === "phase-status") {
      return runPhaseStatus(ctx, args as Record<string, unknown>, {
        tasks: store.getActiveTasks(),
        db: planning.sqliteDual.getDatabase(),
        dbPath: planning.sqliteDual.dbPath
      });
    }

    if (command.name === "phase-delivery-preflight") {
      const argObj = args as Record<string, unknown>;
      const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
      const phaseRes = resolveCanonicalPhase({
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        workspaceStatus
      });
      const phaseKey =
        typeof argObj.phaseKey === "string" && argObj.phaseKey.trim().length > 0
          ? argObj.phaseKey.trim()
          : phaseRes.canonicalPhaseKey;
      const includeInProgress =
        typeof argObj.includeInProgress === "boolean" ? argObj.includeInProgress : true;
      const preflight = buildPhaseDeliveryPreflight({
        tasks: store.getActiveTasks(),
        phaseKey,
        includeInProgress
      });
      const data: Record<string, unknown> = {
        ...preflight,
        canonicalPhase: phaseRes,
        includeInProgress
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "phase-delivery-preflight",
        message:
          preflight.violationCount === 0
            ? "Phase delivery evidence preflight passed"
            : `Phase delivery evidence preflight found ${preflight.violationCount} violation(s)`,
        data
      };
    }

    if (command.name === "release-evidence-manifest") {
      const result = buildReleaseEvidenceManifest({
        workspacePath: ctx.workspacePath,
        tasks: store.getActiveTasks(),
        commandArgs: args as Record<string, unknown>
      });
      if (!result.ok) {
        return {
          ok: false,
          code: result.code,
          message: result.message,
          details: result.details
        };
      }
      const data: Record<string, unknown> = { manifest: result.manifest };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "release-evidence-manifest",
        message: "Built release evidence manifest",
        data
      };
    }

    if (command.name === "list-components") {
      const db = planning.sqliteDual.getDatabase();
      if (!featureRegistryActiveOnConnection(db)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "list-components requires kit SQLite user_version >= 5 (relational feature registry)"
        };
      }
      const components = listRegistryComponents(db);
      const data: Record<string, unknown> = { components, count: components.length };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "feature-components-listed",
        message: `${components.length} component(s)`,
        data
      };
    }

    if (command.name === "list-features") {
      const db = planning.sqliteDual.getDatabase();
      if (!featureRegistryActiveOnConnection(db)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "list-features requires kit SQLite user_version >= 5 (relational feature registry)"
        };
      }
      const componentId = typeof args.componentId === "string" ? args.componentId.trim() : undefined;
      const features = listRegistryFeatures(db, componentId);
      const data: Record<string, unknown> = {
        features,
        count: features.length,
        componentId: componentId ?? null
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "feature-rows-listed",
        message: `${features.length} feature(s)`,
        data
      };
    }

    if (command.name === "backfill-task-feature-links") {
      return runBackfillTaskFeatureLinks(ctx, args as Record<string, unknown>);
    }

    if (command.name === "export-feature-taxonomy-json") {
      return runExportFeatureTaxonomyJson(ctx, args as Record<string, unknown>);
    }

    if (command.name === "run-transition") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const action = typeof args.action === "string" ? args.action : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;

      if (!taskId || !action) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "run-transition requires 'taskId' and 'action' arguments",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition }
        };
      }
      const clientMutationId = readIdempotencyValue(args);
      const hasPriorTransition =
        clientMutationId !== undefined &&
        store.getTransitionLog().some((entry) => entry.clientMutationId === clientMutationId);

      const pgTransition = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.runTransition
      );
      if (pgTransition.block && !hasPriorTransition) {
        return pgTransition.block;
      }

      try {
        const hookBus = createKitLifecycleHookBus(
          ctx.workspacePath,
          (ctx.effectiveConfig ?? {}) as Record<string, unknown>
        );
        const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
          ctx.effectiveConfig as Record<string, unknown> | undefined
        );
        const service = new TransitionService(
          store,
          [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
          hookBus.isEnabled() ? hookBus : undefined
        );
        const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(
          args as Record<string, unknown>
        );
        const result = await service.runTransition({
          taskId,
          action,
          actor,
          expectedPlanningGeneration,
          clientMutationId
        });
        if (!result.replayed && result.evidence.toState === "completed") {
          maybeSpawnTranscriptHookAfterCompletion(
            ctx.workspacePath,
            (ctx.effectiveConfig ?? {}) as Record<string, unknown>
          );
        }
        const data: Record<string, unknown> = {
          evidence: result.evidence,
          autoUnblocked: result.autoUnblocked,
          replayed: result.replayed === true
        };
        attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
        return {
          ok: true,
          code: result.replayed ? "transition-idempotent-replay" : "transition-applied",
          message: result.replayed
            ? `Idempotent run-transition replay for ${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`
            : `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
          data
        };
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "invalid-transition",
          message: (err as Error).message
        };
      }
    }

    if (command.name === "synthesize-transcript-churn") {
      const pgSyn = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn
      );
      if (pgSyn.block) {
        return pgSyn.block;
      }
      const res = await runSynthesizeTranscriptChurnCommand(ctx, args as Record<string, unknown>);
      if (res.ok && res.data && typeof res.data === "object") {
        attachPolicyMeta(
          res.data as Record<string, unknown>,
          ctx,
          planning.sqliteDual.getPlanningGeneration(),
          pgSyn.warnings
        );
      }
      return res;
    }

    if (command.name === "create-task" || command.name === "create-task-from-plan") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (args.features !== undefined && !Array.isArray(args.features)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "create-task field 'features' must be an array of strings when provided"
        };
      }
      const id = typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : undefined;
      const title = typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : undefined;
      const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
      const status = typeof args.status === "string" ? args.status : "proposed";
      const priority =
        typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
          ? args.priority as TaskPriority
          : undefined;
      const clientMutationId = readIdempotencyValue(args);
      const allowedInitial: TaskStatus[] = ["proposed", "ready"];
      if (type === TRANSCRIPT_CHURN_TASK_TYPE) {
        allowedInitial.push("research");
      }
      if (!id || !title || !TASK_ID_RE.test(id) || !allowedInitial.includes(status as TaskStatus)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message:
            "create-task requires id/title, id format T<number>, and status proposed, ready, or research (research only with type transcript_churn)"
        };
      }
      const evidenceType = command.name === "create-task-from-plan" ? "create-task-from-plan" : "create-task";
      const timestamp = nowIso();
      const task: TaskEntity = {
        id,
        title,
        type,
        status: status as TaskStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
        priority,
        dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.filter((x) => typeof x === "string") : undefined,
        unblocks: Array.isArray(args.unblocks) ? args.unblocks.filter((x) => typeof x === "string") : undefined,
        phase: typeof args.phase === "string" ? args.phase : undefined,
        phaseKey: typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : undefined,
        metadata: typeof args.metadata === "object" && args.metadata !== null ? args.metadata as Record<string, unknown> : undefined,
        ownership: typeof args.ownership === "string" ? args.ownership : undefined,
        approach: typeof args.approach === "string" ? args.approach : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        risk: typeof args.risk === "string" ? args.risk : undefined,
        technicalScope: Array.isArray(args.technicalScope) ? args.technicalScope.filter((x) => typeof x === "string") : undefined,
        acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria.filter((x) => typeof x === "string") : undefined,
        features: Array.isArray(args.features) ? args.features.filter((x) => typeof x === "string") : undefined
      };
      if (command.name === "create-task-from-plan") {
        const planRef = typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
        if (!planRef) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "create-task-from-plan requires 'planRef'"
          };
        }
        task.metadata = { ...(task.metadata ?? {}), planRef };
      }
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
      if (clientMutationId) {
        const prior = findIdempotentMutation(store, evidenceType, id, clientMutationId);
        if (prior) {
          if (prior.payloadDigest !== payloadDigest) {
            return {
              ok: false,
              code: "idempotency-key-conflict",
              message: `clientMutationId '${clientMutationId}' was already used for a different ${evidenceType} payload on ${id}`
            };
          }
          const replayCreate: Record<string, unknown> = {
            task: store.getTask(id),
            replayed: true
          };
          attachPolicyMeta(replayCreate, ctx, planning.sqliteDual.getPlanningGeneration());
          return {
            ok: true,
            code: "task-create-idempotent-replay",
            message: `Idempotent create replay for task '${id}'`,
            data: replayCreate
          };
        }
      }
      if (store.getTask(id)) {
        return { ok: false, code: "duplicate-task-id", message: `Task '${id}' already exists` };
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
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.createTask
      );
      if (pgCreate.block) {
        return pgCreate.block;
      }
      const knownSlugs = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
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
      store.addTask(task);
      store.addMutationEvidence(mutationEvidence(evidenceType, id, actor, {
        initialStatus: task.status,
        source: command.name,
        clientMutationId,
        payloadDigest
      }));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const createdData: Record<string, unknown> = { task };
      attachPolicyMeta(createdData, ctx, planning.sqliteDual.getPlanningGeneration(), [
        ...(pgCreate.warnings ?? []),
        ...featureSlugWarnings
      ]);
      return {
        ok: true,
        code: "task-created",
        message: `Created task '${id}'`,
        data: createdData
      };
    }

    if (command.name === "review-planning-execution-drafts") {
      const normalized = normalizePlanningExecutionDraftTasks(
        ctx,
        args as Record<string, unknown>,
        nowIso(),
        "review-planning-execution-drafts"
      );
      if (!normalized.ok) {
        return normalized.result;
      }
      const findings = reviewPlanningExecutionDraftGaps(normalized.tasks);
      const errorCount = findings.filter((f) => f.severity === "error").length;
      const warningCount = findings.filter((f) => f.severity === "warning").length;
      return {
        ok: true,
        code: errorCount > 0 ? "planning-execution-drafts-review-findings" : "planning-execution-drafts-review-passed",
        message:
          findings.length > 0
            ? `Reviewed ${normalized.tasks.length} draft task(s): ${errorCount} error(s), ${warningCount} warning(s)`
            : `Reviewed ${normalized.tasks.length} draft task(s): no UX/CAE batch gaps found`,
        data: {
          schemaVersion: 1,
          persisted: false,
          reviewProfile: "ux-cae-pre-persist-v1",
          taskCount: normalized.tasks.length,
          status: errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
          errorCount,
          warningCount,
          findings,
          normalizedTaskSummaries: normalized.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            phase: task.phase,
            phaseKey: task.phaseKey ?? null
          }))
        } as Record<string, unknown>
      };
    }

    if (command.name === "persist-planning-execution-drafts") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const tasksRaw = args.tasks;
      if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "persist-planning-execution-drafts requires non-empty tasks array",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        };
      }
      const planRef =
        typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
      const planningTypeMeta =
        typeof args.planningType === "string" && args.planningType.trim().length > 0
          ? args.planningType.trim()
          : undefined;
      const targetPhaseKey =
        typeof args.targetPhaseKey === "string" && args.targetPhaseKey.trim().length > 0
          ? args.targetPhaseKey.trim()
          : undefined;
      if (targetPhaseKey && !PHASE_KEY_RE.test(targetPhaseKey)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "targetPhaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
        };
      }
      const targetPhase =
        typeof args.targetPhase === "string" && args.targetPhase.trim().length > 0
          ? args.targetPhase.trim()
          : undefined;
      const desiredStatus =
        args.desiredStatus === "ready" || args.desiredStatus === "proposed"
          ? (args.desiredStatus as "ready" | "proposed")
          : undefined;
      if (args.desiredStatus !== undefined && desiredStatus === undefined) {
        return { ok: false, code: "invalid-task-schema", message: "desiredStatus must be 'proposed' or 'ready'" };
      }
      const bulkClientMutationId = readIdempotencyValue(args);
      const timestamp = nowIso();
      const pgBulk = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts
      );
      if (pgBulk.block) {
        return pgBulk.block;
      }

      const taskPersistDigestForIdempotency = (t: TaskEntity): string =>
        digestPayload({
          id: t.id,
          title: t.title,
          type: t.type,
          status: t.status,
          phase: t.phase,
          phaseKey: t.phaseKey ?? null,
          approach: t.approach,
          technicalScope: t.technicalScope ?? [],
          acceptanceCriteria: t.acceptanceCriteria ?? [],
          dependsOn: t.dependsOn ?? [],
          unblocks: t.unblocks ?? [],
          priority: t.priority ?? null,
          metadata: t.metadata ?? null
        });

      const built: TaskEntity[] = [];
      for (const row of tasksRaw) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "Each tasks[] row must be an object",
            remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
          };
        }
        const rowObj = row as Record<string, unknown>;
        const rowPhaseKey =
          typeof rowObj.phaseKey === "string" && rowObj.phaseKey.trim().length > 0 ? rowObj.phaseKey.trim() : undefined;
        const rowStatus = rowObj.status === "ready" || rowObj.status === "proposed" ? rowObj.status : undefined;
        if (rowPhaseKey && !PHASE_KEY_RE.test(rowPhaseKey)) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "Task phaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
          };
        }
        const normalizedRow = { ...rowObj };
        if (targetPhaseKey) {
          normalizedRow.phase = targetPhase ?? `Phase ${targetPhaseKey}`;
        }
        const bt = buildTaskFromConversionPayload(normalizedRow, timestamp);
        if (!bt.ok) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: bt.message,
            remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
          };
        }
        let task = bt.task;
        task = {
          ...task,
          status: (desiredStatus ?? rowStatus ?? task.status) as TaskStatus,
          phaseKey: targetPhaseKey ?? rowPhaseKey ?? task.phaseKey,
          phase: targetPhaseKey ? (targetPhase ?? `Phase ${targetPhaseKey}`) : task.phase
        };
        const nextMeta: Record<string, unknown> = { ...(task.metadata ?? {}) };
        if (planRef) {
          nextMeta.planRef = planRef;
        }
        if (planningTypeMeta) {
          const prevProv = isRecordLike(nextMeta.planningProvenance)
            ? { ...(nextMeta.planningProvenance as Record<string, unknown>) }
            : {};
          prevProv.planningType = planningTypeMeta;
          prevProv.source = "persist-planning-execution-drafts";
          nextMeta.planningProvenance = prevProv;
        }
        if (Object.keys(nextMeta).length > 0) {
          task = { ...task, metadata: nextMeta };
        }
        const typeErr = validateKnownTaskTypeRequirements(task);
        if (typeErr) {
          return { ok: false, code: typeErr.code, message: typeErr.message };
        }
        const skillAttach = validateTaskSkillAttachments(
          ctx.workspacePath,
          ctx.effectiveConfig as Record<string, unknown> | undefined,
          task.metadata
        );
        if (!skillAttach.ok) {
          return { ok: false, code: skillAttach.code, message: skillAttach.message };
        }
        built.push(task);
      }

      const seen = new Set<string>();
      for (const t of built) {
        if (seen.has(t.id)) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: `Duplicate task id in tasks[]: ${t.id}`,
            remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
          };
        }
        seen.add(t.id);
      }

      if (bulkClientMutationId) {
        let priorHits = 0;
        for (const t of built) {
          const composed = `${bulkClientMutationId}::${t.id}`;
          const prior = findIdempotentMutation(store, "create-task", t.id, composed);
          const d = taskPersistDigestForIdempotency(t);
          if (prior) {
            if (prior.payloadDigest !== d) {
              return {
                ok: false,
                code: "idempotency-key-conflict",
                message: `clientMutationId '${bulkClientMutationId}' was already used for a different create-task payload on ${t.id}`
              };
            }
            priorHits += 1;
            if (!store.getTask(t.id)) {
              return {
                ok: false,
                code: "task-not-found",
                message: `Idempotent replay expected task '${t.id}' to exist`
              };
            }
          } else if (store.getTask(t.id)) {
            return {
              ok: false,
              code: "duplicate-task-id",
              message: `Task '${t.id}' already exists`
            };
          }
        }
        if (priorHits > 0 && priorHits < built.length) {
          return {
            ok: false,
            code: "planning-execution-drafts-partial-idempotency",
            message:
              "Mixed idempotency state: some task ids already recorded for this clientMutationId and others are new; retry with a fresh clientMutationId or reconcile task store"
          };
        }
        if (priorHits === built.length) {
          const createdTasks = built.map((t) => store.getTask(t.id)).filter((x): x is TaskEntity => Boolean(x));
          const replayData: Record<string, unknown> = {
            createdTasks,
            count: createdTasks.length,
            replayed: true
          };
          attachPolicyMeta(
            replayData,
            ctx,
            planning.sqliteDual.getPlanningGeneration(),
            pgBulk.warnings
          );
          return {
            ok: true,
            code: "planning-execution-drafts-idempotent-replay",
            message: `Idempotent replay for ${createdTasks.length} planning execution draft task(s)`,
            data: replayData
          };
        }
      } else {
        for (const t of built) {
          if (store.getTask(t.id)) {
            return {
              ok: false,
              code: "duplicate-task-id",
              message: `Task '${t.id}' already exists`
            };
          }
        }
      }

      const knownSlugs = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
      for (const t of built) {
        const badFeat = findUnknownFeatureIds(t.features, knownSlugs);
        if (badFeat.length > 0 && taskTypeFailsClosedOnUnknownFeatures(t.type)) {
          return {
            ok: false,
            code: "unknown-feature-id",
            message: `Unknown feature id(s): ${badFeat.join(", ")}`
          };
        }
      }

      if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
        const strictIssue = validateTaskSetForStrictMode([...store.getAllTasks(), ...built]);
        if (strictIssue) {
          return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
        }
      }

      const featureSlugWarnings: string[] = [];
      for (const t of built) {
        featureSlugWarnings.push(...collectUnknownFeatureSlugWarnings(t.features, knownSlugs));
      }

      const applyBulk = (): void => {
        for (const t of built) {
          store.addTask(t);
          const composedIdem = bulkClientMutationId ? `${bulkClientMutationId}::${t.id}` : undefined;
          const payloadDigest = taskPersistDigestForIdempotency(t);
          store.addMutationEvidence(
            mutationEvidence("create-task", t.id, actor, {
              initialStatus: t.status,
              source: "persist-planning-execution-drafts",
              clientMutationId: composedIdem,
              payloadDigest
            })
          );
        }
      };

      planning.sqliteDual.withTransaction(applyBulk, planningConcurrencySaveOpts(args as Record<string, unknown>));

      const strictAfter = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictAfter) {
        return { ok: false, code: "strict-task-validation-failed", message: strictAfter };
      }

      const outData: Record<string, unknown> = { createdTasks: built, count: built.length };
      attachPolicyMeta(outData, ctx, planning.sqliteDual.getPlanningGeneration(), [
        ...(pgBulk.warnings ?? []),
        ...featureSlugWarnings
      ]);
      return {
        ok: true,
        code: "planning-execution-drafts-persisted",
        message: `Persisted ${built.length} planning execution draft task(s)`,
        data: outData
      };
    }

    if (command.name === "update-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const updates = typeof args.updates === "object" && args.updates !== null ? args.updates as Record<string, unknown> : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !updates) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "update-task requires taskId and updates object",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.updateTask }
        };
      }
      const clientMutationId = readIdempotencyValue(args);
      const task = store.getTask(taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const invalidKeys = Object.keys(updates).filter((key) => !MUTABLE_TASK_FIELDS.has(key));
      if (invalidKeys.length > 0) {
        return {
          ok: false,
          code: "invalid-task-update",
          message: `update-task cannot mutate immutable fields: ${invalidKeys.join(", ")}`
        };
      }
      if (updates.features !== undefined) {
        if (!Array.isArray(updates.features) || !(updates.features as unknown[]).every((x) => typeof x === "string")) {
          return {
            ok: false,
            code: "invalid-task-update",
            message: "update-task field 'features' must be an array of strings when provided"
          };
        }
      }
      const updatedTask = { ...task, ...updates, updatedAt: nowIso() } as TaskEntity;
      const knownUpd = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
      const badUpd = findUnknownFeatureIds(updatedTask.features, knownUpd);
      if (badUpd.length > 0 && taskTypeFailsClosedOnUnknownFeatures(updatedTask.type)) {
        return {
          ok: false,
          code: "unknown-feature-id",
          message: `Unknown feature id(s): ${badUpd.join(", ")}`
        };
      }
      const featureSlugWarningsUpd = collectUnknownFeatureSlugWarnings(updatedTask.features, knownUpd);
      const skillAttachUpd = validateTaskSkillAttachments(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined,
        updatedTask.metadata
      );
      if (!skillAttachUpd.ok) {
        return { ok: false, code: skillAttachUpd.code, message: skillAttachUpd.message };
      }
      const payloadDigest = digestPayload({ taskId, updates });
      if (clientMutationId) {
        const prior = findIdempotentMutation(store, "update-task", taskId, clientMutationId);
        if (prior) {
          if (prior.payloadDigest !== payloadDigest) {
            return {
              ok: false,
              code: "idempotency-key-conflict",
              message: `clientMutationId '${clientMutationId}' was already used for a different update-task payload on ${taskId}`
            };
          }
          const replayUpd: Record<string, unknown> = { task, replayed: true };
          attachPolicyMeta(replayUpd, ctx, planning.sqliteDual.getPlanningGeneration());
          return {
            ok: true,
            code: "task-update-idempotent-replay",
            message: `Idempotent update replay for task '${taskId}'`,
            data: replayUpd
          };
        }
      }
      const pgUpd = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.updateTask
      );
      if (pgUpd.block) {
        return pgUpd.block;
      }
      const knownTypeValidationError = validateKnownTaskTypeRequirements(updatedTask);
      if (knownTypeValidationError) {
        return {
          ok: false,
          code: knownTypeValidationError.code,
          message: knownTypeValidationError.message
        };
      }
      store.updateTask(updatedTask);
      store.addMutationEvidence(
        mutationEvidence("update-task", taskId, actor, {
          updatedFields: Object.keys(updates),
          clientMutationId,
          payloadDigest
        })
      );
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const updData: Record<string, unknown> = { task: updatedTask };
      attachPolicyMeta(updData, ctx, planning.sqliteDual.getPlanningGeneration(), [
        ...(pgUpd.warnings ?? []),
        ...featureSlugWarningsUpd
      ]);
      return {
        ok: true,
        code: "task-updated",
        message: `Updated task '${taskId}'`,
        data: updData
      };
    }

    if (command.name === "assign-task-phase") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const r = await runAssignTaskPhase({
        store,
        ctx,
        strictValidationError,
        actor,
        rawArgs: args as Record<string, unknown>
      });
      if (r.ok && r.data && typeof r.data === "object") {
        attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
      }
      return r;
    }

    if (command.name === "clear-task-phase") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const r = await runClearTaskPhase({
        store,
        ctx,
        strictValidationError,
        actor,
        rawArgs: args as Record<string, unknown>
      });
      if (r.ok && r.data && typeof r.data === "object") {
        attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
      }
      return r;
    }

    if (command.name === "archive-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId) {
        return { ok: false, code: "invalid-task-schema", message: "archive-task requires taskId" };
      }
      const task = store.getTask(taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const pgArchive = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.archiveTask
      );
      if (pgArchive.block) {
        return pgArchive.block;
      }
      const archivedAt = nowIso();
      const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
      store.updateTask(updatedTask);
      store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const archData: Record<string, unknown> = { task: updatedTask };
      attachPolicyMeta(archData, ctx, planning.sqliteDual.getPlanningGeneration(), pgArchive.warnings);
      return {
        ok: true,
        code: "task-archived",
        message: `Archived task '${taskId}'`,
        data: archData
      };
    }

    if (command.name === "get-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      if (!taskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "get-task requires 'taskId' argument"
        };
      }

      const task = store.getTask(taskId);
      if (!task) {
        return {
          ok: false,
          code: "task-not-found",
          message: `Task '${taskId}' not found`
        };
      }

      const historyLimitRaw = args.historyLimit;
      const historyLimit =
        typeof historyLimitRaw === "number" && Number.isFinite(historyLimitRaw) && historyLimitRaw > 0
          ? Math.min(Math.floor(historyLimitRaw), 200)
          : 50;
      const log = store.getTransitionLog();
      const recentTransitions = log
        .filter((e) => e.taskId === taskId)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, historyLimit);

      const allowedActions = getAllowedTransitionsFrom(task.status as TaskStatus).map(({ to, action }) => ({
        action,
        targetStatus: to
      }));

      const gtData: Record<string, unknown> = {
        task,
        recentTransitions,
        allowedActions
      };
      attachPolicyMeta(gtData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "task-retrieved",
        data: gtData
      };
    }

    if (command.name === "add-dependency" || command.name === "remove-dependency") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const dependencyTaskId =
        typeof args.dependencyTaskId === "string"
          ? args.dependencyTaskId
          : typeof args.dependsOnTaskId === "string"
            ? args.dependsOnTaskId
            : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !dependencyTaskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `${command.name} requires taskId and dependencyTaskId`
        };
      }
      if (taskId === dependencyTaskId) {
        return { ok: false, code: "dependency-cycle", message: "Task cannot depend on itself" };
      }
      const task = store.getTask(taskId);
      const dep = store.getTask(dependencyTaskId);
      if (!task || !dep) {
        return { ok: false, code: "task-not-found", message: "taskId or dependencyTaskId not found" };
      }
      const deps = new Set(task.dependsOn ?? []);
      if (command.name === "add-dependency") {
        if (deps.has(dependencyTaskId)) {
          return { ok: false, code: "duplicate-dependency", message: "Dependency already exists" };
        }
        deps.add(dependencyTaskId);
      } else {
        deps.delete(dependencyTaskId);
      }
      const pgDep = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        CLI_REMEDIATION_INSTRUCTIONS.addDependency
      );
      if (pgDep.block) {
        return pgDep.block;
      }
      const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
      store.updateTask(updatedTask);
      const mutationType = command.name === "add-dependency" ? "add-dependency" : "remove-dependency";
      store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const depData: Record<string, unknown> = { task: updatedTask };
      attachPolicyMeta(depData, ctx, planning.sqliteDual.getPlanningGeneration(), pgDep.warnings);
      return {
        ok: true,
        code: command.name === "add-dependency" ? "dependency-added" : "dependency-removed",
        message: `${command.name} applied for '${taskId}'`,
        data: depData
      };
    }

    if (command.name === "get-dependency-graph") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const tasks = store.getActiveTasks();
      const byId = new Map(tasks.map((task) => [task.id, task]));
      const nodes = tasks.map((task) => ({ id: task.id, status: task.status }));
      const edges = tasks.flatMap((task) => (task.dependsOn ?? []).map((depId) => ({ from: task.id, to: depId })));
      const dependencyEdges = edges.map((edge) => {
        const dep = byId.get(edge.to);
        return {
          taskId: edge.from,
          dependsOnTaskId: edge.to,
          dependencyStatus: dep?.status ?? "missing",
          satisfied: dep?.status === "completed"
        };
      });
      if (!taskId) {
        return { ok: true, code: "dependency-graph", data: { nodes, edges, dependencyEdges } as Record<string, unknown> };
      }
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const taskDependencyEdges = dependencyEdges.filter((edge) => edge.taskId === taskId);
      return {
        ok: true,
        code: "dependency-graph",
        data: {
          taskId,
          dependsOn: task.dependsOn ?? [],
          directDependents: tasks.filter((candidate) => (candidate.dependsOn ?? []).includes(taskId)).map((x) => x.id),
          nodes,
          edges,
          dependencyEdges: taskDependencyEdges
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-task-history" || command.name === "get-recent-task-activity") {
      const limitRaw = args.limit;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 50;
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const transitions = store.getTransitionLog().map((entry) => ({ kind: "transition", ...entry }));
      const mutations = store.getMutationLog().map((entry) => ({ kind: "mutation", ...entry }));
      const merged = [...transitions, ...mutations]
        .filter((entry) => (taskId ? entry.taskId === taskId : true))
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, limit);
      return {
        ok: true,
        code: command.name === "get-task-history" ? "task-history" : "recent-task-activity",
        data: { taskId: taskId ?? null, items: merged, count: merged.length } as Record<string, unknown>
      };
    }

    if (command.name === "dashboard-summary") {
      return runDashboardSummaryCommand(
        ctx,
        store,
        planning.sqliteDual.getPlanningGeneration(),
        planning.sqliteDual
      );
    }

    if (command.name === "queue-health") {
      const tasks = store.getActiveTasks();
      const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
      const report = buildQueueHealthReport({
        tasks,
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        workspaceStatus
      });
      return {
        ok: true,
        code: "queue-health",
        message: `Queue health: ${report.summary.readyCount} ready; ${report.summary.misalignedPhaseCount} phase mismatches; ${report.summary.blockedByDependenciesCount} ready with unmet dependencies`,
        data: report as unknown as Record<string, unknown>
      };
    }

    if (command.name === "queue-git-alignment") {
      const staleRaw = args.staleInProgressDays;
      const staleInProgressDays =
        typeof staleRaw === "number" && Number.isFinite(staleRaw) && staleRaw > 0
          ? Math.min(Math.floor(staleRaw), 3650)
          : undefined;
      const report = buildQueueGitAlignmentReport({
        workspacePath: ctx.workspacePath,
        tasks: store.getActiveTasks(),
        transitionLog: store.getTransitionLog(),
        storeLastUpdated: store.getLastUpdated(),
        git: probeGitHead(ctx.workspacePath),
        staleInProgressDays
      });
      return {
        ok: true,
        code: "queue-git-alignment",
        message: report.summary,
        data: report as unknown as Record<string, unknown>
      };
    }

    if (command.name === "replay-queue-snapshot") {
      const ns = readQueueNamespaceArg(args);
      let taskList: TaskEntity[];
      try {
        const snapPath =
          typeof args.snapshotRelativePath === "string" ? args.snapshotRelativePath.trim() : "";
        if (snapPath) {
          taskList = await loadTasksFromSnapshotFile(ctx.workspacePath, snapPath);
        } else if (Array.isArray(args.tasks)) {
          taskList = parseTasksFromSnapshotPayload({ tasks: args.tasks });
        } else {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "replay-queue-snapshot requires snapshotRelativePath (repo-relative) or tasks[] array"
          };
        }
      } catch (e) {
        return {
          ok: false,
          code: "import-parse-error",
          message: (e as Error).message
        };
      }
      const data = replayQueueFromTasks(taskList, ns ? { queueNamespace: ns } : undefined);
      return {
        ok: true,
        code: "queue-replay",
        message: `Replayed ${data.taskCount} tasks (read-only)`,
        data: data as unknown as Record<string, unknown>
      };
    }

    if (command.name === "list-tasks") {
      const statusFilter = typeof args.status === "string" ? args.status as TaskStatus : undefined;
      const phaseFilter = typeof args.phase === "string" ? args.phase : undefined;
      const phaseKeyFilter =
        typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : undefined;
      const typeFilter = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : undefined;
      const categoryFilter =
        typeof args.category === "string" && args.category.trim().length > 0 ? args.category.trim() : undefined;
      const tagsFilterRaw = args.tags;
      const tagsFilter =
        typeof tagsFilterRaw === "string"
          ? [tagsFilterRaw]
          : Array.isArray(tagsFilterRaw)
            ? tagsFilterRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
            : [];
      const metadataFilters = isRecordLike(args.metadataFilters)
        ? Object.entries(args.metadataFilters).filter(([path]) => SAFE_METADATA_PATH_RE.test(path))
        : [];
      const includeArchived = args.includeArchived === true;
      const includeQueueHints = args.includeQueueHints === true;
      const confidenceTierFilter =
        typeof args.confidenceTier === "string" && args.confidenceTier.trim().length > 0
          ? args.confidenceTier.trim()
          : undefined;
      const blockedReasonCategoryFilter =
        typeof args.blockedReasonCategory === "string" && args.blockedReasonCategory.trim().length > 0
          ? args.blockedReasonCategory.trim()
          : undefined;
      const featuresFilterRaw = args.features;
      const featuresFilter =
        typeof featuresFilterRaw === "string"
          ? [featuresFilterRaw.trim()].filter((s) => s.length > 0)
          : Array.isArray(featuresFilterRaw)
            ? featuresFilterRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
            : [];

      let tasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
      if (statusFilter) {
        tasks = tasks.filter((t) => t.status === statusFilter);
      }
      if (phaseFilter) {
        tasks = tasks.filter((t) => t.phase === phaseFilter);
      }
      if (phaseKeyFilter) {
        tasks = tasks.filter((t) => inferTaskPhaseKey(t) === phaseKeyFilter);
      }
      if (typeFilter) {
        tasks = tasks.filter((t) => t.type === typeFilter);
      }
      if (categoryFilter) {
        tasks = tasks.filter((t) => readMetadataPath(t.metadata, "category") === categoryFilter);
      }
      if (tagsFilter.length > 0) {
        tasks = tasks.filter((t) => {
          const tags = readMetadataPath(t.metadata, "tags");
          if (!Array.isArray(tags)) {
            return false;
          }
          const normalized = tags.filter((entry): entry is string => typeof entry === "string");
          return tagsFilter.every((tag) => normalized.includes(tag));
        });
      }
      if (metadataFilters.length > 0) {
        tasks = tasks.filter((t) =>
          metadataFilters.every(([path, expected]) => readMetadataPath(t.metadata, path) === expected)
        );
      }
      if (confidenceTierFilter) {
        tasks = tasks.filter(
          (t) => readMetadataPath(t.metadata, "confidenceTier") === confidenceTierFilter
        );
      }
      if (blockedReasonCategoryFilter) {
        tasks = tasks.filter(
          (t) => readMetadataPath(t.metadata, "blockedReasonCategory") === blockedReasonCategoryFilter
        );
      }
      if (featuresFilter.length > 0) {
        tasks = tasks.filter((t) => {
          const tf = t.features ?? [];
          return featuresFilter.some((slug) => tf.includes(slug));
        });
      }
      const featureIdSingle =
        typeof args.featureId === "string" && args.featureId.trim().length > 0 ? args.featureId.trim() : undefined;
      const componentIdFilter =
        typeof args.componentId === "string" && args.componentId.trim().length > 0
          ? args.componentId.trim()
          : undefined;
      if (featureIdSingle) {
        tasks = tasks.filter((t) => (t.features ?? []).includes(featureIdSingle));
      }
      if (componentIdFilter) {
        const ldb = planning.sqliteDual.getDatabase();
        if (!featureRegistryActiveOnConnection(ldb)) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "list-tasks componentId filter requires kit SQLite user_version >= 5 (feature registry)"
          };
        }
        const compFeatIds = new Set(listFeatureIdsForComponent(ldb, componentIdFilter));
        tasks = tasks.filter((t) => (t.features ?? []).some((f) => compFeatIds.has(f)));
      }

      const data: Record<string, unknown> = {
        tasks,
        count: tasks.length,
        scope: "tasks-only"
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      if (includeQueueHints) {
        const hintBaseTasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
        const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
        data.queueHintRows = buildQueueHintsForTasks({
          tasks: hintBaseTasks,
          effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
          workspaceStatus,
          taskRows: tasks
        });
      }

      return {
        ok: true,
        code: "tasks-listed",
        message: `Found ${tasks.length} tasks`,
        data
      };
    }

    if (command.name === "get-ready-queue") {
      const ns = readQueueNamespaceArg(args);
      let tasks = store.getActiveTasks();
      if (ns) {
        tasks = filterTasksByQueueNamespace(tasks, ns);
      }
      const ready = tasks
        .filter((t) => t.status === "ready" && !isWishlistIntakeTask(t))
        .sort((a, b) => {
          const pa = a.priority ?? "P9";
          const pb = b.priority ?? "P9";
          return pa.localeCompare(pb);
        });

      const rqData: Record<string, unknown> = {
        tasks: ready,
        count: ready.length,
        scope: "tasks-only",
        queueNamespace: ns ?? null
      };
      attachPolicyMeta(rqData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "ready-queue-retrieved",
        message: `${ready.length} tasks in ready queue`,
        data: rqData
      };
    }

    if (command.name === "get-next-actions") {
      const tasks = store.getActiveTasks();
      const ns = readQueueNamespaceArg(args);
      const suggestion = getNextActions(tasks, ns ? { queueNamespace: ns } : undefined);
      const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
      const teamExecutionContext = summarizeTeamAssignmentsForNextActions(
        planning.sqliteDual.getDatabase(),
        (id) => taskTitleById.get(id) ?? null
      );

      const naData: Record<string, unknown> = {
        ...suggestion,
        teamExecutionContext,
        scope: "tasks-only",
        queueNamespace: ns ?? null
      };
      attachPolicyMeta(naData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "next-actions-retrieved",
        message: suggestion.suggestedNext
          ? `Suggested next: ${suggestion.suggestedNext.id} — ${suggestion.suggestedNext.title}`
          : "No tasks in ready queue",
        data: naData
      };
    }

    if (command.name === "explain-task-engine-model") {
      const allStatuses: TaskStatus[] = [
        "research",
        "proposed",
        "ready",
        "in_progress",
        "blocked",
        "completed",
        "cancelled"
      ];
      const lifecycle = allStatuses.map((status) => ({
        status,
        allowedActions: getAllowedTransitionsFrom(status).map((entry) => ({
          action: entry.action,
          targetStatus: entry.to
        }))
      }));
      return {
        ok: true,
        code: "task-engine-model-explained",
        message: "Task Engine model variants, planning boundary, and lifecycle transitions.",
        data: {
          modelVersion: 1 as const,
          variants: [
            {
              variant: "execution-task",
              idPattern: "^T[0-9]+$",
              appearsInExecutionPlanning: true,
              requiredFields: ["id", "title", "type", "status", "createdAt", "updatedAt"],
              optionalFields: [
                "priority",
                "dependsOn",
                "unblocks",
                "phase",
                "phaseKey",
                "metadata",
                "metadata.queueNamespace",
                "metadata.implementationEstimatePack",
                "ownership",
                "approach",
                "summary",
                "description",
                "risk",
                "technicalScope",
                "acceptanceCriteria",
                "features",
                "metadata.skillIds"
              ]
            },
            {
              variant: "wishlist-intake-task",
              idPattern: "^T[0-9]+$",
              taskType: WISHLIST_INTAKE_TASK_TYPE,
              appearsInExecutionPlanning: false,
              requiredFields: [
                "id",
                "title",
                "type",
                "status",
                "createdAt",
                "updatedAt",
                "metadata.problemStatement",
                "metadata.expectedOutcome",
                "metadata.impact",
                "metadata.constraints",
                "metadata.successSignals",
                "metadata.requestor",
                "metadata.evidenceRef"
              ],
              optionalFields: [
                "metadata.legacyWishlistId",
                "metadata",
                "priority",
                "dependsOn",
                "unblocks"
              ],
              notes:
                "Ideation backlog uses type wishlist_intake (T ids); optional metadata.legacyWishlistId preserves W### provenance after migration. Excluded from ready-queue suggestions."
            }
          ],
          planningBoundary: {
            executionQueues: "tasks-only",
            wishlistScope: "task-backed-wishlist-intake"
          },
          executionTaskLifecycle: lifecycle
        } as unknown as Record<string, unknown>
      };
    }

    if (command.name === "get-task-summary") {
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      return {
        ok: true,
        code: "task-summary",
        data: {
          scope: "tasks-only",
          stateSummary: suggestion.stateSummary,
          readyQueueCount: suggestion.readyQueue.length,
          suggestedNext: suggestion.suggestedNext
            ? {
                id: suggestion.suggestedNext.id,
                title: suggestion.suggestedNext.title,
                priority: suggestion.suggestedNext.priority ?? null
              }
            : null
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-blocked-summary") {
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      return {
        ok: true,
        code: "blocked-summary",
        data: {
          blockedCount: suggestion.blockingAnalysis.length,
          blockedItems: suggestion.blockingAnalysis,
          scope: "tasks-only"
        } as Record<string, unknown>
      };
    }

    const wishlistResult = runWishlistStoreCommand(
      command.name,
      args as Record<string, unknown>,
      ctx,
      store,
      planning
    );
    if (wishlistResult !== undefined) {
      if (wishlistResult.ok && wishlistResult.data && typeof wishlistResult.data === "object") {
        attachPolicyMeta(
          wishlistResult.data as Record<string, unknown>,
          ctx,
          planning.sqliteDual.getPlanningGeneration()
        );
      }
      return wishlistResult;
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Task Engine does not support command '${command.name}'`
    };
  }
};
