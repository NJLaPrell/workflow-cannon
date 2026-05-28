import {
  DASHBOARD_SECTION_REGISTRY,
  type DashboardSectionId,
  type DashboardSectionLoadState
} from "./dashboard-section-registry.js";
import { escapeHtml } from "./render-dashboard.js";

function sectionStatusCopy(state: DashboardSectionLoadState): string {
  switch (state) {
    case "loading":
      return "Loading…";
    case "stale":
      return "Stale — refresh to update";
    case "error":
      return "Failed to load";
    default:
      return "";
  }
}

const SECTION_LABELS: Record<DashboardSectionId, string> = {
  overview: "Overview",
  ideas: "Ideas",
  queue: "Task queue",
  "phase-journal": "Phase journal",
  status: "Workspace status",
  config: "Configuration",
  cae: "CAE authoring"
};

export function renderDashboardSectionPlaceholder(
  id: DashboardSectionId,
  state: DashboardSectionLoadState = "loading",
  label = SECTION_LABELS[id]
): string {
  return renderSectionPlaceholder(id, label, state);
}

function renderSectionPlaceholder(
  id: DashboardSectionId,
  label: string,
  state: DashboardSectionLoadState = "loading"
): string {
  const statusLabel = sectionStatusCopy(state);
  return (
    `<div data-wc-section="${id}" class="wc-dash-section wc-dash-section--${state}"` +
    ` aria-busy="${state === "loading" ? "true" : "false"}">` +
    `<div class="wc-dash-section-inner">` +
    `<p class="wc-dash-section-label"><b>${escapeHtml(label)}</b></p>` +
    (statusLabel.length > 0
      ? `<p class="wc-dash-section-status muted">${escapeHtml(statusLabel)}</p>`
      : "") +
    `<div class="wc-dash-section-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>` +
    `</div></div>`
  );
}

/** Inner HTML for `#root` before any kit read completes — tab chrome + section placeholders only. */
export function renderDashboardShellInnerHtml(): string {
  const overview = renderDashboardSectionPlaceholder("overview");
  const ideas = renderDashboardSectionPlaceholder("ideas");
  const queue = renderDashboardSectionPlaceholder("queue");
  const phaseJournal = renderDashboardSectionPlaceholder("phase-journal");
  const status = renderDashboardSectionPlaceholder("status");
  const config = renderDashboardSectionPlaceholder("config");
  const cae = renderDashboardSectionPlaceholder("cae");

  return (
    '<div class="wc-dashboard-tab-shell wc-dashboard-shell-initial">' +
    '<div class="wc-tab-bar" role="tablist">' +
    '<button type="button" class="wc-tab-btn wc-tab-active" role="tab" data-wc-tab="overview">Overview</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="task-engine">Queue</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="status">Status</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="config">Config</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="cae">CAE</button>' +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="overview" role="tabpanel">' +
    overview +
    ideas +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="task-engine" role="tabpanel" style="display:none">' +
    queue +
    phaseJournal +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="status" role="tabpanel" style="display:none">' +
    status +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="config" role="tabpanel" style="display:none">' +
    config +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="cae" role="tabpanel" style="display:none">' +
    cae +
    "</div>" +
    "</div>"
  );
}

export { DASHBOARD_SECTION_REGISTRY };
