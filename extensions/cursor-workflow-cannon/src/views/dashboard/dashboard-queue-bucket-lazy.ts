/**
 * Lazy queue phase-bucket loading (T100397) — list-tasks argv + row HTML by category.
 */

import {
  escapeHtml,
  escapeHtmlAttr,
  lazyQueueBucketListLimit,
  renderDashboardQueueTaskRowsHtml
} from "./render-dashboard.js";

export type DashboardQueueBucketCategory =
  | "ready"
  | "proposed-improvement"
  | "proposed-execution"
  | "transcript-churn"
  | "blocked"
  | "completed"
  | "cancelled";

const TRANSCRIPT_CHURN_TYPE = "transcript_churn";

export function buildListTasksArgsForQueueBucket(
  category: DashboardQueueBucketCategory,
  phaseKeyArg: string,
  limit: number,
  cursor?: string
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    phaseKey: phaseKeyArg,
    limit
  };
  if (cursor && cursor.trim().length > 0) {
    args.cursor = cursor.trim();
  }
  switch (category) {
    case "ready":
      args.status = "ready";
      break;
    case "proposed-improvement":
      args.status = "proposed";
      args.type = "improvement";
      break;
    case "proposed-execution":
      args.status = "proposed";
      break;
    case "transcript-churn":
      args.status = "research";
      args.type = TRANSCRIPT_CHURN_TYPE;
      break;
    case "blocked":
      args.status = "blocked";
      break;
    case "completed":
      args.status = "completed";
      break;
    case "cancelled":
      args.status = "cancelled";
      break;
    default:
      break;
  }
  return args;
}

function isWishlistIntakeRow(task: Record<string, unknown>): boolean {
  const type = typeof task.type === "string" ? task.type : "";
  if (type === "wishlist_intake") {
    return true;
  }
  const id = typeof task.id === "string" ? task.id : "";
  return /^W\d+$/i.test(id);
}

function isImprovementLikeRow(task: Record<string, unknown>): boolean {
  const type = typeof task.type === "string" ? task.type : "";
  if (type === "improvement") {
    return true;
  }
  const id = typeof task.id === "string" ? task.id : "";
  return id.startsWith("imp-");
}

export function filterTasksForQueueBucketCategory(
  category: DashboardQueueBucketCategory,
  tasks: unknown[]
): unknown[] {
  if (category !== "proposed-execution") {
    return tasks;
  }
  return tasks.filter((raw) => {
    if (!raw || typeof raw !== "object") {
      return false;
    }
    const task = raw as Record<string, unknown>;
    return !isImprovementLikeRow(task) && !isWishlistIntakeRow(task);
  });
}

function renderProposedImprovementRows(tasks: unknown[]): string {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="muted">No proposed improvements in this phase.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    tasks
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; phase?: unknown };
        const id = String(row?.id ?? "").trim();
        const title = escapeHtml(String(row?.title ?? ""));
        const ph =
          row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
        const idAttr = escapeHtml(id);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          escapeHtml(id) +
          (id ? " " : "") +
          title +
          ph +
          "</span>" +
          '<span class="dash-row-actions wc-task-actions dash-row-actions-grid">' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-success" data-wc-action="proposed-imp-accept" data-task-id="' +
          idAttr +
          '">Accept</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-wc-action="proposed-imp-decline" data-task-id="' +
          idAttr +
          '">Decline</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
          idAttr +
          '">View</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderProposedExecutionRows(tasks: unknown[]): string {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="muted">No proposed execution tasks in this phase.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    tasks
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; summary?: unknown };
        const id = String(row?.id ?? "").trim();
        const idAttr = escapeHtml(id);
        const summary = escapeHtml(String(row?.summary ?? row?.title ?? ""));
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label dash-task-row-body">' +
          '<span class="dash-task-row-line">' +
          '<span class="dash-task-row-id">' +
          idAttr +
          "</span>" +
          '<span class="dash-task-row-summary">' +
          summary +
          "</span></span></span>" +
          '<span class="dash-row-actions wc-task-actions dash-row-actions-grid">' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-success" data-wc-action="proposed-exe-accept" data-task-id="' +
          idAttr +
          '">Accept</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-wc-action="proposed-exe-decline" data-task-id="' +
          idAttr +
          '">Decline</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
          idAttr +
          '">View</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderTranscriptChurnRows(tasks: unknown[]): string {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="muted">No transcript churn rows in this phase.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    tasks
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; phase?: unknown };
        const id = String(row?.id ?? "").trim();
        const idAttr = escapeHtml(id);
        const title = escapeHtml(String(row?.title ?? ""));
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          idAttr +
          (id ? " " : "") +
          title +
          "</span>" +
          '<span class="dash-row-actions">' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
          idAttr +
          '">View</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="transcript-churn-research-chat" data-task-id="' +
          idAttr +
          '">Research</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderBlockedTaskRows(tasks: unknown[]): string {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="muted">No blocked tasks in this phase.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    tasks
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown };
        const id = String(row?.id ?? "").trim();
        const idAttr = escapeHtml(id);
        const title = escapeHtml(String(row?.title ?? ""));
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          idAttr +
          (id ? " " : "") +
          title +
          "</span>" +
          '<span class="dash-row-actions wc-task-actions dash-row-actions-grid">' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
          idAttr +
          '">View Task</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-info" data-wc-action="assign-phase" data-task-id="' +
          idAttr +
          '">Assign Phase</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

export function renderQueueBucketRowsHtml(
  category: DashboardQueueBucketCategory,
  tasks: unknown[],
  options?: { nextCursor?: string | null; bucketCount?: number }
): string {
  const filtered = filterTasksForQueueBucketCategory(category, tasks);
  let rowsHtml: string;
  switch (category) {
    case "ready":
    case "completed":
    case "cancelled":
      rowsHtml = renderDashboardQueueTaskRowsHtml(filtered);
      break;
    case "proposed-improvement":
      rowsHtml = renderProposedImprovementRows(filtered);
      break;
    case "proposed-execution":
      rowsHtml = renderProposedExecutionRows(filtered);
      break;
    case "transcript-churn":
      rowsHtml = renderTranscriptChurnRows(filtered);
      break;
    case "blocked":
      rowsHtml = renderBlockedTaskRows(filtered);
      break;
    default:
      rowsHtml = renderDashboardQueueTaskRowsHtml(filtered);
  }
  const nextCursor = options?.nextCursor;
  if (nextCursor && nextCursor.length > 0) {
    rowsHtml +=
      '<div class="wc-lazy-bucket-more">' +
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="queue-bucket-load-more" data-wc-queue-category="' +
      escapeHtmlAttr(category) +
      '" data-wc-queue-cursor="' +
      escapeHtmlAttr(nextCursor) +
      '">Load more</button></div>';
  }
  return rowsHtml;
}

export function queueBucketListLimit(): number {
  return lazyQueueBucketListLimit();
}
