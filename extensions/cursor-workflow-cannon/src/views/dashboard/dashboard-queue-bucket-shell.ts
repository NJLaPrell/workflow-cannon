/**
 * Minimal lazy queue phase-bucket `<details>` shell for targeted DOM patches
 * when the host summary gains a new non-empty phase bucket.
 */

import type { DashboardQueueBucketCategory } from "./dashboard-queue-bucket-lazy.js";
import { escapeHtml, escapeHtmlAttr } from "./render-dashboard.js";

const BUCKET_TRACK_PREFIX: Record<DashboardQueueBucketCategory, string> = {
  ready: "rdy",
  "proposed-improvement": "prop-imp",
  "proposed-execution": "prop-exe",
  blocked: "blk",
  "transcript-churn": "tc-churn",
  completed: "term-comp",
  cancelled: "term-can"
};

function phaseKeyForDom(phaseKey: string | null): string {
  return phaseKey ?? "";
}

function phaseBucketFilterAttr(phaseKey: string | null): string {
  if (phaseKey == null || phaseKey.trim().length === 0) {
    return ' data-wc-phase-bucket="__no_phase__"';
  }
  return ` data-wc-phase-bucket="${escapeHtmlAttr(phaseKey.trim())}"`;
}

function bucketSummaryLabelHtml(phaseKey: string | null, count: number): string {
  if (phaseKey != null && phaseKey.trim().length > 0) {
    return (
      '<span class="phase-bucket-summary-label">' +
      '<span class="phase-bucket-summary-phase">Phase <code>' +
      escapeHtml(phaseKey.trim()) +
      "</code></span> " +
      '<span class="phase-bucket-summary-count">(' +
      String(count) +
      ")</span></span>"
    );
  }
  return (
    '<span class="phase-bucket-summary-label">' +
    '<span class="phase-bucket-summary-phase">Not phased</span> ' +
    '<span class="phase-bucket-summary-count">(' +
    String(count) +
    ")</span></span>"
  );
}

export function buildLazyQueueBucketShellHtml(args: {
  category: DashboardQueueBucketCategory;
  phaseKey: string | null;
  count: number;
  taskIds: string[];
  /** When set, bucket body is pre-loaded (skip lazy fetch on first expand). */
  preloadRowHtml?: string;
  /** Open the new bucket so the first task is discoverable without hunting. */
  openByDefault?: boolean;
}): string {
  const pkDom = phaseKeyForDom(args.phaseKey);
  const trackSafe = (BUCKET_TRACK_PREFIX[args.category] + "-phase-" + (pkDom.trim() || "no-phase"))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  const sortedIds = args.taskIds.length > 0 ? [...args.taskIds].sort() : [];
  const taskIdsAttr =
    sortedIds.length > 0
      ? ` data-wc-bucket-task-ids="${escapeHtmlAttr(sortedIds.join(","))}"`
      : "";
  const preload = (args.preloadRowHtml ?? "").trim();
  const bodyInner =
    preload.length > 0
      ? `<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="1">${preload}</div>`
      : '<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="0">' +
        '<p class="muted wc-lazy-bucket-hint" role="status">Expand to load tasks…</p></div>';
  const openAttr = args.openByDefault !== false ? " open" : "";
  return (
    `<details class="phase-bucket wc-lazy-queue-bucket"${openAttr}` +
    ` data-wc-queue-category="${escapeHtmlAttr(args.category)}"` +
    ` data-wc-phase-key="${escapeHtmlAttr(pkDom)}"` +
    ` data-wc-bucket-count="${escapeHtmlAttr(String(args.count))}"` +
    taskIdsAttr +
    phaseBucketFilterAttr(args.phaseKey) +
    ` data-wc-track="${escapeHtmlAttr(trackSafe)}"` +
    ` data-wc-ui-state-key="${escapeHtmlAttr(trackSafe)}">` +
    `<summary class="phase-bucket-summary">${bucketSummaryLabelHtml(args.phaseKey, args.count)}</summary>` +
    bodyInner +
    "</details>"
  );
}
