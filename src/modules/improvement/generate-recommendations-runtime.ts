import { randomUUID } from "node:crypto";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores, type TaskEntity } from "../../core/planning/index.js";
import { appendLineageEvent } from "../../core/lineage-store.js";
import { loadImprovementState, saveImprovementState } from "./improvement-state.js";
import {
  ingestAgentTranscripts,
  ingestConfigMutations,
  ingestGitDiffBetweenTags,
  ingestPolicyDenials,
  ingestTaskTransitionFriction,
  type IngestCandidate
} from "./ingest.js";
import { priorityForTier } from "./confidence.js";
import { buildImprovementTaskPayload } from "./improvement-task-payload.js";
import { buildImprovementSupportingReasoning } from "./improvement-supporting-reasoning.js";
import { allocateNextTaskNumericId } from "../task-engine/wishlist/wishlist-intake.js";
import { planningConcurrencySaveOpts } from "../task-engine/mutation-utils.js";
import { enforcePlanningGenerationPolicy, getPlanningGenerationPolicy } from "../task-engine/planning-config.js";
import { TaskEngineError } from "../task-engine/transitions.js";

function hasEvidenceKey(tasks: TaskEntity[], key: string): boolean {
  return tasks.some((t) => {
    const m = t.metadata;
    if (!m || typeof m !== "object") return false;
    return (m as Record<string, unknown>).evidenceKey === key;
  });
}

function resolveTranscriptArchivePath(
  ctx: ModuleLifecycleContext,
  args: GenerateRecommendationsArgs
): string {
  if (typeof args.transcriptsRoot === "string" && args.transcriptsRoot.trim().length > 0) {
    return args.transcriptsRoot.trim();
  }
  const improvement =
    ctx.effectiveConfig?.improvement && typeof ctx.effectiveConfig.improvement === "object"
      ? (ctx.effectiveConfig.improvement as Record<string, unknown>)
      : {};
  const transcripts =
    improvement.transcripts && typeof improvement.transcripts === "object"
      ? (improvement.transcripts as Record<string, unknown>)
      : {};
  const archivePath =
    typeof transcripts.archivePath === "string" ? transcripts.archivePath.trim() : "";
  return archivePath || "agent-transcripts";
}

export function getMaxRecommendationCandidatesPerRun(ctx: ModuleLifecycleContext): number {
  const improvement =
    ctx.effectiveConfig?.improvement && typeof ctx.effectiveConfig.improvement === "object"
      ? (ctx.effectiveConfig.improvement as Record<string, unknown>)
      : {};
  const cadence =
    improvement.cadence && typeof improvement.cadence === "object"
      ? (improvement.cadence as Record<string, unknown>)
      : {};
  const raw = cadence.maxRecommendationCandidatesPerRun;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  return 500;
}

export type GenerateRecommendationsArgs = {
  /** Directory relative to workspace containing agent `*.jsonl` transcripts (default: agent-transcripts). */
  transcriptsRoot?: string;
  /** When both set with toTag, run git diff evidence between tags. */
  fromTag?: string;
  toTag?: string;
  /** When true, compute candidates and simulate creates without persisting tasks, lineage, or improvement state. */
  dryRun?: boolean;
  /** When tasks.planningGenerationPolicy is require, must match current planning row before persist. */
  expectedPlanningGeneration?: number;
};

export async function runGenerateRecommendations(
  ctx: ModuleLifecycleContext,
  args: GenerateRecommendationsArgs
): Promise<{
  runId: string;
  created: string[];
  skipped: number;
  candidates: number;
  dryRun?: boolean;
  simulatedCreates?: string[];
  dedupe: {
    skippedDuplicateEvidenceKey: number;
    skippedExistingTaskId: number;
    cappedRemaining: number;
  };
}> {
  const dryRun = args.dryRun === true;
  const runId = randomUUID();
  const planning = await openPlanningStores(ctx);
  const store = planning.taskStore;

  const state = await loadImprovementState(ctx.workspacePath, ctx.effectiveConfig as Record<string, unknown> | undefined);
  const transcriptsRoot = resolveTranscriptArchivePath(ctx, args);
  const fromTag = typeof args.fromTag === "string" ? args.fromTag.trim() : undefined;
  const toTag = typeof args.toTag === "string" ? args.toTag.trim() : undefined;

  const candidates: IngestCandidate[] = [];

  candidates.push(...(await ingestAgentTranscripts(ctx.workspacePath, transcriptsRoot, state)));
  candidates.push(...(await ingestPolicyDenials(ctx.workspacePath, state)));
  candidates.push(...(await ingestConfigMutations(ctx.workspacePath, state)));
  candidates.push(...ingestTaskTransitionFriction(store.getTransitionLog(), state));

  if (fromTag && toTag) {
    const g = ingestGitDiffBetweenTags(ctx.workspacePath, fromTag, toTag);
    if (g) candidates.push(g);
  }

  const allTasks = store.getAllTasks();
  const created: string[] = [];
  const simulatedCreates: string[] = [];
  let skippedDuplicateEvidenceKey = 0;
  /** Retained for JSON shape compatibility; numeric **T###** allocation makes collisions extremely unlikely. */
  let skippedExistingTaskId = 0;
  let cappedRemaining = 0;

  const now = new Date().toISOString();
  const maxCreates = getMaxRecommendationCandidatesPerRun(ctx);
  const shadowTasksForDryRun = dryRun ? [...allTasks] : null;

  for (const c of candidates) {
    if (hasEvidenceKey(allTasks, c.evidenceKey)) {
      skippedDuplicateEvidenceKey += 1;
      continue;
    }

    const wouldCount = dryRun ? simulatedCreates.length : created.length;
    if (wouldCount >= maxCreates) {
      cappedRemaining += 1;
      continue;
    }

    if (dryRun) {
      const id = allocateNextTaskNumericId(shadowTasksForDryRun!);
      shadowTasksForDryRun!.push({
        id,
        status: "proposed",
        type: "improvement",
        title: "",
        createdAt: now,
        updatedAt: now
      });
      simulatedCreates.push(id);
      continue;
    }

    const id = allocateNextTaskNumericId(allTasks);
    if (store.getTask(id)) {
      skippedExistingTaskId += 1;
      continue;
    }

    const body = buildImprovementTaskPayload(c);
    const supportingReasoning = buildImprovementSupportingReasoning(c);
    const meta: Record<string, unknown> = {
      evidenceKey: c.evidenceKey,
      evidenceKind: c.evidenceKind,
      confidence: c.confidence.score,
      confidenceTier: c.confidence.tier,
      confidenceReasons: c.confidence.reasons,
      provenanceRefs: c.provenanceRefs,
      issue: body.issue,
      supportingReasoning,
      proposedSolutions: [body.proposedSolution]
    };
    if (c.evidenceKind === "transcript" && typeof c.provenanceRefs.transcriptPath === "string") {
      meta.transcriptSourceRelPath = c.provenanceRefs.transcriptPath;
    }

    const task: TaskEntity = {
      id,
      status: "ready",
      type: "improvement",
      title: body.title,
      createdAt: now,
      updatedAt: now,
      priority: priorityForTier(c.confidence.tier),
      approach: body.approach,
      technicalScope: body.technicalScope,
      acceptanceCriteria: body.acceptanceCriteria,
      metadata: meta
    };

    store.addTask(task);
    allTasks.push(task);
    created.push(id);

    await appendLineageEvent(ctx.workspacePath, {
      eventType: "rec",
      recommendationTaskId: id,
      evidenceKey: c.evidenceKey,
      payload: {
        recommendationTaskId: id,
        evidenceKey: c.evidenceKey,
        title: body.title,
        issue: body.issue,
        proposedSolution: body.proposedSolution,
        confidence: c.confidence.score,
        confidenceTier: c.confidence.tier,
        provenanceRefs: c.provenanceRefs
      }
    });
  }

  if (!dryRun) {
    const grGate = enforcePlanningGenerationPolicy(
      getPlanningGenerationPolicy({
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
      }),
      args as Record<string, unknown>
    );
    if (!grGate.ok) {
      throw new TaskEngineError(grGate.code, grGate.message);
    }
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
    await saveImprovementState(ctx.workspacePath, state, ctx.effectiveConfig as Record<string, unknown> | undefined);
  }

  const skipped = skippedDuplicateEvidenceKey + skippedExistingTaskId;
  return {
    runId,
    created,
    skipped,
    candidates: candidates.length,
    ...(dryRun ? { dryRun: true as const, simulatedCreates } : {}),
    dedupe: {
      skippedDuplicateEvidenceKey,
      skippedExistingTaskId,
      cappedRemaining
    }
  };
}
