import type { DashboardApprovalQueueSummary } from "../../../contracts/dashboard-summary-run.js";
import { isImprovementLikeTask } from "../suggestions.js";
import type { TaskEntity } from "../types.js";

function inReviewItemStatuses(status: string): boolean {
  return status === "ready" || status === "in_progress";
}

/** Read-only improvement review queue for dashboard / extension (approvals module). */
export function buildDashboardApprovalQueueSummary(tasks: TaskEntity[]): DashboardApprovalQueueSummary {
  const queue = tasks
    .filter((t) => isImprovementLikeTask(t) && inReviewItemStatuses(t.status))
    .sort((a, b) => {
      const pa = a.priority ?? "P9";
      const pb = b.priority ?? "P9";
      return pa.localeCompare(pb);
    });
  return {
    schemaVersion: 1,
    count: queue.length,
    top: queue.slice(0, 15).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      phaseKey: t.phaseKey ?? null,
      priority: t.priority ?? null
    })),
    policyArtifacts: [
      {
        relativePath: "kit_policy_traces",
        role: "Policy check audit trail for sensitive workspace-kit run commands."
      },
      {
        relativePath: "list-session-grants",
        role: "Session-scoped reuse of JSON policyApproval when scope is session."
      },
      {
        relativePath: "kit_approval_decisions",
        role: "Immutable review-item decision records after maintainer action."
      }
    ]
  };
}
