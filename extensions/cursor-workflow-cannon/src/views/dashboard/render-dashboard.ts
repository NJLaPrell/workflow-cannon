/**
 * Pure dashboard HTML generation — unit-tested; applied in the webview via postMessage { html } from the host.
 */

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute-safe escaping for double-quoted HTML attributes. */
export function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Stable id for preserving `<details open>` when the host replaces `#root` innerHTML (`DashboardViewProvider` wcReplaceRoot). */
function wcTrackAttr(trackId: string): string {
  const safe = trackId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return ' data-wc-track="' + escapeHtml(safe) + '"';
}

/** Escape first, then turn paired `**segments**` into `<b>…</b>` (safe for webview HTML). */
export function renderMarkdownBoldAfterEscape(escapedPlain: string): string {
  return escapedPlain.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

export function renderActiveFocusHtml(raw: string): string {
  return renderMarkdownBoldAfterEscape(escapeHtml(raw));
}

function renderTaskRowList(items: unknown, emptyMessage = "No ready tasks."): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">' + escapeHtml(emptyMessage) + "</p>";
  }
  return (
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; priority?: unknown };
        const id = String(row?.id ?? "").trim();
        const pri = row?.priority ? " [" + escapeHtml(String(row.priority)) + "]" : "";
        const label = "- " + escapeHtml(id) + (id ? " " : "") + escapeHtml(String(row?.title ?? "")) + pri;
        const idAttr = escapeHtml(id);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">' +
          label +
          "</span>" +
          (id.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task view (markdown)">View</button>'
            : "") +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderWishlistOpenList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No Items</p>';
  }
  return (
    '<p class="muted"><b>Open Wishlist Preview</b> · <b>Process</b> runs intake in chat; <b>Decline</b> cancels the backing intake task (<code>reject</code> → cancelled).</p>' +
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; taskId?: unknown };
        const id = String(row?.id ?? "").trim();
        const taskId = String(row?.taskId ?? row?.id ?? "").trim();
        const title = escapeHtml(String(row?.title ?? ""));
        const label = escapeHtml(id) + (id ? " " : "") + title;
        const idAttr = escapeHtml(id);
        const taskIdAttr = escapeHtml(taskId);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          label +
          "</span>" +
          '<span class="dash-row-actions">' +
          '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="wishlist-view" data-wishlist-id="' +
          idAttr +
          '" title="Open full wishlist fields in the editor">View</button>' +
          '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="wishlist-chat" data-wishlist-id="' +
          idAttr +
          '" title="Open wishlist intake flow for this item (prefills Cursor chat)">Process</button>' +
          '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="wishlist-decline" data-task-id="' +
          taskIdAttr +
          '" title="Decline → cancelled (reject on backing wishlist intake task; confirms policy rationale)">Decline</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderProposedImprovementRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
  const id = String(row?.id ?? "").trim();
  const title = escapeHtml(String(row?.title ?? ""));
  const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
  const label = "- " + escapeHtml(id) + (id ? " " : "") + title + ph;
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    '<span class="dash-row-label">' +
    label +
    "</span>" +
    '<span class="dash-row-actions">' +
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="proposed-imp-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="proposed-imp-decline" data-task-id="' +
    idAttr +
    '" title="Decline → cancelled (reject; confirms policy rationale)">Decline</button>' +
    "</span></div>"
  );
}

function renderProposedImprovementsList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">No proposed improvements (<code>type: improvement</code>, <code>status: proposed</code>; legacy <code>imp-*</code> may still appear). Run <code>generate-recommendations</code> / <code>ingest-transcripts</code> or log via <code>create-task</code> per playbook. Confirm: <code>workspace-kit run list-tasks '{}'</code>.</p>`;
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · Tasks sidebar <b>Improvements</b> or <code>list-tasks</code>.</p>"
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> run <code>run-transition</code> (<code>accept</code> / <code>reject</code>; modal rationale + planning token when required).</p>' +
    '<div class="dash-row-list" role="list">' +
    items.map((x) => renderProposedImprovementRow(x as { id?: unknown; title?: unknown; phase?: unknown })).join("") +
    "</div>"
  );
}

function renderTranscriptChurnResearchRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
  const id = String(row?.id ?? "").trim();
  const title = escapeHtml(String(row?.title ?? ""));
  const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
  const label = "- " + escapeHtml(id) + (id ? " " : "") + title + ph;
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    '<span class="dash-row-label">' +
    label +
    "</span>" +
    '<span class="dash-row-actions">' +
    '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
    idAttr +
    '" title="Open task view (markdown)">View</button>' +
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="transcript-churn-research-chat" data-task-id="' +
    idAttr +
    '" title="Open transcript churn research playbook in chat">Research</button>' +
    "</span></div>"
  );
}

function renderTranscriptChurnResearchList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      '<p class="muted">No transcript churn rows (<code>type: transcript_churn</code>, <code>status: research</code>). When they appear, investigate then run <code>synthesize-transcript-churn</code> (see <code>.ai/AGENT-CLI-MAP.md</code>).</p>'
    );
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · <code>list-tasks</code> with filters.</p>"
      : "";
  return (
    more +
    '<div class="dash-row-list" role="list">' +
    (items as unknown[])
      .map((x) => renderTranscriptChurnResearchRow(x as { id?: unknown; title?: unknown; phase?: unknown }))
      .join("") +
    "</div>"
  );
}

function renderProposedExecutionRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
  const id = String(row?.id ?? "").trim();
  const title = escapeHtml(String(row?.title ?? ""));
  const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
  const label = "- " + escapeHtml(id) + (id ? " " : "") + title + ph;
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    '<span class="dash-row-label">' +
    label +
    "</span>" +
    '<span class="dash-row-actions">' +
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="proposed-exe-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="proposed-exe-decline" data-task-id="' +
    idAttr +
    '" title="Decline → cancelled (reject; confirms policy rationale)">Decline</button>' +
    "</span></div>"
  );
}

function renderProposedExecutionList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No proposed execution tasks (<code>status: proposed</code>, not improvement-type, not wishlist).</p>';
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + ".</p>"
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> run <code>run-transition</code> when required.</p>' +
    '<div class="dash-row-list" role="list">' +
    items.map((x) => renderProposedExecutionRow(x as { id?: unknown; title?: unknown; phase?: unknown })).join("") +
    "</div>"
  );
}

function renderBlockedList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No blocked tasks.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { taskId?: unknown; blockedBy?: unknown };
        const tid = String(row?.taskId ?? "").trim();
        const deps = Array.isArray(row?.blockedBy) ? (row.blockedBy as string[]).join(", ") : "";
        const label = "- " + escapeHtml(tid) + " blocked by " + escapeHtml(deps);
        const idAttr = escapeHtml(tid);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">' +
          label +
          "</span>" +
          (tid.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task view (markdown)">View</button>'
            : "") +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function phaseBucketsNonEmpty(phaseBuckets: unknown): unknown[] {
  if (!Array.isArray(phaseBuckets)) {
    return [];
  }
  return phaseBuckets.filter((raw) => {
    const c = (raw as { count?: unknown }).count;
    return typeof c !== "number" || c > 0;
  });
}

/** Phrase inserted for `{phase}` in the "Complete & Release" chat template (dashboard). */
export function resolvePhasePhraseForCompleteRelease(raw: {
  phaseKey?: unknown;
  top?: unknown;
}): string {
  const pk = raw.phaseKey;
  if (pk !== null && pk !== undefined && String(pk).trim() !== "") {
    return `Phase ${String(pk).trim()}`;
  }
  const top = raw.top;
  if (Array.isArray(top) && top.length > 0) {
    const row = top[0] as { phase?: unknown };
    if (row?.phase != null && String(row.phase).trim() !== "") {
      return String(row.phase).trim();
    }
  }
  return "Not Phased";
}

function readyPhaseBucketHasTasks(raw: unknown): boolean {
  const b = raw as { count?: unknown; top?: unknown };
  if (typeof b.count === "number" && b.count > 0) {
    return true;
  }
  return Array.isArray(b.top) && b.top.length > 0;
}

/**
 * When `dashboard-summary` includes `phaseBuckets`, one `<details>` per phase (closed until expanded).
 */
function renderReadyPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  emptyMessage: string,
  phaseTrackPrefix: string
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; phaseKey?: unknown; count?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const phasePhrase = resolvePhasePhraseForCompleteRelease(b);
        const phasePhraseAttr = escapeHtmlAttr(phasePhrase);
        const showRelease = readyPhaseBucketHasTasks(raw);
        const releaseBtn = showRelease
          ? '<button type="button" class="dash-phase-release-btn" data-wc-action="phase-complete-release" data-wc-phase-phrase="' +
            phasePhraseAttr +
            '" title="Open a new chat with a phase closeout prompt">Complete &amp; Release</button>'
          : "";
        const body = renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
          releaseBtn +
          "</summary>" +
          body +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderProposedPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderProposedImprovementsList(totalCount, fallbackTop);
  }
  const sumCounts = buckets.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCounts < totalCount
      ? '<p class="muted">Preview capped per phase · expand sections below or <code>list-tasks</code> for full lists.</p>'
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> per row. <b>Accept All</b> on a phase heading runs <code>accept</code> for every proposed improvement in that phase (one shared rationale; planning token refreshed between calls).</p>' +
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-primary dash-phase-accept-all" data-wc-action="proposed-imp-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed improvement in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedImprovementsList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
          acceptAllBtn +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderTranscriptChurnResearchPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderTranscriptChurnResearchList(totalCount, fallbackTop);
  }
  const sumCounts = buckets.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCounts < totalCount
      ? '<p class="muted">Preview capped per phase · expand sections below or <code>list-tasks</code> for full lists.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTranscriptChurnResearchList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Proposed execution uses the same row shape as improvements for phase bodies. */
function renderProposedExecutionPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string
): string {
  const bucketsPe = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsPe.length === 0) {
    return renderProposedExecutionList(totalCount, fallbackTop);
  }
  const sumCountsPe = bucketsPe.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCountsPe < totalCount
      ? '<p class="muted">Preview capped per phase · expand below or <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<p class="muted"><b>Accept All</b> on a phase heading accepts every proposed execution task in that phase (shared rationale).</p>' +
    '<div class="phase-stack">' +
    bucketsPe
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-primary dash-phase-accept-all" data-wc-action="proposed-exe-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed execution task in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedExecutionList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
          acceptAllBtn +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderBlockedPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  totalBlocked: number,
  phaseTrackPrefix: string
): string {
  const bucketsBl = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsBl.length === 0) {
    return renderBlockedList(fallbackTop);
  }
  const sumBlocked = bucketsBl.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumBlocked < totalBlocked
      ? '<p class="muted">Preview capped per phase · full list via <code>list-tasks</code> or <code>get-next-actions</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    bucketsBl
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : renderBlockedList(b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

/**
 * Terminal statuses (completed / cancelled): phase buckets closed until expanded.
 */
function renderTerminalTaskPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  totalInStatus: number,
  emptyMessage: string,
  phaseTrackPrefix: string
): string {
  const bucketsTm = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsTm.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  const sum = bucketsTm.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sum < totalInStatus
      ? '<p class="muted">Preview capped per phase · full list via <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    bucketsTm
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket terminal-phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Readable label for `build-plan` planningType / status strings (dashboard only). */
function humanizePlanningToken(raw: string): string {
  const s = raw.trim();
  if (s.length === 0) {
    return "";
  }
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Dashboard-local guided `build-plan` flow (host runs CLI; webview collects answers). */
export type PlanningInterviewWizardPanel =
  | { kind: "picker" }
  | {
      kind: "question";
      planningType: string;
      questionId: string;
      prompt: string;
      examples: string[];
      whyItMatters: string;
      progressHint: string;
    }
  | { kind: "success"; planningType: string; code: string; message: string }
  | { kind: "error"; message: string };

export function renderPlanningInterviewWizardPanel(panel: PlanningInterviewWizardPanel): string {
  const planningTypes: readonly [string, string][] = [
    ["change", "Change / Refactor"],
    ["new-feature", "New Feature"],
    ["task-breakdown", "Task Breakdown"],
    ["sprint-phase", "Sprint / Phase"],
    ["task-ordering", "Task Ordering"]
  ];
  if (panel.kind === "picker") {
    const opts = planningTypes
      .map(
        ([v, label]) =>
          '<option value="' + escapeHtmlAttr(v) + '">' + escapeHtml(label) + "</option>"
      )
      .join("");
    return (
      '<div class="dash-planning-wizard" aria-label="Guided planning interview">' +
      '<div class="dash-planning-wizard-picker-row">' +
      '<label class="dash-planning-wizard-label dash-planning-wizard-label-inline" for="wc-planning-type">Planning Type</label>' +
      '<select id="wc-planning-type" class="dash-planning-wizard-select">' +
      opts +
      "</select>" +
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-start">Start interview</button>' +
      "</div>" +
      "</div>"
    );
  }
  if (panel.kind === "question") {
    const ex =
      panel.examples.length > 0
        ? "<p><b>Examples:</b> " + escapeHtml(panel.examples.join(" · ")) + "</p>"
        : "";
    return (
      '<div class="dash-planning-wizard" aria-label="Planning question">' +
      "<p><b>Question</b> · " +
      escapeHtml(panel.planningType) +
      " · " +
      escapeHtml(panel.progressHint) +
      "</p>" +
      "<p>" +
      escapeHtml(panel.prompt) +
      "</p>" +
      ex +
      (panel.whyItMatters.trim().length > 0
        ? '<p class="muted"><b>Why it matters:</b> ' + escapeHtml(panel.whyItMatters) + "</p>"
        : "") +
      '<label class="dash-planning-wizard-label" for="wc-planning-answer">Your answer</label>' +
      '<textarea id="wc-planning-answer" class="dash-planning-wizard-textarea" rows="5" spellcheck="true"></textarea>' +
      '<p class="dash-planning-wizard-actions">' +
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-submit">Submit answer</button> ' +
      '<button type="button" class="dash-row-action-secondary" data-wc-action="planning-wizard-cancel">Cancel</button>' +
      "</p>" +
      "</div>"
    );
  }
  if (panel.kind === "success") {
    const persistenceHint =
      panel.code === "planning-response-ready"
        ? '<p class="muted"><b>Persistence:</b> Response-only — no wishlist row or task was written from this dashboard flow.</p>'
        : panel.code === "planning-wishlist-ready"
          ? '<p class="muted"><b>Persistence:</b> Answers saved; create the wishlist row with <code>build-plan</code> finalize + <code>createWishlist</code> from the CLI or chat when ready.</p>'
          : panel.code === "planning-artifact-created"
            ? '<p class="muted"><b>Persistence:</b> A wishlist intake row was created — refresh the dashboard or use <b>Open wishlist detail</b> from the toast if shown.</p>'
            : "";
    return (
      '<div class="dash-planning-wizard ok" aria-label="Planning interview complete">' +
      "<p><b>Interview complete</b> · " +
      escapeHtml(panel.planningType) +
      " · <code>" +
      escapeHtml(panel.code) +
      "</code></p>" +
      "<p>" +
      escapeHtml(panel.message) +
      "</p>" +
      persistenceHint +
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-dismiss">Done</button>' +
      "</div>"
    );
  }
  return (
    '<div class="dash-planning-wizard bad" aria-label="Planning interview error">' +
    "<p><b>Interview error</b></p>" +
    "<p>" +
    escapeHtml(panel.message) +
    "</p>" +
    '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-cancel">Reset</button>' +
    "</div>"
  );
}

function formatPlanningUpdatedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(t);
  } catch {
    return iso;
  }
}

function renderPlanningSession(ps: unknown, wizardPanel?: PlanningInterviewWizardPanel | null): string {
  const wizardHtml =
    wizardPanel !== undefined && wizardPanel !== null ? renderPlanningInterviewWizardPanel(wizardPanel) : "";

  if (!ps || typeof ps !== "object") {
    return (
      '<section class="dash-card" aria-label="Planning session">' +
      '<div class="dash-planning-head">' +
      '<div class="dash-planning-head-main"><p class="dash-planning-title"><b>Planning Interview</b></p></div>' +
      "</div>" +
      wizardHtml +
      "<p class=\"muted\">No interview in progress. Start or resume with <code>workspace-kit run build-plan</code> when you want guided planning; progress is saved automatically under <code>.workspace-kit/planning/</code>.</p>" +
      "</section>"
    );
  }
  const o = ps as Record<string, unknown>;
  const pct = typeof o.completionPct === "number" ? String(o.completionPct) : "—";
  const typeRaw = String(o.planningType ?? "").trim();
  const statusRaw = String(o.status ?? "").trim();
  const typeDisp = typeRaw.length > 0 ? humanizePlanningToken(typeRaw) : "Planning";
  const statusDisp = statusRaw.length > 0 ? humanizePlanningToken(statusRaw) : "—";
  const crit =
    typeof o.answeredCritical === "number" && typeof o.totalCritical === "number"
      ? escapeHtml(String(o.answeredCritical)) +
        " of " +
        escapeHtml(String(o.totalCritical)) +
        " required questions answered"
      : "";
  const when =
    typeof o.updatedAt === "string" && o.updatedAt.length > 0
      ? formatPlanningUpdatedAt(o.updatedAt)
      : "—";
  const resumeCli = String(o.resumeCli ?? "").trim();
  const resumeActions =
    '<span class="dash-planning-actions">' +
    (resumeCli.length > 0
      ? '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-resume-chat" data-resume-cli="' +
        escapeHtmlAttr(resumeCli) +
        '" title="Open a new Agent chat with the saved planning resume command">Resume</button>'
      : "") +
    '<button type="button" class="dash-row-action-secondary dash-planning-discard-btn" data-wc-action="planning-discard" title="Discard the saved planning interview">Discard</button>' +
    "</span>";
  return (
    '<section class="dash-card" aria-label="Planning session resume">' +
    '<div class="dash-planning-head">' +
    '<div class="dash-planning-head-main"><p class="dash-planning-title"><b>Planning Interview</b> · ' +
    escapeHtml(typeDisp) +
    " · " +
    escapeHtml(statusDisp) +
    "</p></div>" +
    resumeActions +
    "</div>" +
    "<p>" +
    escapeHtml(pct) +
    "% through required questions" +
    (crit ? " (" + crit + ")" : "") +
    "</p>" +
    '<p class="muted">Last saved: ' +
    escapeHtml(when) +
    "</p>" +
    '<p class="muted">Resume opens a fresh Agent chat with the saved command; Discard clears the saved interview.</p>' +
    "</section>"
  );
}

/** 3-column grid of status counts with right-aligned tabular numbers. */
function buildDashboardStateCountGridHtml(ss: Record<string, unknown>): string {
  const order: [string, string][] = [
    ["research", "Research"],
    ["proposed", "Proposed"],
    ["ready", "Ready"],
    ["in_progress", "In Progress"],
    ["blocked", "Blocked"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"]
  ];
  const cells: { label: string; n: number }[] = [];
  for (const [key, label] of order) {
    const v = ss[key];
    if (typeof v === "number") {
      cells.push({ label, n: v });
    }
  }
  if (cells.length === 0) {
    return '<p class="ok">—</p>';
  }
  return (
    '<div class="dash-count-grid" role="list">' +
    cells
      .map(
        (c) =>
          '<div class="dash-count-cell" role="listitem">' +
          '<span class="dash-count-label">' +
          escapeHtml(c.label) +
          '</span> <span class="dash-count-num ok">' +
          escapeHtml(String(c.n)) +
          "</span></div>"
      )
      .join("") +
    "</div>"
  );
}

/**
 * **Role** — `data.agentGuidance.displayLabel` (effective `kit.agentGuidance` tier + RPG party catalog).
 * **Agent Temperament** — resolved agent-behavior profile label (`builtin:*` / `custom:*`).
 */
function renderTeamExecutionSection(team: unknown): string {
  if (!team || typeof team !== "object") {
    return "";
  }
  const o = team as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const avail = o.available === true;
  const total = typeof o.totalCount === "number" ? o.totalCount : 0;
  const active = typeof o.activeCount === "number" ? o.activeCount : 0;
  const by = (o.byStatus as Record<string, unknown> | undefined) ?? {};
  const top = Array.isArray(o.topActive) ? (o.topActive as unknown[]) : [];
  const statusLine =
    "<p class=\"muted\">Total " +
    String(total) +
    " · Active " +
    String(active) +
    " · Assigned " +
    String(typeof by.assigned === "number" ? by.assigned : 0) +
    " · Submitted " +
    String(typeof by.submitted === "number" ? by.submitted : 0) +
    " · Blocked " +
    String(typeof by.blocked === "number" ? by.blocked : 0) +
    "</p>";
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Team execution">' +
      "<p><b>Team assignments</b></p>" +
      '<p class="muted">Team execution data unavailable (kit SQLite below v7 or store not readable).</p>' +
      "</section>"
    );
  }
  if (top.length === 0) {
    return (
      '<section class="dash-card" aria-label="Team execution">' +
      "<p><b>Team assignments</b></p>" +
      statusLine +
      '<p class="muted">No active supervisor assignments.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = escapeHtml(String(r.id ?? ""));
      const tid = escapeHtml(String(r.executionTaskId ?? ""));
      const title = r.executionTaskTitle != null ? escapeHtml(String(r.executionTaskTitle)) : "";
      const st = escapeHtml(String(r.status ?? ""));
      const sup = escapeHtml(String(r.supervisorId ?? ""));
      const wrk = escapeHtml(String(r.workerId ?? ""));
      const label =
        "- " +
        id +
        " → " +
        tid +
        (title ? " " + title : "") +
        " · " +
        st +
        " · sup " +
        sup +
        " · worker " +
        wrk;
      return '<div class="dash-row" role="listitem"><span class="dash-row-label">' + label + "</span></div>";
    })
    .join("");
  return (
    '<section class="dash-card" aria-label="Team execution">' +
    "<p><b>Team assignments</b> (read-only)</p>" +
    statusLine +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}

function renderSubagentRegistrySection(sub: unknown): string {
  if (!sub || typeof sub !== "object") {
    return "";
  }
  const o = sub as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const avail = o.available === true;
  const defs = typeof o.definitionsCount === "number" ? o.definitionsCount : 0;
  const openSess = typeof o.openSessionsCount === "number" ? o.openSessionsCount : 0;
  const top = Array.isArray(o.topOpenSessions) ? (o.topOpenSessions as unknown[]) : [];
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Subagent registry">' +
      "<p><b>Subagent registry</b></p>" +
      '<p class="muted">Subagent data unavailable (kit SQLite below v6 or store not readable).</p>' +
      "</section>"
    );
  }
  const statusLine =
    "<p class=\"muted\">Definitions " +
    String(defs) +
    " · Open sessions " +
    String(openSess) +
    "</p>";
  if (top.length === 0) {
    return (
      '<section class="dash-card" aria-label="Subagent registry">' +
      "<p><b>Subagent registry</b> (read-only)</p>" +
      statusLine +
      '<p class="muted">No open subagent sessions.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const sid = escapeHtml(String(r.sessionId ?? ""));
      const def = escapeHtml(String(r.definitionId ?? ""));
      const tid = r.executionTaskId != null ? escapeHtml(String(r.executionTaskId)) : "—";
      const st = escapeHtml(String(r.status ?? ""));
      return (
        '<div class="dash-row" role="listitem"><span class="dash-row-label">- ' +
        sid +
        " · " +
        def +
        " · task " +
        tid +
        " · " +
        st +
        "</span></div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card" aria-label="Subagent registry">' +
    "<p><b>Subagent registry</b> (read-only)</p>" +
    statusLine +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}

function truncateOverviewLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) {
    return one;
  }
  return one.slice(0, Math.max(1, max - 1)) + "…";
}

/** Same leading-digit rule as `dashboard-phase-buckets.ts` `parseWorkspacePhaseKey`. */
function parseDashboardKitPhaseKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  return m ? m[1]! : null;
}

/**
 * Ready **execution** tasks in the bucket that matches maintainer `current_kit_phase`
 * (see `readyExecutionSummary.phaseBuckets` from `dashboard-summary`).
 */
function countReadyExecutionTasksInCurrentPhase(
  ws: Record<string, unknown>,
  readyExecutionSummary: Record<string, unknown>
): number {
  const phaseKey = parseDashboardKitPhaseKey(ws.currentKitPhase);
  if (phaseKey === null) {
    return 0;
  }
  const buckets = Array.isArray(readyExecutionSummary.phaseBuckets)
    ? readyExecutionSummary.phaseBuckets
    : [];
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const b = raw as { phaseKey?: unknown; count?: unknown };
    const bk = b.phaseKey;
    if (bk === null || bk === undefined) {
      continue;
    }
    if (String(bk) !== phaseKey) {
      continue;
    }
    const n = b.count;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

const DELIVER_TOOLTIP_NO_READY = "There are no ready to work tasks for this phase.";
const DELIVER_TOOLTIP_NO_PHASE =
  "Current phase is not set or could not be read from the workspace snapshot.";
const DELIVER_TOOLTIP_ENABLED =
  "Prefill chat: deliver a ready task through the phase branch (task-to-phase-branch)";

function renderRoleTemperamentLines(ag: unknown): string {
  if (!ag || typeof ag !== "object") {
    return "";
  }
  const o = ag as Record<string, unknown>;
  const tier = typeof o.tier === "number" ? o.tier : null;
  const roleLabel = typeof o.displayLabel === "string" ? o.displayLabel.trim() : "";
  const tempLabel = typeof o.temperamentLabel === "string" ? o.temperamentLabel.trim() : "";
  if (tier === null) {
    return "";
  }
  return (
    "<p><b>Role:</b> " +
    escapeHtml(roleLabel.length > 0 ? roleLabel : "—") +
    "</p>" +
    "<p><b>Agent Temperament:</b> " +
    escapeHtml(tempLabel.length > 0 ? tempLabel : "—") +
    "</p>"
  );
}

/** Current / next phase + Deliver chip (no outer section). */
function renderPhaseDeliverBlockInner(
  ws: Record<string, unknown>,
  readyExecutionSummary: Record<string, unknown>
): string {
  const curRaw = ws.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  const cur = curRaw.length > 0 ? escapeHtml(curRaw) : "—";
  const nextTrim = ws.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const nextMeaningful = nextTrim.length > 0 && nextTrim !== curRaw;
  const nextDisplay = nextMeaningful ? escapeHtml(nextTrim) : "Not Planned";

  const parsedPhase = parseDashboardKitPhaseKey(ws.currentKitPhase);
  const readyInPhase = countReadyExecutionTasksInCurrentPhase(ws, readyExecutionSummary);
  const deliverEnabled = parsedPhase !== null && readyInPhase > 0;
  const deliverTitle = deliverEnabled
    ? DELIVER_TOOLTIP_ENABLED
    : parsedPhase === null
      ? DELIVER_TOOLTIP_NO_PHASE
      : DELIVER_TOOLTIP_NO_READY;

  const deliverBtn =
    '<button type="button" class="dash-deliver-chip"' +
    (deliverEnabled ? ' data-wc-action="deliver-phase-prompt"' : "") +
    (curRaw.length > 0 ? ' data-wc-kit-phase="' + escapeHtmlAttr(curRaw) + '"' : "") +
    (deliverEnabled ? "" : " disabled") +
    ' title="' +
    escapeHtmlAttr(deliverTitle) +
    '">Deliver</button>';

  return (
    '<p class="dash-overview-phase-row">' +
    '<span class="dash-overview-phase-text"><b>Current Phase</b> ' +
    cur +
    "</span>" +
    deliverBtn +
    "</p>" +
    "<p><b>Next Phase</b> " +
    nextDisplay +
    "</p>"
  );
}

/**
 * First dashboard card: role + temperament when configured, then current/next phase and Deliver.
 */
function renderRoleTemperamentAndPhaseSection(
  ag: unknown,
  ws: Record<string, unknown> | null,
  readyExecutionSummary?: Record<string, unknown>
): string {
  const rt = renderRoleTemperamentLines(ag);
  const phaseInner = ws !== null ? renderPhaseDeliverBlockInner(ws, readyExecutionSummary ?? {}) : "";
  if (rt === "" && phaseInner === "") {
    return "";
  }
  return (
    '<section class="dash-card dash-role-temperament-phase" aria-label="Role, temperament, and phase">' +
    rt +
    phaseInner +
    "</section>"
  );
}

/** Blockers and pending decisions (phase + Deliver live on first card). */
function renderWorkspaceBlockersPendingSection(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return (
      '<section class="dash-card dashboard-overview" aria-label="Workspace status">' +
      '<p class="muted">No workspace status from kit SQLite (<code>get-workspace-status</code>) — run <code>pnpm run wk doctor</code> or ensure planning DB migrated to user_version 10+.</p>' +
      "</section>"
    );
  }

  const blockers = Array.isArray(ws.blockers)
    ? (ws.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  const pending = Array.isArray(ws.pendingDecisions)
    ? (ws.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (blockers.length === 0 && pending.length === 0) {
    return "";
  }

  let html =
    '<section class="dash-card dashboard-overview" aria-label="Workspace blockers and decisions">';
  if (blockers.length > 0) {
    const shown = blockers
      .slice(0, 2)
      .map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more =
      blockers.length > 2
        ? " <span class=\"muted\">(+" + String(blockers.length - 2) + " more)</span>"
        : "";
    html += "<p><b>Blockers</b> " + shown.join(" · ") + more + "</p>";
  }
  if (pending.length > 0) {
    const shown = pending
      .slice(0, 2)
      .map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more = pending.length > 2 ? " …" : "";
    html += "<p><b>Pending Decisions</b> " + shown.join(" · ") + more + "</p>";
  }
  html += "</section>";
  return html;
}

/** Closed-by-default roll-up for a dashboard status band (ready / proposed / blocked / terminal). */
function renderStatusRollup(
  trackId: string,
  summaryInnerHtml: string,
  bodyHtml: string,
  emptyOnly?: boolean,
  openByDefault?: boolean
): string {
  const body = emptyOnly ? '<p class="muted">No Items</p>' : bodyHtml;
  return (
    '<details class="status-section"' +
    wcTrackAttr(trackId) +
    (openByDefault ? " open" : "") +
    ">" +
    "<summary>" +
    summaryInnerHtml +
    "</summary>" +
    '<div class="status-section-body">' +
    body +
    "</div>" +
    "</details>"
  );
}

/** Inner HTML for #root from a `workspace-kit run dashboard-summary`–shaped payload (or extension error object). */
export function renderDashboardRootInnerHtml(
  payload: unknown,
  planningWizardPanel?: PlanningInterviewWizardPanel | null
): string {
  if (payload === null || payload === undefined) {
    return "<p>No payload</p>";
  }
  const p = payload as { ok?: unknown; code?: unknown; data?: Record<string, unknown> };
  if (p.ok !== true) {
    const guidance =
      p.code === "policy-denied"
        ? "\n\nPolicy denied: provide policyApproval rationale/session scope where required."
        : "";
    return (
      '<pre class="bad">' + escapeHtml(JSON.stringify(payload, null, 2) + guidance) + "</pre>"
    );
  }
  const d = p.data ?? {};
  const ss = (d.stateSummary as Record<string, unknown>) || {};
  const ws = (d.workspaceStatus as Record<string, unknown> | null | undefined) ?? null;
  const wishlist = (d.wishlist as Record<string, unknown>) || {};
  const wishlistOpenTop = Array.isArray(wishlist.openTop) ? wishlist.openTop : [];
  const planningSession = d.planningSession;
  const blockedSummary = (d.blockedSummary as Record<string, unknown>) || {};
  const blockedTop = Array.isArray(blockedSummary.top) ? (blockedSummary.top as unknown[]).slice(0, 8) : [];
  const ris = (d.readyImprovementsSummary as Record<string, unknown> | undefined) ?? {};
  const res = (d.readyExecutionSummary as Record<string, unknown> | undefined) ?? {};
  let readyImpTop = Array.isArray(ris.top) ? (ris.top as unknown[]) : [];
  let readyExeTop = Array.isArray(res.top) ? (res.top as unknown[]) : [];
  let readyImpCount = typeof ris.count === "number" ? ris.count : readyImpTop.length;
  let readyExeCount = typeof res.count === "number" ? res.count : readyExeTop.length;
  const oldReadyOnly = !("readyImprovementsSummary" in d) && !("readyExecutionSummary" in d);
  if (oldReadyOnly && Array.isArray(d.readyQueueTop) && (d.readyQueueTop as unknown[]).length > 0) {
    readyExeTop = (d.readyQueueTop as unknown[]).slice(0, 15);
    readyExeCount =
      typeof d.readyQueueCount === "number" ? (d.readyQueueCount as number) : readyExeTop.length;
    readyImpTop = [];
    readyImpCount = 0;
  }
  const pis = (d.proposedImprovementsSummary as Record<string, unknown> | undefined) ?? {};
  const piCount = typeof pis.count === "number" ? pis.count : 0;
  const piTop = Array.isArray(pis.top) ? (pis.top as unknown[]) : [];
  const pes = (d.proposedExecutionSummary as Record<string, unknown> | undefined) ?? {};
  const peCount = typeof pes.count === "number" ? pes.count : 0;
  const peTop = Array.isArray(pes.top) ? (pes.top as unknown[]) : [];
  const tcrs = (d.transcriptChurnResearchSummary as Record<string, unknown> | undefined) ?? {};
  const tcrCount = typeof tcrs.count === "number" ? tcrs.count : 0;
  const tcrTop = Array.isArray(tcrs.top) ? (tcrs.top as unknown[]) : [];
  const rqb = d.readyQueueBreakdown as
    | { improvement?: unknown; other?: unknown; schemaVersion?: unknown }
    | undefined;
  const rqbImp = typeof rqb?.improvement === "number" ? rqb.improvement : null;
  const rqbOther = typeof rqb?.other === "number" ? rqb.other : null;
  const breakdownLine =
    rqbImp !== null && rqbOther !== null && rqbImp + rqbOther > 0
      ? '<p class="muted">Ready Queue · ' +
        String(rqbImp) +
        " Improvement" +
        (rqbImp === 1 ? "" : "s") +
        " · " +
        String(rqbOther) +
        " Other</p>"
      : "";

  const terminalSection = (() => {
    const cs = d.completedSummary as Record<string, unknown> | undefined;
    const ks = d.cancelledSummary as Record<string, unknown> | undefined;
    if (!cs && !ks) {
      return "";
    }
    const compCount = typeof cs?.count === "number" ? cs.count : 0;
    const cancCount = typeof ks?.count === "number" ? ks.count : 0;
    const compTop = Array.isArray(cs?.top) ? (cs!.top as unknown[]).slice(0, 15) : [];
    const cancTop = Array.isArray(ks?.top) ? (ks!.top as unknown[]).slice(0, 15) : [];
    const inner =
      renderStatusRollup(
        "status-term-comp",
        "<b>Completed</b> (" + String(compCount) + ")",
        renderTerminalTaskPhaseBuckets(
          cs?.phaseBuckets,
          compTop,
          compCount,
          "No completed tasks.",
          "term-comp"
        ),
        compCount === 0
      ) +
      renderStatusRollup(
        "status-term-can",
        "<b>Cancelled</b> (" + String(cancCount) + ")",
        renderTerminalTaskPhaseBuckets(
          ks?.phaseBuckets,
          cancTop,
          cancCount,
          "No cancelled tasks.",
          "term-can"
        ),
        cancCount === 0
      );
    return (
      '<section class="dashboard-terminal-tasks" aria-label="Completed and cancelled tasks">' + inner + "</section>"
    );
  })();

  const tasksQuickActionsPanel =
    '<div class="dash-quick-actions" role="toolbar" aria-label="Chat playbook shortcuts">' +
    '<button type="button" class="dash-quick-action-btn" data-wc-action="add-wishlist-item" title="Create a wishlist intake task (same flow as /add-wishlist-item)">Add wishlist item</button>' +
    '<button type="button" class="dash-quick-action-btn" data-wc-action="collaboration-hub" title="Slash hub + CLI for collaboration profiles; chat does not replace policyApproval">Collaboration profiles</button>' +
    '<button type="button" class="dash-quick-action-btn" data-wc-action="transcript-churn-research-chat" title="Transcript churn research playbook (same intent as slash /research-churn)">Research churn</button>' +
    '<button type="button" class="dash-quick-action-btn dash-quick-action-primary" data-wc-action="generate-features-chat" title="New chat with /generate-features as text (same as slash command)">Generate Features</button>' +
    "</div>";

  const tasksBlock =
    '<section class="dash-card dashboard-tasks-block" aria-label="Task queue rollups">' +
    tasksQuickActionsPanel +
    "<p><b>Tasks</b></p>" +
    buildDashboardStateCountGridHtml(ss) +
    renderStatusRollup(
      "status-ready-imp",
      "<b>Ready · Improvements</b> (" + String(readyImpCount) + ")",
      renderReadyPhaseBuckets(ris.phaseBuckets, readyImpTop, "No ready improvements.", "rdy-imp"),
      readyImpCount === 0,
      readyImpCount > 0
    ) +
    renderStatusRollup(
      "status-ready-exe",
      "<b>Ready · Execution</b> (" + String(readyExeCount) + ")",
      breakdownLine +
        renderReadyPhaseBuckets(res.phaseBuckets, readyExeTop, "No ready execution tasks.", "rdy-exe"),
      readyExeCount === 0,
      readyExeCount > 0
    ) +
    renderStatusRollup(
      "status-prop-imp",
      "<b>Proposed · Improvements</b> (" + String(piCount) + ")",
      renderProposedPhaseBuckets(pis.phaseBuckets, piCount, piTop, "prop-imp"),
      piCount === 0
    ) +
    renderStatusRollup(
      "status-prop-exe",
      "<b>Proposed · Execution</b> (" + String(peCount) + ")",
      renderProposedExecutionPhaseBuckets(pes.phaseBuckets, peCount, peTop, "prop-exe"),
      peCount === 0
    ) +
    renderStatusRollup(
      "status-tc-research",
      "<b>Research · Transcript churn</b> (" + String(tcrCount) + ")",
      renderTranscriptChurnResearchPhaseBuckets(tcrs.phaseBuckets, tcrCount, tcrTop, "tc-churn"),
      false
    ) +
    renderStatusRollup(
      "status-blocked",
      "<b>Blocked</b> (" + String(Number(blockedSummary.count ?? 0)) + ")",
      renderBlockedPhaseBuckets(
        blockedSummary.phaseBuckets,
        blockedTop,
        Number(blockedSummary.count ?? 0),
        "blk"
      ),
      Number(blockedSummary.count ?? 0) === 0
    ) +
    terminalSection +
    "</section>";

  const wishOpen = Number(wishlist.openCount ?? 0);
  const wishTotal = Number(wishlist.totalCount ?? 0);
  const wishlistSection =
    '<section class="dash-card" aria-label="Wishlist">' +
    '<details class="status-section"' +
    wcTrackAttr("wishlist") +
    ">" +
    "<summary><b>Wishlist</b> · Open " +
    String(wishOpen) +
    " / Total " +
    String(wishTotal) +
    "</summary>" +
    '<div class="status-section-body">' +
    (wishOpen === 0 ? '<p class="muted">No Items</p>' : renderWishlistOpenList(wishlistOpenTop)) +
    "</div></details></section>";

  const storeSection =
    '<section class="dash-card dash-store-meta" aria-label="Task store">' +
    '<p class="muted">Store Updated ' +
    escapeHtml(String(d.taskStoreLastUpdated ?? "")) +
    "</p>" +
    "</section>";

  return (
    renderRoleTemperamentAndPhaseSection(d.agentGuidance, ws as Record<string, unknown> | null, res) +
    renderWorkspaceBlockersPendingSection(ws as Record<string, unknown> | null) +
    renderTeamExecutionSection(d.teamExecution) +
    renderSubagentRegistrySection(d.subagentRegistry) +
    tasksBlock +
    wishlistSection +
    renderPlanningSession(planningSession, planningWizardPanel) +
    storeSection
  );
}
