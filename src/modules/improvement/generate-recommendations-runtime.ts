import { randomUUID } from "node:crypto";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { TaskEntity } from "../task-engine/types.js";
import { TaskStore } from "../task-engine/store.js";
import { appendLineageEvent } from "../../core/lineage-store.js";
import { loadImprovementState, saveImprovementState } from "./improvement-state.js";
import {
  ingestAgentTranscripts,
  ingestConfigMutations,
  ingestGitDiffBetweenTags,
  ingestPolicyDenials,
  ingestTaskTransitionFriction,
  taskIdForEvidenceKey,
  type IngestCandidate
} from "./ingest.js";
import { priorityForTier } from "./confidence.js";

function taskStoreRelativePath(ctx: ModuleLifecycleContext): string | undefined {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return undefined;
  }
  const p = (tasks as Record<string, unknown>).storeRelativePath;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : undefined;
}

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
};

export async function runGenerateRecommendations(
  ctx: ModuleLifecycleContext,
  args: GenerateRecommendationsArgs
): Promise<{
  runId: string;
  created: string[];
  skipped: number;
  candidates: number;
  dedupe: {
    skippedDuplicateEvidenceKey: number;
    skippedExistingTaskId: number;
    cappedRemaining: number;
  };
}> {
  const runId = randomUUID();
  const store = new TaskStore(ctx.workspacePath, taskStoreRelativePath(ctx));
  await store.load();

  const state = await loadImprovementState(ctx.workspacePath);
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
  let skippedDuplicateEvidenceKey = 0;
  let skippedExistingTaskId = 0;
  let cappedRemaining = 0;

  const now = new Date().toISOString();
  const maxCreates = getMaxRecommendationCandidatesPerRun(ctx);

  for (const c of candidates) {
    if (hasEvidenceKey(allTasks, c.evidenceKey)) {
      skippedDuplicateEvidenceKey += 1;
      continue;
    }

    const id = taskIdForEvidenceKey(c.evidenceKey);
    if (store.getTask(id)) {
      skippedExistingTaskId += 1;
      continue;
    }

    if (created.length >= maxCreates) {
      cappedRemaining += 1;
      continue;
    }

    const task: TaskEntity = {
      id,
      status: "ready",
      type: "improvement",
      title: c.title,
      createdAt: now,
      updatedAt: now,
      priority: priorityForTier(c.confidence.tier),
      metadata: {
        evidenceKey: c.evidenceKey,
        evidenceKind: c.evidenceKind,
        confidence: c.confidence.score,
        confidenceTier: c.confidence.tier,
        confidenceReasons: c.confidence.reasons,
        provenanceRefs: c.provenanceRefs
      }
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
        title: c.title,
        confidence: c.confidence.score,
        confidenceTier: c.confidence.tier,
        provenanceRefs: c.provenanceRefs
      }
    });
  }

  await store.save();
  await saveImprovementState(ctx.workspacePath, state);

  const skipped = skippedDuplicateEvidenceKey + skippedExistingTaskId;
  return {
    runId,
    created,
    skipped,
    candidates: candidates.length,
    dedupe: {
      skippedDuplicateEvidenceKey,
      skippedExistingTaskId,
      cappedRemaining
    }
  };
}
