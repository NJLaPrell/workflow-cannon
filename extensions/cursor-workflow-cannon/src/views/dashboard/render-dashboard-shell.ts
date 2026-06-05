import {
  DASHBOARD_SECTION_REGISTRY,
  type DashboardSectionId,
  type DashboardSectionLoadState
} from "./dashboard-section-registry.js";
import {
  formatDashboardReadModeBadgeDetail,
  formatDashboardReadModeBadgeLabel,
  type DashboardReadModeBadge
} from "./dashboard-read-mode-badge.js";
import { escapeHtml, renderDashboardTabBarHtml, renderWcDashboardBannerHtml } from "./render-dashboard.js";

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
  "phase-roster": "Phase roster",
  ideas: "Ideas",
  "plan-artifact": "Plan artifact",
  "planning-interview": "Planning interview",
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

export function renderDashboardReadModeBadgeHtml(badge?: DashboardReadModeBadge | null): string {
  const label = badge ? formatDashboardReadModeBadgeLabel(badge) : "Resolving read path…";
  const detail = badge ? formatDashboardReadModeBadgeDetail(badge) : undefined;
  const titleAttr = detail ? ` title="${escapeHtml(detail)}"` : "";
  return (
    `<span class="wc-dash-read-mode-badge muted" data-wc-read-mode-badge role="status"${titleAttr}>` +
    `${escapeHtml(label)}</span>`
  );
}

/** Inner HTML for `#root` before any kit read completes — tab chrome + section placeholders only. */
export function renderDashboardShellInnerHtml(readModeBadge?: DashboardReadModeBadge | null): string {
  const overview = renderDashboardSectionPlaceholder("overview");
  const phaseRoster = renderDashboardSectionPlaceholder("phase-roster");
  const ideas = renderDashboardSectionPlaceholder("ideas");
  const planArtifact = renderDashboardSectionPlaceholder("plan-artifact");
  const planningInterview = renderDashboardSectionPlaceholder("planning-interview");
  const queue = renderDashboardSectionPlaceholder("queue");
  const phaseJournal = renderDashboardSectionPlaceholder("phase-journal");
  const status = renderDashboardSectionPlaceholder("status");
  const config = renderDashboardSectionPlaceholder("config");
  const cae = renderDashboardSectionPlaceholder("cae");

  return (
    '<div class="wc-dashboard-tab-shell wc-dashboard-shell-initial">' +
    renderWcDashboardBannerHtml(null) +
    renderDashboardTabBarHtml({ activeTab: "overview", readModeBadge }) +
    '<div class="wc-tab-panel" data-wc-tab="overview" role="tabpanel">' +
    overview +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="planning" role="tabpanel" style="display:none">' +
    phaseRoster +
    ideas +
    planArtifact +
    planningInterview +
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
