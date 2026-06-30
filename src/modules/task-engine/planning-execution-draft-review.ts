import type { TaskEntity } from "./types.js";

/** UX/CAE batch gap review shared by `review-planning-execution-drafts` and finalize preview. */
export function reviewPlanningExecutionDraftGaps(
  tasks: TaskEntity[]
): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  const textFor = (task: TaskEntity): string =>
    [
      task.title,
      task.summary,
      task.description,
      task.approach,
      ...(task.technicalScope ?? []),
      ...(task.acceptanceCriteria ?? [])
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n")
      .toLowerCase();
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
    const vagueCriteria = (task.acceptanceCriteria ?? []).filter(
      (c) => c.trim().length < 15 || /^(works|done|complete)$/i.test(c.trim())
    );
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
