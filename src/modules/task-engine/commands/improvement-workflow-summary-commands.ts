import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import { isImprovementLikeTask } from "../suggestions.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import type { TaskEntity } from "../types.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import { buildFeatureEnrichmentBySlug } from "../persistence/feature-registry-queries.js";
import { buildDashboardApprovalQueueSummary } from "../dashboard/build-dashboard-approval-queue.js";
import { readLineageEvents } from "../../../core/lineage-store.js";

type WorkflowEntryPoint = {
  command: string;
  description: string;
  sampleArgv: string;
};

function slimTaskRow(task: TaskEntity) {
  return {
    id: task.id,
    status: task.status,
    type: task.type,
    title: task.title,
    phaseKey: task.phaseKey ?? null
  };
}

function privacySafeSummary(task: TaskEntity): string {
  const title = task.title?.trim() || task.id;
  const issue =
    task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>).issue
      : undefined;
  const issueSnippet =
    typeof issue === "string" && issue.trim().length > 0
      ? issue.trim().slice(0, 120) + (issue.trim().length > 120 ? "…" : "")
      : null;
  return issueSnippet ? `${title} — ${issueSnippet}` : title;
}

export async function buildImprovementWorkflowSummary(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const enrich = buildFeatureEnrichmentBySlug(planning.sqliteDual.getDatabase());

  const transcriptChurnResearch = tasks.filter(
    (t) => t.type === TRANSCRIPT_CHURN_TASK_TYPE && t.status === "research"
  );
  const proposedImprovements = tasks.filter((t) => t.status === "proposed" && isImprovementLikeTask(t));
  const readyImprovements = tasks.filter((t) => t.status === "ready" && isImprovementLikeTask(t));

  const entryPoints: WorkflowEntryPoint[] = [
    {
      command: "transcript:sync",
      description: "Sync transcript files into the workspace (package script wrapper).",
      sampleArgv: "pnpm run transcript:sync"
    },
    {
      command: "ingest-transcripts",
      description: "Ingest synced transcripts into improvement signals (policy-gated).",
      sampleArgv:
        'pnpm exec wk run ingest-transcripts \'{"policyApproval":{"confirmed":true,"rationale":"operator ingest"}}\''
    },
    {
      command: "generate-recommendations",
      description: "Scout friction and create proposed improvements / transcript_churn research rows.",
      sampleArgv:
        'pnpm exec wk run generate-recommendations \'{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"scout preview"}}\''
    },
    {
      command: "synthesize-transcript-churn",
      description: "Promote investigated transcript_churn/research rows to improvement/proposed.",
      sampleArgv:
        'pnpm exec wk run synthesize-transcript-churn \'{"taskId":"T###","policyApproval":{"confirmed":true,"rationale":"synthesis"}}\''
    },
    {
      command: "improvement-dedupe-explain",
      description: "Compare a proposed item against similar tasks before accept/reject.",
      sampleArgv: 'pnpm exec wk run improvement-dedupe-explain \'{"taskId":"T###"}\''
    },
    {
      command: "list-approval-queue",
      description: "Human review queue for improvement decisions.",
      sampleArgv: "pnpm exec wk run list-approval-queue '{}'"
    },
    {
      command: "dashboard-summary",
      description: "Full maintainer dashboard including improvement summaries.",
      sampleArgv: "pnpm exec wk run dashboard-summary '{}'"
    }
  ];

  const lineageEvents = await readLineageEvents(ctx.workspacePath);
  const recentLineage = lineageEvents
    .slice(-20)
    .reverse()
    .map((e) => {
      const p = e.payload as { recommendationTaskId?: string; evidenceKey?: string };
      return {
        eventType: e.eventType,
        timestamp: e.timestamp,
        recommendationTaskId: p.recommendationTaskId ?? null,
        evidenceKey: p.evidenceKey ?? null
      };
    });

  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);
  const nextSteps: string[] = [];
  if (transcriptChurnResearch.length > 0) {
    nextSteps.push(
      `${transcriptChurnResearch.length} transcript_churn/research row(s) — run synthesize-transcript-churn or review in dashboard-summary.`
    );
  }
  if (proposedImprovements.length > 0) {
    nextSteps.push(
      `${proposedImprovements.length} proposed improvement(s) — run improvement-dedupe-explain then accept-improvement / reject-improvement.`
    );
  }
  if (readyImprovements.length > 0) {
    nextSteps.push(`${readyImprovements.length} ready improvement(s) — delivery via normal task branch flow.`);
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Pipeline idle — run transcript:sync → ingest-transcripts → generate-recommendations to seed new work.");
  }

  const data: Record<string, unknown> = {
    schemaVersion: 1,
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    transcriptPipeline: {
      status:
        transcriptChurnResearch.length > 0
          ? "pending-research"
          : proposedImprovements.length > 0
            ? "candidates-ready"
            : "idle",
      researchCount: transcriptChurnResearch.length,
      researchTop: transcriptChurnResearch.slice(0, 10).map((t) => ({
        ...slimTaskRow(t),
        summary: privacySafeSummary(t)
      }))
    },
    improvements: {
      proposedCount: proposedImprovements.length,
      readyCount: readyImprovements.length,
      proposedTop: proposedImprovements.slice(0, 10).map((t) => projectDashboardTaskRow(t, enrich)),
      readyTop: readyImprovements.slice(0, 10).map((t) => projectDashboardTaskRow(t, enrich))
    },
    approvalQueue,
    lineage: {
      totalEvents: lineageEvents.length,
      recent: recentLineage
    },
    entryPoints,
    suggestedNextSteps: nextSteps,
    remediation: {
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.improvementWorkflowSummary,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  };
  attachPolicyMeta(data, ctx, planningGeneration);

  return {
    ok: true,
    code: "improvement-workflow-summary",
    message: `Improvement workflow summary (research=${transcriptChurnResearch.length}, proposed=${proposedImprovements.length})`,
    data
  };
}
