import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { getPlanningGenerationPolicy } from "../task-engine/planning-config.js";
import { isReviewItemQueueCandidate } from "../task-engine/suggestions.js";
import type { TaskEntity } from "../task-engine/types.js";

function summarizeForQueue(t: TaskEntity) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    phase: t.phase,
    phaseKey: t.phaseKey ?? null,
    priority: t.priority ?? null
  };
}

export async function runListApprovalQueue(ctx: ModuleLifecycleContext): Promise<{
  ok: true;
  code: string;
  message: string;
  data: Record<string, unknown>;
}> {
  const planning = await openPlanningStores(ctx);
  const tasks = planning.taskStore
    .getActiveTasks()
    .filter((t) => isReviewItemQueueCandidate(t))
    .sort((a, b) => {
      const pa = a.priority ?? "P9";
      const pb = b.priority ?? "P9";
      return pa.localeCompare(pb);
    });

  const data: Record<string, unknown> = {
    schemaVersion: 1,
    reviewItemQueue: tasks.map(summarizeForQueue),
    count: tasks.length,
    operatorHints: {
      reviewItemExample:
        'pnpm exec wk run review-item \'{"taskId":"<id>","decision":"accept","policyApproval":{"confirmed":true,"rationale":"recorded decision after review"}}\'',
      triageProposedImprovements:
        'pnpm exec wk run list-tasks \'{"type":"improvement","status":"proposed"}\'',
      improvementTriagePlaybook: ".ai/playbooks/improvement-triage-top-three.md",
      policyArtifacts: [
        {
          relativePath: "kit_policy_traces (SQLite)",
          role: "Policy checks for sensitive workspace-kit run commands (legacy traces.jsonl import-only)."
        },
        {
          relativePath: "list-session-grants",
          role: "Session-scoped policy grants in kit_session_grants (SQLite); run workspace-kit run list-session-grants."
        },
        {
          relativePath: "kit_approval_decisions (SQLite)",
          role: "Immutable review-item decision records after maintainer action (legacy decisions.jsonl imported once)."
        }
      ],
      dashboardSummary:
        "pnpm exec wk run dashboard-summary '{}' — proposedImprovementsSummary, readyImprovementsSummary, workspaceStatus.pendingDecisions (maintainer YAML)."
    },
    planningGeneration: planning.sqliteDual.getPlanningGeneration(),
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    })
  };

  return {
    ok: true,
    code: "approval-queue-listed",
    message: `${tasks.length} improvement task(s) in ready or in_progress (review-item queue)`,
    data
  };
}
