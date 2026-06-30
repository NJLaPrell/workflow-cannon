import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDashboardRootInnerHtml,
  escapeHtml,
  renderActiveFocusHtml,
  renderMarkdownBoldAfterEscape,
  resolvePhasePhraseForCompleteRelease,
  collectPhaseBucketTaskIds,
  renderPlanningInterviewWizardPanel,
  mergeReadyQueueRollupSummaries,
  renderDashboardQueueTaskRowsHtml,
  lazyTerminalBucketListLimit,
  renderUpNextCardHtml,
  dashboardRowPhaseKey,
  lookupDashboardTaskPhaseKey,
  lookupProposedTaskPhaseKey,
  pickNextTaskInCurrentPhase,
  renderPhaseCatalogOverviewSection,
  renderTaskStateSyncStatusHtml,
  renderPhaseKickoffFindingsList
} from "../dist/views/dashboard/render-dashboard.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../dist/phase-complete-release-prompt.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "../dist/views/guidance/render-guidance-panel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("mergeReadyQueueRollupSummaries merges counts, tops, and phase buckets", () => {
  const merged = mergeReadyQueueRollupSummaries(
    {
      count: 2,
      top: [{ id: "T1", title: "imp" }],
      phaseBuckets: [
        {
          phaseKey: "100",
          label: "Phase 100 (current) (2)",
          count: 2,
          top: [
            { id: "T1", title: "imp" },
            { id: "T2", title: "imp2" }
          ]
        }
      ]
    },
    {
      count: 1,
      top: [{ id: "T3", title: "exe" }],
      phaseBuckets: [
        {
          phaseKey: "100",
          label: "Phase 100 (current) (1)",
          count: 1,
          top: [{ id: "T3", title: "exe" }]
        }
      ]
    }
  );
  assert.equal(merged.count, 3);
  assert.equal(merged.top.length, 2);
  assert.equal(merged.top[0].id, "T1");
  assert.equal(merged.top[1].id, "T3");
  const buckets = merged.phaseBuckets;
  assert.ok(Array.isArray(buckets));
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].count, 3);
  assert.match(String(buckets[0].label), /\(3\)$/);
});

function plainTextFromHtml(html) {
  return html
    .replace(/<code>([\s\S]*?)<\/code>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractParagraphBoldTitles(html) {
  return [...html.matchAll(/<p><b>([\s\S]*?)<\/b>(?=[\s<])/g)]
    .map((match) => plainTextFromHtml(match[1]))
    .filter(Boolean);
}

function extractMutedParagraphs(html) {
  return [...html.matchAll(/<p class="[^"]*(?:muted|wc-hint)[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => plainTextFromHtml(match[1]))
    .filter(Boolean);
}

test("escapeHtml escapes angle brackets and ampersands", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
});

test("renderMarkdownBoldAfterEscape wraps paired asterisks in b tags", () => {
  const esc = escapeHtml("**v0.24.0** next");
  const html = renderMarkdownBoldAfterEscape(esc);
  assert.match(html, /<b>v0\.24\.0<\/b>/);
  assert.match(html, /next/);
});

test("renderActiveFocusHtml escapes HTML then applies bold", () => {
  const html = renderActiveFocusHtml('Use **bold** and <script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderDashboardRootInnerHtml config tab embeds config panel shell not activity-bar stub", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  const caePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="cae"');
  assert.ok(configPanelIdx >= 0);
  const configPanel = html.slice(configPanelIdx, caePanelIdx > configPanelIdx ? caePanelIdx : undefined);
  assert.match(configPanel, /id="config-list-root"/);
  assert.match(configPanel, /id="cfg-refresh"/);
  assert.match(configPanel, /wc-config-panel/);
  assert.match(configPanel, /cfg-quick-settings/);
  assert.match(configPanel, /Dashboard → Config/);
  assert.doesNotMatch(configPanel, /activity bar/i);
});

test("renderDashboardRootInnerHtml shows error JSON when ok is false", () => {
  const html = renderDashboardRootInnerHtml({
    ok: false,
    code: "extension-exec-error",
    message: "CLI not found"
  });
  assert.match(html, /extension-exec-error/);
  assert.match(html, /bad/);
});

test("renderDashboardRootInnerHtml places planning cards on the Planning tab", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      ideas: {
        schemaVersion: 1,
        available: true,
        totalCount: 1,
        openCount: 1,
        planningCount: 0,
        plannedCount: 0,
        top: [{ id: "I1", title: "Draft a better dashboard", status: "open", previousPlanArtifacts: [] }]
      }
    }
  });
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const planningPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="planning"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const overviewPanel = html.slice(overviewPanelIdx, planningPanelIdx);
  const planningPanel = html.slice(planningPanelIdx, taskEnginePanelIdx);
  assert.ok(overviewPanelIdx >= 0, "overview panel expected");
  assert.ok(planningPanelIdx > overviewPanelIdx, "planning panel should follow overview");
  assert.ok(taskEnginePanelIdx > planningPanelIdx, "queue panel should follow planning");
  assert.doesNotMatch(overviewPanel, /data-wc-section="ideas"/);
  assert.match(planningPanel, /data-wc-section="ideas"/);
  assert.match(planningPanel, /data-wc-section="phase-roster"/);
  assert.match(planningPanel, /Draft a better dashboard/);
  assert.match(planningPanel, /Open 1 · Planning 0 · Planned 0 · Total 1/);
  assert.match(planningPanel, /data-wc-ideas-create-form="1"/);
  assert.match(planningPanel, /data-wc-action="idea-create"/);
  assert.match(planningPanel, /data-wc-idea-title="1"/);
  assert.match(planningPanel, /data-wc-idea-note="1"/);
  assert.match(planningPanel, /wc-ideas-drag-handle/);
  assert.match(planningPanel, /data-wc-action="idea-edit"/);
  assert.match(planningPanel, /data-wc-action="idea-delete"/);
  assert.match(planningPanel, /data-wc-action="idea-update"/);
  assert.match(planningPanel, /data-wc-action="idea-plan"/);
  assert.match(planningPanel, /Plan this/);
  assert.match(planningPanel, /data-wc-ideas-toast="1"/);
  assert.match(planningPanel, /data-wc-ideas-edit-form="1"/);
  assert.match(planningPanel, /data-wc-ideas-list="1"/);
  assert.match(planningPanel, /draggable="true"/);
  assert.match(planningPanel, /Drag to reorder/);
});

test("renderDashboardRootInnerHtml truncates long idea notes", () => {
  const longNote = "A".repeat(220);
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      ideas: {
        available: true,
        totalCount: 1,
        openCount: 1,
        planningCount: 0,
        plannedCount: 0,
        top: [{ id: "I2", title: "Capture note", note: longNote, status: "open" }]
      }
    }
  });
  const visibleNote = html.match(/data-wc-idea-note-view="1">([\s\S]*?)<\/p>/)?.[1] ?? "";
  assert.match(visibleNote, /A{157}\.{3}/);
  assert.doesNotMatch(visibleNote, new RegExp(`A{${longNote.length}}`));
});

test("renderDashboardRootInnerHtml renders fixture-shaped success payload", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  assert.match(html, /dash-card/);
  assert.match(html, /dash-agent-status-banner/);
  assert.ok(html.indexOf("dash-agent-status-banner") < html.indexOf("wc-cae-readiness"));
  assert.ok(html.indexOf("wc-rec-next") < html.indexOf("wc-cae-readiness"));
  assert.ok(html.indexOf("wc-tab-bar") < html.indexOf("wc-cae-readiness"));
  assert.match(html, /dash-agent-activity-board/);
  assert.match(html, /<span class="dash-agent-status-label">Unknown<\/span>/);
  assert.match(html, /No agent activity summary is available/);
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const planningPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="planning"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  const caePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="cae"');
  assert.ok(
    overviewPanelIdx >= 0 &&
      planningPanelIdx > overviewPanelIdx &&
      taskEnginePanelIdx > planningPanelIdx &&
      statusPanelIdx > taskEnginePanelIdx
  );
  assert.ok(configPanelIdx > statusPanelIdx, "config tab panel follows status");
  const configPanel = html.slice(configPanelIdx, caePanelIdx > configPanelIdx ? caePanelIdx : undefined);
  assert.match(configPanel, /id="config-list-root"/);
  assert.match(configPanel, /id="cfg-refresh"/);
  assert.doesNotMatch(configPanel, /activity bar/i);
  const taskEnginePanel = html.slice(taskEnginePanelIdx, statusPanelIdx);
  const overviewPanel = html.slice(overviewPanelIdx, planningPanelIdx);
  const planningPanel = html.slice(planningPanelIdx, taskEnginePanelIdx);
  const statusPanel = html.slice(statusPanelIdx, configPanelIdx);
  const caePanel = html.slice(caePanelIdx);
  assert.doesNotMatch(overviewPanel, /Role|Temperament|Presentation/);
  assert.doesNotMatch(overviewPanel, /Phase Roster/);
  assert.match(planningPanel, /data-wc-section="phase-roster"/);
  assert.match(statusPanel, /Agent Profile/);
  assert.match(statusPanel, /<span class="wc-status-kv-label">Role<\/span><span class="wc-status-kv-val">Adventurer<\/span>/);
  assert.match(statusPanel, /<span class="wc-status-kv-label">Temperament<\/span><span class="wc-status-kv-val">The Steady Adventurer<\/span>/);
  assert.match(statusPanel, /Manage guidance policies in the Dashboard <b>CAE<\/b> tab/);
  assert.doesNotMatch(caePanel, /Active Guidance|aria-label="Agent guidance"/);
  assert.ok(statusPanel.indexOf('aria-label="Agent profile"') < statusPanel.indexOf('aria-label="Workspace identity"'));
  assert.ok(overviewPanel.indexOf("dash-agent-status-banner") < overviewPanel.indexOf("wc-cae-readiness"));
  assert.ok(overviewPanel.indexOf("wc-rec-next") < overviewPanel.indexOf("wc-cae-readiness"));
  assert.ok(overviewPanel.indexOf("wc-stat-pills") < overviewPanel.indexOf("dash-agent-status-banner"));
  assert.match(overviewPanel, /wc-stat-pills/);
  assert.match(overviewPanel, /wc-pill-human/);
  assert.match(overviewPanel, /wc-stat-num-human/);
  assert.match(overviewPanel, /wc-context-help/);
  assert.match(overviewPanel, /data-wc-help-text="[^"]*Every check below must pass to reach 100%/);
  assert.doesNotMatch(taskEnginePanel, /dashboard-approvals/);
  assert.match(html, /Phase Readiness · Phase 14/);
  assert.match(html, /aria-label="Phase readiness · Phase 14"/);
  assert.match(html, /wc-cae-readiness-collapsed/);
  assert.match(html, /data-wc-action="phase-readiness-toggle"/);
  assert.match(html, /data-wc-preserve-expanded="phase-readiness"/);
  assert.match(html, /data-wc-ui-state-key="phase-readiness-14"/);
  assert.match(html, /data-wc-preserve-expanded="phase-progress"/);
  assert.match(html, /data-wc-ui-state-key="phase-progress-14"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /wc-cae-readiness-body/);
  assert.match(html, /Current Phase/);
  assert.doesNotMatch(html, /Next action/i);
  assert.doesNotMatch(html, /Planning generation/i);
  assert.doesNotMatch(html, /expectedPlanningGeneration/);
  assert.match(html, /dash-quick-actions/);
  assert.doesNotMatch(html, /data-wc-action="collaboration-hub"/);
  assert.doesNotMatch(html, />Collaboration profiles<\/button>/);
  assert.doesNotMatch(html, /data-wc-action="transcript-churn-research-chat"[\s\S]*>Research churn<\/button>/);
  assert.doesNotMatch(html, /dash-quick-actions[\s\S]*data-wc-action="phase-note-add"/);
  assert.match(html, /data-wc-action="generate-features-chat"/);
  assert.match(html, />Generate Features<\/button>/);
  const taskBlock = html.indexOf("dashboard-tasks-block");
  const quickBar = html.indexOf("dash-quick-actions");
  assert.ok(taskBlock !== -1 && quickBar !== -1 && taskBlock < quickBar);
  assert.match(html, /dash-count-grid/);
  assert.doesNotMatch(html, /wc-ready-scope-note/);
  assert.doesNotMatch(html, /wishlist_intake/);
  assert.doesNotMatch(html, /Wishlist intake rows are excluded/);
  assert.doesNotMatch(html, /wk run list-tasks/);
  assert.match(html, />Proposed<\/span> <span class="dash-count-num ok">1<\/span>/);
  assert.match(html, />Ready<\/span> <span class="dash-count-num ok">2<\/span>/);
  assert.match(html, /dashboard-tasks-block/);
  assert.match(html, /status-section/);
  assert.match(html, /data-wc-track="status-prop-exe"/);
  assert.match(html, /data-wc-track="wishlist"/);
  assert.match(html, /<b>Ready<\/b> \(2\)/);
  assert.doesNotMatch(html, /Ready · Improvements/);
  assert.doesNotMatch(html, /Ready · Execution/);
  assert.match(html, /Wishlist/);
  assert.match(html, /Proposed · Improvements/);
  assert.match(html, /Proposed · Execution/);
  const readyIdx = html.indexOf("<b>Ready</b>");
  const proposedIdx = html.indexOf("Proposed · Improvements");
  const researchIdx = html.indexOf("Research · Transcript churn");
  const blockedIdx = html.indexOf("<b>Blocked</b>");
  const completedIdx = html.indexOf("<b>Completed</b>");
  const cancelledIdx = html.indexOf("<b>Cancelled</b>");
  assert.ok(readyIdx !== -1 && proposedIdx !== -1 && readyIdx < proposedIdx);
  assert.ok(proposedIdx !== -1 && researchIdx !== -1 && proposedIdx < researchIdx);
  assert.ok(researchIdx !== -1 && blockedIdx !== -1 && researchIdx < blockedIdx);
  assert.ok(blockedIdx !== -1 && completedIdx !== -1 && blockedIdx < completedIdx);
  assert.ok(completedIdx !== -1 && cancelledIdx !== -1 && completedIdx < cancelledIdx);
  assert.match(html, /data-wc-track="status-ready"/);
  assert.match(html, /data-wc-track="status-ready" data-wc-ui-state-key="status-ready"/);
  assert.doesNotMatch(html, /data-wc-track="status-ready-imp"/);
  assert.doesNotMatch(html, /data-wc-track="status-ready-exe"/);
  assert.match(html, /data-wc-filter="ready"/);
  assert.match(html, /data-wc-filter="research"/);
  assert.match(html, /data-wc-filter="terminal"/);
  assert.match(html, /data-wc-phase-filter/);
  assert.match(html, /<option value="all">All phases<\/option>/);
  assert.match(html, /<option value="__no_phase__">No Phase<\/option>/);
  assert.match(html, /<option value="14">Current \(14\)<\/option>/);
  assert.match(html, /<option value="15">Next \(15\)<\/option>/);
  assert.match(html, /<option value="29">Phase 29<\/option>/);
  assert.doesNotMatch(taskEnginePanel, /imp-example/);
  const lazyBucketBodies = [
    ...taskEnginePanel.matchAll(
      /<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="0">([\s\S]*?)<\/div><\/details>/g
    )
  ].map((match) => match[1]);
  assert.ok(lazyBucketBodies.length >= 3, "expected lazy queue bucket placeholders");
  for (const body of lazyBucketBodies) {
    assert.doesNotMatch(body, /T319/);
    assert.doesNotMatch(body, /T320/);
    assert.doesNotMatch(body, /T099/);
  }
  assert.match(html, /W1/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-secondary"[^>]*data-wc-action="wishlist-view"/);
  assert.match(html, />View<\/button>/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-primary"[^>]*data-wc-action="wishlist-chat"/);
  assert.match(html, />Process<\/button>/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-secondary"[^>]*data-wc-action="wishlist-decline"/);
  assert.match(html, />Decline<\/button>/);
  assert.match(html, /data-wc-action="wishlist-decline"[\s\S]*data-task-id="T501"/);
  assert.doesNotMatch(html, /class="wc-btn wc-btn-sm wc-btn-success"[^>]*data-wc-action="proposed-imp-accept"/);
  assert.doesNotMatch(html, /class="wc-btn wc-btn-sm wc-btn-danger"[^>]*data-wc-action="proposed-imp-decline"/);
  assert.doesNotMatch(html, /proposed-imp-chat/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.doesNotMatch(html, /class="wc-btn wc-btn-sm wc-btn-info"[^>]*data-wc-action="assign-phase"/);
  assert.doesNotMatch(html, /data-wc-action="task-detail"[\s\S]*?>View Task<\/button>/);
  assert.doesNotMatch(html, /data-wc-action="task-comments-view"[\s\S]*?>View Comments<\/button>/);
  assert.doesNotMatch(html, /class="wc-btn wc-btn-sm wc-btn-info"[^>]*data-wc-action="task-comment-add"/);
  assert.doesNotMatch(html, /data-wc-action="task-comment-add"[\s\S]*?>Add Comment<\/button>/);
  assert.match(html, /wc-btn-sm/);
  assert.match(html, /phase-bucket/);
  assert.match(html, /data-wc-phase-bucket="14"/);
  assert.match(html, /data-wc-phase-bucket="__no_phase__"/);
  assert.doesNotMatch(html, /<details open class="phase-bucket"/);
  assert.match(html, /dashboard-terminal-tasks/);
  assert.match(html, /<b>Completed<\/b>/);
  assert.match(html, /<b>Cancelled<\/b>/);
  assert.match(html, /terminal-phase-bucket/);
  assert.match(html, /wc-lazy-terminal-bucket/);
  assert.match(html, /wc-lazy-queue-bucket/);
  assert.match(html, /data-wc-lazy-loaded="0"/);
  assert.match(html, /wc-lazy-bucket-hint/);
  assert.match(html, /data-wc-queue-category="completed"/);
  assert.match(html, /data-wc-queue-category="ready"/);
  assert.match(html, /data-wc-queue-category="proposed-improvement"/);
  assert.match(html, /data-wc-track="rdy-phase-14"/);
  assert.match(html, /data-wc-track="rdy-phase-no-phase"/);
  assert.doesNotMatch(html, /data-wc-track="rdy-p\d+"/);
  assert.doesNotMatch(html, /data-wc-track="prop-imp-p\d+"/);
  assert.doesNotMatch(html, /data-wc-queue-category="blocked"/);
  assert.match(html, /Not Phased/);
  assert.doesNotMatch(html, /Dependency Overview/);
  assert.doesNotMatch(planningPanel, /Planning Interview/);
  assert.doesNotMatch(taskEnginePanel, /Planning Interview/);
  assert.doesNotMatch(html, /data-wc-action="planning-new-plan"/);
  assert.doesNotMatch(html, /data-wc-action="planning-resume-chat"/);
  assert.doesNotMatch(taskEnginePanel, /data-wc-action="planning-discard"/);
  assert.doesNotMatch(taskEnginePanel, /wc-plan-artifact/);
  assert.match(html, /Store updated/);
  assert.doesNotMatch(html, /wc-status-counts-scope-note/);
  assert.doesNotMatch(html, /stateSummary/);
  assert.doesNotMatch(html, /same store as execution queue/i);
  assert.doesNotMatch(html, /Suggested Next/i);
});

test("renderDashboardRootInnerHtml renders PlanArtifact draft panel", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 0, proposed: 0, blocked: 0, completed: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openTop: [] },
      workspaceStatus: { currentKitPhase: "110", nextKitPhase: "111" },
      suggestedNext: null,
      planningSession: null,
      planArtifact: {
        schemaVersion: 1,
        count: 1,
        current: {
          planId: "plan-123",
          planRef: "PLANNER_TASKS.md",
          version: 1,
          status: "draft",
          title: "Dashboard lifecycle",
          planningType: "new-feature",
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 4,
          blockerCount: 0,
          warningCount: 1,
          openQuestionCount: 2,
          profile: "full-feature",
          phaseRecommendation: "Phase 110",
          reviewFindings: [
            { severity: "warning", message: "Acceptance criteria need verification detail", path: "wbs[1]" }
          ],
          wbsPreview: [
            { wbsId: "WBS-1", path: "1", title: "Kit contract", recommendedPhase: "Phase 110" },
            { wbsId: "WBS-2", path: "2", title: "Plan draft panel", recommendedPhase: "Phase 110" }
          ]
        },
        recent: []
      },
      blockingAnalysis: [],
      dependencyOverview: { schemaVersion: 1, nodes: [], edges: [] }
    }
  });

  const planningPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="planning"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const planningPanel = html.slice(planningPanelIdx, taskEnginePanelIdx);
  assert.match(planningPanel, /wc-plan-artifact/);
  assert.match(planningPanel, /Current Plan/);

  assert.match(html, /wc-plan-artifact/);
  assert.match(html, /Current Plan/);
  assert.match(html, /Dashboard lifecycle/);
  assert.match(html, /New Feature/);
  assert.match(html, /PLANNER_TASKS.md/);
  assert.match(html, /<b>4<\/b> WBS rows/);
  assert.match(html, /<b>0<\/b> blockers/);
  assert.match(html, /<b>1<\/b> warnings/);
  assert.match(html, /<b>2<\/b> open questions/);
  assert.match(html, /Profile<\/span> Full Feature/);
  assert.match(html, /Phase<\/span> Phase 110/);
  assert.match(html, /Draft/);
  assert.match(html, /Review Findings/);
  assert.match(html, /Acceptance criteria need verification detail/);
  assert.match(html, /wbs\[1\]/);
  assert.match(html, /WBS Preview/);
  assert.match(html, /WBS-1 · 1/);
  assert.match(html, /Kit contract/);
  assert.match(html, /data-wc-action="plan-artifact-accept"/);
  assert.match(html, /Review must pass before accepting this plan/);
  assert.match(html, /<button[^>]+data-wc-action="plan-artifact-accept"[^>]+disabled/);
});

test("renderDashboardRootInnerHtml enables PlanArtifact accept after review pass", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      workspaceStatus: { activeFocus: "Planning" },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, completed: 0, total: 0 },
      planningSession: null,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-accepted-ready",
          planRef: "plan-artifact:plan-accepted-ready",
          title: "Reviewed plan",
          status: "reviewed",
          planningType: "change",
          version: 3,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 2,
          openQuestionCount: 0,
          reviewFindings: []
        },
        recent: []
      },
      readyExecutionSummary: { count: 0, top: [] },
      readyImprovementsSummary: { count: 0, top: [] },
      proposedExecutionSummary: { count: 0, top: [] },
      proposedImprovementsSummary: { count: 0, top: [] },
      transcriptChurnResearchSummary: { count: 0, top: [] },
      wishlistSummary: { count: 0, top: [] }
    }
  });
  assert.match(html, /Review Passed/);
  assert.match(html, /data-wc-action="plan-artifact-accept"/);
  assert.match(html, /data-plan-id="plan-accepted-ready"/);
  assert.match(html, /data-plan-ref="plan-artifact:plan-accepted-ready"/);
  assert.match(html, /data-plan-version="3"/);
  const button = html.match(/<button[^>]+data-wc-action="plan-artifact-accept"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(button, /disabled/);
  assert.match(html, /Approval Ready/);
});

test("renderDashboardRootInnerHtml shows PlanArtifact finalize after accept", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      workspaceStatus: { activeFocus: "Planning" },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, completed: 0, total: 0 },
      planningSession: null,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-ready-to-finalize",
          planRef: "plan-artifact:plan-ready-to-finalize",
          title: "Accepted plan",
          status: "accepted",
          planningType: "change",
          version: 4,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 2,
          openQuestionCount: 0
        },
        recent: []
      },
      readyExecutionSummary: { count: 0, top: [] },
      readyImprovementsSummary: { count: 0, top: [] },
      proposedExecutionSummary: { count: 0, top: [] },
      proposedImprovementsSummary: { count: 0, top: [] },
      transcriptChurnResearchSummary: { count: 0, top: [] },
      wishlistSummary: { count: 0, top: [] }
    }
  });
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-accept"/);
  assert.match(html, /data-wc-action="plan-artifact-finalize"/);
  assert.match(html, /data-plan-id="plan-ready-to-finalize"/);
  assert.match(html, /data-plan-version="4"/);
});

test("renderDashboardRootInnerHtml blocks PlanArtifact accept with blockers or open questions", () => {
  const baseData = {
    workspaceStatus: { activeFocus: "Planning" },
    stateSummary: { proposed: 0, ready: 0, in_progress: 0, completed: 0, total: 0 },
    planningSession: null,
    readyExecutionSummary: { count: 0, top: [] },
    readyImprovementsSummary: { count: 0, top: [] },
    proposedExecutionSummary: { count: 0, top: [] },
    proposedImprovementsSummary: { count: 0, top: [] },
    transcriptChurnResearchSummary: { count: 0, top: [] },
    wishlistSummary: { count: 0, top: [] }
  };

  const blockerHtml = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      ...baseData,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-review-blocked",
          planRef: "plan-artifact:plan-review-blocked",
          title: "Reviewed plan with blockers",
          status: "reviewed",
          planningType: "change",
          version: 5,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 1,
          openQuestionCount: 0,
          reviewFindings: [{ severity: "error", message: "Resolve this before accept" }]
        },
        recent: []
      }
    }
  });
  const blockerButton = blockerHtml.match(/<button[^>]+data-wc-action="plan-artifact-accept"[^>]*>/)?.[0] ?? "";
  assert.match(blockerButton, /disabled/);
  assert.match(blockerHtml, /Review blockers must be resolved before accepting this plan/);

  const openQuestionsHtml = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      ...baseData,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-open-questions",
          planRef: "plan-artifact:plan-open-questions",
          title: "Reviewed plan with questions",
          status: "reviewed",
          planningType: "change",
          version: 6,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 1,
          openQuestionCount: 1,
          reviewFindings: []
        },
        recent: []
      }
    }
  });
  const openQuestionsButton = openQuestionsHtml.match(/<button[^>]+data-wc-action="plan-artifact-accept"[^>]*>/)?.[0] ?? "";
  assert.match(openQuestionsButton, /disabled/);
  assert.match(openQuestionsHtml, /Open questions must be resolved or deferred before accepting this plan/);
});

test("renderDashboardRootInnerHtml shows resume action for needs-revision current plans", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      workspaceStatus: { activeFocus: "Planning" },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, completed: 0, total: 0 },
      planningSession: null,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-needs-revision",
          planRef: "plan-artifact:plan-needs-revision",
          title: "Needs revision plan",
          status: "reviewed",
          lifecycleStatus: "needs_revision",
          planningType: "change",
          version: 8,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 3,
          blockerCount: 2,
          warningCount: 1,
          openQuestionCount: 0,
          profile: "minimal",
          phaseRecommendation: "Phase 139",
          sourceIdeaId: "I-plan-99",
          reviewSummary: "2 blocker(s), 1 warning(s)"
        },
        recent: []
      },
      readyExecutionSummary: { count: 0, top: [] },
      readyImprovementsSummary: { count: 0, top: [] },
      proposedExecutionSummary: { count: 0, top: [] },
      proposedImprovementsSummary: { count: 0, top: [] },
      transcriptChurnResearchSummary: { count: 0, top: [] },
      wishlistSummary: { count: 0, top: [] }
    }
  });
  assert.match(html, /Needs Revision/);
  assert.match(html, /Review Summary/);
  assert.match(html, /2 blocker\(s\), 1 warning\(s\)/);
  assert.match(html, /data-wc-action="plan-artifact-resume"/);
  assert.match(html, /data-idea-id="I-plan-99"/);
  assert.match(html, />Resume planning &rarr;<\/button>/);
});

test("renderDashboardRootInnerHtml hides PlanArtifact lifecycle actions after finalize", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      workspaceStatus: { activeFocus: "Planning" },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, completed: 0, total: 0 },
      planningSession: null,
      planArtifact: {
        count: 1,
        current: {
          planId: "plan-finalized",
          planRef: "plan-artifact:plan-finalized",
          title: "Finalized plan",
          status: "finalized",
          planningType: "change",
          version: 7,
          updatedAt: "2026-05-27T17:00:00.000Z",
          wbsRowCount: 2,
          openQuestionCount: 0,
          reviewFindings: []
        },
        recent: []
      },
      readyExecutionSummary: { count: 0, top: [] },
      readyImprovementsSummary: { count: 0, top: [] },
      proposedExecutionSummary: { count: 0, top: [] },
      proposedImprovementsSummary: { count: 0, top: [] },
      transcriptChurnResearchSummary: { count: 0, top: [] },
      wishlistSummary: { count: 0, top: [] }
    }
  });
  assert.match(html, /Finalized/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-accept"/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-finalize"/);
});

test("renderDashboardRootInnerHtml renders phase roster deliverables inline edit affordances", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 0, proposed: 0, blocked: 0, done: 0 },
      systemStatus: {
        phase: {
          currentKitPhase: "95",
          canonicalPhaseKey: "95",
          phaseCatalog: {
            supported: true,
            phases: [
              { phaseKey: "94", shortDescription: "Wrap release", inCatalog: true },
              { phaseKey: "95", shortDescription: "Queue UX polish", inCatalog: true },
              { phaseKey: "96", shortDescription: null, inCatalog: false }
            ]
          }
        }
      }
    }
  });

  assert.match(html, /Phase Roster/);
  const planningPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="planning"');
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const planningPanel = html.slice(planningPanelIdx, html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"'));
  const overviewPanel = html.slice(overviewPanelIdx, planningPanelIdx);
  assert.match(planningPanel, /Phase Roster/);
  assert.doesNotMatch(overviewPanel, /Phase Roster/);
  assert.match(html, /dash-phase-roster-col-phase/);
  assert.match(html, /dash-phase-roster-phase-link/);
  assert.match(html, /data-wc-action="open-queue-for-phase"/);
  assert.match(html, /data-wc-phase-key="95"/);
  assert.match(html, /dash-phase-roster-col-status/);
  assert.match(html, /dash-phase-roster-col-actions/);
  assert.match(html, /data-wc-action="phase-roster-start"/);
  assert.doesNotMatch(html, />Current<\/button>/);
  assert.match(html, /dash-phase-roster-start-spacer/);
  assert.match(html, /data-wc-action="phase-deliverables-edit"/);
  assert.match(html, /dash-phase-edit-anchor/);
  assert.match(html, /dash-phase-roster-status-inner/);
  assert.match(html, /dash-phase-roster-actions/);
  assert.match(html, /Register Phase<\/button>/);
  assert.doesNotMatch(html, /Register Phase\.<\/button>/);
  assert.doesNotMatch(html, /Register future phase/);
  assert.match(html, /dash-phase-deliverables-input/);
  assert.match(html, /data-wc-phase-row="95"/);
  assert.match(html, /aria-label="Edit deliverables for phase 95"/);
  assert.match(html, /dash-phase-deliverables-cell/);
  assert.match(html, /dash-phase-deliverables-body/);
  assert.match(html, /dash-phase-catalog-hint/);
  assert.doesNotMatch(html, /<label[^>]*dash-phase-deliverables-editor/);
});

test("renderDashboardRootInnerHtml queue phase buckets show read-only roster deliverables", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 1, in_progress: 0, blocked: 0, completed: 0 },
      systemStatus: {
        phase: {
          currentKitPhase: "100",
          nextKitPhase: "101",
          phaseCatalog: {
            supported: true,
            phases: [
              {
                phaseKey: "100",
                shortDescription: "Extension & human visibility",
                inCatalog: true
              }
            ]
          }
        }
      },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [],
        phaseBuckets: [
          {
            schemaVersion: 1,
            phaseKey: "100",
            label: "Phase 100 (current) (1)",
            count: 1,
            top: [{ id: "T100001", title: "Ship it", phase: "Phase 100" }],
            taskIds: ["T100001"]
          }
        ]
      },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101", activeFocus: "Test" },
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });

  assert.match(html, /phase-bucket-summary-deliverables/);
  assert.match(html, /Extension &amp; human visibility/);
  assert.match(html, /wc-phase-tag-current/);
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  assert.ok(taskEnginePanelIdx >= 0 && statusPanelIdx > taskEnginePanelIdx);
  const queueHtml = html.slice(taskEnginePanelIdx, statusPanelIdx);
  assert.doesNotMatch(queueHtml, /dash-phase-deliverables--bucket/);
  assert.doesNotMatch(queueHtml, /phase-deliverables-edit/);
});

test("renderDashboardRootInnerHtml renders redesigned queue task rows with chips and summary", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 2, proposed: 1, blocked: 0, done: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyExecutionSummary: {
        schemaVersion: 1,
        count: 2,
        top: [
          {
            id: "T100284",
            title: "Row format fallback title",
            summary: "Render redesigned queue rows",
            priority: "P1",
            severity: "high",
            components: ["queue", "dashboard"],
            features: ["phase-filter"],
            featureDetails: [{ slug: "phase-filter", name: "Phase Filter", componentId: "queue", componentDisplayName: "Queue" }],
            phase: "Phase 95"
          },
          {
            id: "T100285",
            title: "Partial row still renders",
            phase: null
          }
        ],
        phaseBuckets: []
      },
      proposedExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "T100286", title: "Proposed row", priority: "P2", severity: "medium", features: ["task-comments"] }],
        phaseBuckets: []
      },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openPage: 0, openPageSize: 10, openTotalPages: 0, openTop: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 2 },
      executionPlanningScope: "tasks-only",
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-05-14T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "95", nextKitPhase: "96", activeFocus: "Queue redesign" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });

  assert.match(html, /dash-task-row-id">T100284</);
  assert.match(html, /dash-task-chip-priority">P1</);
  assert.match(html, /dash-task-chip-severity">high</);
  assert.match(html, /dash-task-chip-component">queue</);
  assert.match(html, /dash-task-chip-feature">phase-filter</);
  assert.match(html, /dash-task-row-summary" title="Render redesigned queue rows">Render redesigned queue rows</);
  assert.match(html, /dash-task-row-id">T100285</);
  assert.doesNotMatch(html, /unknown/);
  assert.match(html, /dash-task-row-id">T100286</);
  assert.match(html, /dash-task-chip-feature">task-comments</);
  assert.match(html, /aria-label="Set phase for task T100284"/);
  assert.match(html, /aria-label="View task details for T100284"/);
  assert.match(html, /aria-label="View Comments for task T100284"/);
  assert.match(html, /aria-label="Add Comment for task T100284"/);
});

test("renderDashboardRootInnerHtml places Phase Readiness under WC Agent shell, not in Queue or CAE tab", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 2, proposed: 1, blocked: 1, completed: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
      blockedSummary: { count: 1, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openPage: 0, openPageSize: 10, openTotalPages: 0, openTop: [] },
      readyQueueTop: [],
      readyQueueCount: 2,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 1, other: 1 },
      executionPlanningScope: "tasks-only",
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-05-14T00:00:00.000Z",
      workspaceStatus: {
        currentKitPhase: "95",
        nextKitPhase: "96",
        activeFocus: "Readiness move",
        blockers: ["Waiting on review"],
        pendingDecisions: ["Pick release lane"]
      },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });

  const agentIdx = html.indexOf("dash-agent-status-banner");
  const readinessIdx = html.indexOf("Phase Readiness · Phase");
  const tabBarIdx = html.indexOf('class="wc-tab-bar"');
  const queueTabIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const caeTabIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="cae"');
  assert.ok(agentIdx !== -1 && readinessIdx > agentIdx);
  assert.ok(tabBarIdx !== -1 && tabBarIdx < readinessIdx);
  assert.ok(queueTabIdx !== -1 && readinessIdx < queueTabIdx);
  assert.ok(caeTabIdx !== -1 && readinessIdx < caeTabIdx);
  assert.match(
    html,
    /<div class="wc-tab-panel" data-wc-tab="cae"[\s\S]*Phase Readiness is under <b>WC Agent<\/b>/
  );
});

test("renderDashboardRootInnerHtml renders embedded CAE panel markup when provided", () => {
  const embedded = '<section class="gp-root"><nav class="gp-tabs"><button data-gp-tab="overview" class="is-active">Overview</button></nav><section class="gp-tab-panel is-active" data-gp-panel="overview">Embedded CAE</section></section>';
  const html = renderDashboardRootInnerHtml(
    {
      ok: true,
      data: {
        stateSummary: { ready: 1, proposed: 0, blocked: 0, completed: 0 },
        readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        readyExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
        proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        blockedSummary: { count: 0, top: [], phaseBuckets: [] },
        transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openPage: 0, openPageSize: 10, openTotalPages: 0, openTop: [] },
        readyQueueTop: [],
        readyQueueCount: 1,
        readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 1 },
        executionPlanningScope: "tasks-only",
        suggestedNext: null,
        planningSession: null,
        taskStoreLastUpdated: "2026-05-14T00:00:00.000Z",
        workspaceStatus: { currentKitPhase: "95", nextKitPhase: "96", activeFocus: "Embed CAE" },
        blockingAnalysis: [],
        dependencyOverview: deliverTestDepOverview
      }
    },
    null,
    null,
    null,
    embedded
  );

  assert.match(html, /data-wc-tab="cae"[\s\S]*<section class="gp-root">/);
  assert.match(html, /Embedded CAE/);
  assert.doesNotMatch(html, /Embedded CAE panel unavailable; use the Guidance panel as fallback/);
});

test("embedded and standalone CAE surfaces avoid duplicate DOM ids", () => {
  const caePayload = {
    ok: true,
    data: {
      readiness: { canMutate: true, issues: [] },
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      validation: { ok: true },
      activeVersion: { isActive: true, versionId: "v1", artifactCount: 1, activationCount: 1, createdAt: "2026-05-14T00:00:00.000Z" },
      counts: {
        artifactStatuses: { active: 1 },
        activationStatuses: { draft: 0 },
        activationFamilies: { policy: 1, think: 0, do: 0, review: 0 },
        recentMutationCount: 0
      },
      recentMutations: { count: 0, rows: [] },
      validationWarnings: [],
      artifacts: { rows: [] },
      activations: { rows: [] },
      previewExamples: [],
      portability: {},
      audit: { rows: [] },
      workspaceArtifactMarkdownTemplates: []
    }
  };

  const embedded = renderGuidanceAuthoringPanelInnerHtml(caePayload);
  const dashboardHtml = renderDashboardRootInnerHtml(
    {
      ok: true,
      data: {
        stateSummary: { ready: 1, proposed: 0, blocked: 0, completed: 0 },
        readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        readyExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
        proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        blockedSummary: { count: 0, top: [], phaseBuckets: [] },
        transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openPage: 0, openPageSize: 10, openTotalPages: 0, openTop: [] },
        readyQueueTop: [],
        readyQueueCount: 1,
        readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 1 },
        executionPlanningScope: "tasks-only",
        suggestedNext: null,
        planningSession: null,
        taskStoreLastUpdated: "2026-05-14T00:00:00.000Z",
        workspaceStatus: { currentKitPhase: "95", nextKitPhase: "96", activeFocus: "Embed CAE" },
        blockingAnalysis: [],
        dependencyOverview: deliverTestDepOverview
      }
    },
    null,
    null,
    null,
    embedded
  );

  const standaloneHtml = renderGuidanceAuthoringPanelInnerHtml(caePayload);
  const allIds = [...dashboardHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const standaloneIds = [...standaloneHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(allIds.some((id) => id.startsWith("dash-cae-gp-")));
  assert.doesNotMatch(dashboardHtml, /<script>[\s\S]*data-wc-cae-injected/);
  assert.doesNotMatch(dashboardHtml, /wc-dash-cae-host[\s\S]*<script>/);
  for (const sid of standaloneIds) {
    assert.ok(!allIds.includes(sid), `expected embedded surface to namespace id ${sid}`);
  }
});

test("renderDashboardRootInnerHtml includes phase journal controls when bundle provided", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const bundle = {
    listPhaseNotes: {
      ok: true,
      code: "phase-notes-listed",
      data: {
        phaseKey: "87",
        phaseKeySource: "workspace-status",
        notes: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            phaseKey: "87",
            phaseLabel: null,
            taskId: null,
            noteType: "task-suggestion",
            summary: "Ship the dashboard phase journal card",
            details: null,
            status: "active",
            priority: "normal",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
            expiresAt: null,
            supersededBy: null,
            convertedTaskId: null,
            idempotencyKey: null,
            refs: []
          },
          {
            id: "660e8400-e29b-41d4-a716-446655440001",
            phaseKey: "87",
            phaseLabel: null,
            taskId: null,
            noteType: "risk",
            summary: "Critical dependency",
            details: null,
            status: "active",
            priority: "critical",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
            expiresAt: null,
            supersededBy: null,
            convertedTaskId: null,
            idempotencyKey: null,
            refs: []
          }
        ],
        count: 2
      }
    },
    getPhaseContext: {
      ok: true,
      code: "phase-context",
      data: {
        phaseKey: "87",
        phaseKeySource: "workspace-status",
        notes: [],
        count: 0
      }
    }
  };
  const html = renderDashboardRootInnerHtml(fixture, null, null, bundle);
  assert.match(html, /dash-phase-notes/);
  assert.match(html, /phase-note-add/);
  assert.match(html, />New<\/button>/);
  assert.match(html, /phase-note-view/);
  assert.match(html, /phase-note-edit/);
  assert.match(html, /phase-note-delete/);
  assert.match(html, /phase-note-convert/);
  assert.match(html, /550e8400-e29b-41d4-a716-446655440000/);
  assert.match(html, /Ship the dashboard phase journal card/);
  assert.doesNotMatch(html, /Journal entries scoped to the workspace current phase/);
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  assert.ok(overviewPanelIdx >= 0 && taskEnginePanelIdx > overviewPanelIdx && statusPanelIdx > taskEnginePanelIdx);
  const overviewPanel = html.slice(overviewPanelIdx, taskEnginePanelIdx);
  const taskEnginePanel = html.slice(taskEnginePanelIdx, statusPanelIdx);
  assert.doesNotMatch(overviewPanel, /dash-phase-notes/);
  assert.match(taskEnginePanel, /dash-phase-notes/);
  assert.doesNotMatch(html, /upsert-phase-catalog-entry/);
});

test("renderDashboardRootInnerHtml renders editor integration state when provided", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture, null, {
    appName: "Visual Studio Code",
    uriScheme: "vscode",
    ideKind: "vscode",
    chatPrefill: {
      label: "VS Code Chat",
      canPrefillDirectly: true,
      externalCursorDeeplink: false
    }
  });

  assert.match(html, /dash-editor-integration/);
  assert.match(html, /<b>Editor<\/b> Visual Studio Code/);
  assert.match(html, /<code>vscode<\/code>/);
  assert.match(html, /<b>Chat prefill<\/b> VS Code Chat/);
  assert.match(html, /cursor URL disabled/);
  assert.doesNotMatch(html, /<section class="dash-card dash-editor-integration"/);
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  assert.ok(overviewPanelIdx >= 0 && taskEnginePanelIdx > overviewPanelIdx && statusPanelIdx > taskEnginePanelIdx);
  const overviewPanel = html.slice(overviewPanelIdx, taskEnginePanelIdx);
  const statusPanel = html.slice(statusPanelIdx, configPanelIdx);
  assert.doesNotMatch(overviewPanel, /dash-editor-integration|Chat prefill|VS Code Chat/);
  assert.match(statusPanel, /dash-status-editor-integration[\s\S]*dash-editor-integration--embedded/);
  assert.match(statusPanel, /<b>Chat prefill<\/b> VS Code Chat/);
});

test("renderDashboardRootInnerHtml renders MCP status on Status tab when provided", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture, null, null, null, null, {
    mcpStatus: {
      schemaVersion: 1,
      availability: "not_configured",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: "/tmp/wc-workspace",
      configSource: "none",
      setupSnippet: "{}",
      guidance: ["Use CLI until MCP is configured."]
    }
  });

  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  const statusPanel = html.slice(statusPanelIdx, configPanelIdx);
  assert.match(statusPanel, /dash-status-mcp/);
  assert.match(statusPanel, /data-wc-mcp-status="not_configured"/);
  assert.match(statusPanel, /CLI fallback/);
});

test("renderDashboardRootInnerHtml renders escaped WC Agent status banner from agentStatus", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentStatus: {
        schemaVersion: 1,
        source: "derived",
        kind: "working_task",
        label: "Working on Task T123 <script>",
        confidence: "medium",
        updatedAt: "2026-05-06T00:00:00.000Z",
        taskId: "T123"
      },
      agentActivitySummary: {
        schemaVersion: 1,
        generatedAt: "2026-05-06T00:00:00.000Z",
        source: "derived_only",
        activeCount: 1,
        staleCount: 0,
        needsAttentionCount: 0,
        main: null,
        active: [],
        needsAttention: [],
        inferredFallback: {
          schemaVersion: 1,
          source: "derived",
          kind: "working_task",
          label: "Working on Task T123 <script>",
          confidence: "medium",
          updatedAt: "2026-05-06T00:00:00.000Z",
          taskId: "T123"
        },
        sourceMap: {
          liveActivityCount: 0,
          teamExecutionCount: 0,
          subagentSessionCount: 0,
          derivedFallbackUsed: true
        }
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 1, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /dash-agent-activity-row--fallback/);
  assert.match(html, /Working on Task T123 &lt;script&gt;/);
  assert.match(html, /dash-agent-row/);
  assert.match(html, /aria-label="Inferred agent activity"/);
  assert.match(html, /Task T123/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderDashboardRootInnerHtml renders many agent and subagent rows", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentStatus: {
        schemaVersion: 1,
        source: "live_activity",
        kind: "working_task",
        label: "Working on Task T700",
        confidence: "high",
        updatedAt: "2026-05-06T00:00:00.000Z",
        taskId: "T700",
        phaseKey: "95"
      },
      agentActivitySummary: {
        schemaVersion: 1,
        generatedAt: "2026-05-06T00:00:00.000Z",
        source: "mixed",
        activeCount: 3,
        staleCount: 0,
        needsAttentionCount: 0,
        main: {
          schemaVersion: 1,
          rowId: "main-agent",
          displayName: "Main Agent",
          role: "orchestrator",
          source: "live_activity",
          sourceConfidence: "high",
          status: "working_task",
          statusLabel: "Working on Task T700",
          work: {
            taskId: "T700",
            title: "Working on Task T700",
            command: null,
            phaseKey: "95",
            taskStatus: "in_progress",
            assignmentId: null,
            sessionId: null,
            currentStep: null
          },
          refs: {
            activityId: "act-1",
            agentId: "main-agent",
            sessionId: null,
            assignmentId: null,
            agentDefinitionId: null,
            subagentDefinitionId: null,
            taskId: "T700",
            prNumber: null
          },
          freshness: {
            updatedAt: "2026-05-06T00:00:00.000Z",
            startedAt: null,
            expiresAt: null,
            state: "fresh"
          },
          attention: {
            state: "none",
            message: null
          }
        },
        active: [
          {
            schemaVersion: 1,
            rowId: "subagent-S1",
            displayName: "test-subagent",
            role: "subagent",
            source: "subagent_registry",
            sourceConfidence: "high",
            status: "working_task",
            statusLabel: "Working on subagent task",
            work: {
              taskId: "T702",
              title: "Subagent Task Title",
              command: null,
              phaseKey: null,
              taskStatus: "in_progress",
              assignmentId: null,
              sessionId: "S1",
              currentStep: null
            },
            refs: {
              activityId: null,
              agentId: null,
              sessionId: "S1",
              assignmentId: null,
              agentDefinitionId: null,
              subagentDefinitionId: "test-subagent",
              taskId: "T702",
              prNumber: null
            },
            freshness: {
              updatedAt: "2026-05-06T00:02:00.000Z",
              startedAt: null,
              expiresAt: null,
              state: "fresh"
            },
            attention: {
              state: "none",
              message: null
            }
          },
          {
            schemaVersion: 1,
            rowId: "team-T701",
            displayName: "tab-2",
            role: "task_worker",
            source: "team_execution",
            sourceConfidence: "high",
            status: "working_task",
            statusLabel: "Assigned team task",
            work: {
              taskId: "T701",
              title: "Review dashboard rows",
              command: null,
              phaseKey: null,
              taskStatus: "in_progress",
              assignmentId: "T701",
              sessionId: null,
              currentStep: null
            },
            refs: {
              activityId: null,
              agentId: null,
              sessionId: null,
              assignmentId: "T701",
              agentDefinitionId: null,
              subagentDefinitionId: null,
              taskId: "T701",
              prNumber: null
            },
            freshness: {
              updatedAt: "2026-05-06T00:01:00.000Z",
              startedAt: null,
              expiresAt: null,
              state: "fresh"
            },
            attention: {
              state: "none",
              message: null
            }
          }
        ],
        needsAttention: [],
        inferredFallback: null,
        sourceMap: {
          liveActivityCount: 1,
          teamExecutionCount: 1,
          subagentSessionCount: 1,
          derivedFallbackUsed: false
        }
      },
      teamExecution: {
        schemaVersion: 1,
        available: true,
        totalCount: 1,
        activeCount: 1,
        byStatus: { assigned: 1, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
        topActive: [
          {
            executionTaskId: "T701",
            executionTaskTitle: "Review dashboard rows",
            supervisorId: "operator",
            workerId: "tab-2",
            status: "assigned",
            updatedAt: "2026-05-06T00:01:00.000Z"
          }
        ]
      },
      subagentRegistry: {
        schemaVersion: 1,
        available: true,
        definitionsCount: 1,
        retiredDefinitionsCount: 0,
        openSessionsCount: 1,
        topOpenSessions: [
          {
            sessionId: "S1",
            definitionId: "test-subagent",
            executionTaskId: "T702",
            status: "open",
            updatedAt: "2026-05-06T00:02:00.000Z"
          }
        ]
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 1, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "95", nextKitPhase: "96", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /Working on Task T700/);
  assert.match(html, /tab-2/);
  assert.match(html, /Review dashboard rows/);
  assert.match(html, /test-subagent/);
  assert.match(html, /dash-agent-activity-row--active/);
  assert.match(html, /aria-label="test-subagent, Working, Active Agent"/);
});

test("renderDashboardRootInnerHtml team execution empty state offers create assignment", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      teamExecution: {
        schemaVersion: 1,
        available: true,
        totalCount: 0,
        activeCount: 0,
        byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
        topActive: []
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /team-assignment-register/);
  assert.match(html, /team-execution-chat/);
  assert.match(html, /Create assignment/);
  assert.match(html, /No active assignments yet/);
});

test("renderDashboardRootInnerHtml team execution row exposes handoff and reconcile actions", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      teamExecution: {
        schemaVersion: 1,
        available: true,
        totalCount: 2,
        activeCount: 2,
        byStatus: { assigned: 1, submitted: 1, blocked: 0, reconciled: 0, cancelled: 0 },
        topActive: [
          {
            id: "a1",
            executionTaskId: "T701",
            executionTaskTitle: "Review dashboard rows",
            supervisorId: "operator",
            workerId: "tab-2",
            status: "assigned",
            updatedAt: "2026-05-06T00:01:00.000Z"
          },
          {
            id: "a2",
            executionTaskId: "T702",
            executionTaskTitle: "Ship handoff",
            supervisorId: "operator",
            workerId: "tab-3",
            status: "submitted",
            updatedAt: "2026-05-06T00:02:00.000Z"
          }
        ]
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /team-assignment-handoff/);
  assert.match(html, /team-assignment-reconcile/);
  assert.match(html, /data-assignment-id="a1"/);
  assert.match(html, /data-assignment-id="a2"/);
});

test("renderDashboardRootInnerHtml subagent registry empty state shows guide and definitions", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      subagentRegistry: {
        schemaVersion: 1,
        available: true,
        definitionsCount: 1,
        retiredDefinitionsCount: 0,
        openSessionsCount: 0,
        definitions: [
          {
            id: "reviewer",
            displayName: "Code Reviewer",
            description: "Reviews code changes and gives feedback.",
            allowedCommands: ["git", "node"],
            retired: false
          }
        ],
        topOpenSessions: []
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.doesNotMatch(html, /subagent-registry-chat/);
  assert.doesNotMatch(html, /Registry Guide/);
  assert.match(html, /No active subagent sessions/);
  assert.match(html, /Code Reviewer/);
  assert.match(html, /Reviews code changes/);
  assert.match(html, /dash-subagent-cmd-pill/);
  assert.match(html, /git/);
  assert.match(html, /node/);
  assert.doesNotMatch(html, /subagent-register/);
  assert.doesNotMatch(html, /Register role/);
});

test("renderDashboardRootInnerHtml subagent registry row is read-only", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      subagentRegistry: {
        schemaVersion: 1,
        available: true,
        definitionsCount: 1,
        retiredDefinitionsCount: 0,
        openSessionsCount: 1,
        topOpenSessions: [
          {
            sessionId: "sess-1111-2222-3333-4444",
            definitionId: "reviewer",
            executionTaskId: "T801",
            status: "open",
            updatedAt: "2026-05-06T00:03:00.000Z"
          }
        ]
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.doesNotMatch(html, /subagent-session-close/);
  assert.doesNotMatch(html, /Close session/);
  assert.match(html, /sess-111/);
  assert.match(html, /reviewer/);
  assert.match(html, /T801/);
});

test("renderDashboardRootInnerHtml task checkpoints empty state offers snapshot actions", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      taskCheckpoints: {
        schemaVersion: 1,
        available: true,
        totalCount: 0,
        topRecent: []
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /checkpoint-create-head/);
  assert.match(html, /checkpoint-recovery-chat/);
  assert.match(html, /Snapshot HEAD/);
  assert.match(html, /No checkpoints yet/);
});

test("renderDashboardRootInnerHtml task checkpoint row exposes compare and rewind", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      taskCheckpoints: {
        schemaVersion: 1,
        available: true,
        totalCount: 1,
        topRecent: [
          {
            id: "ckpt_test_001",
            taskId: "T901",
            label: "before refactor",
            refKind: "head",
            createdAt: "2026-05-06T00:04:00.000Z",
            gitHeadSha: "abc123def456"
          }
        ]
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /checkpoint-compare/);
  assert.match(html, /checkpoint-rewind/);
  assert.match(html, /data-checkpoint-id="ckpt_test_001"/);
  assert.match(html, /before refactor/);
});

test("renderDashboardRootInnerHtml omits policy approval inbox section", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      approvalQueue: {
        schemaVersion: 1,
        count: 1,
        top: [
          {
            id: "T100050",
            title: "Improve dashboard policy UX",
            status: "ready",
            phaseKey: "100",
            priority: "P2"
          }
        ],
        policyArtifacts: [
          {
            relativePath: "kit_approval_decisions",
            role: "decisions"
          }
        ]
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      workspaceStatus: { currentKitPhase: "100" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.doesNotMatch(html, /dashboard-approvals/);
  assert.doesNotMatch(html, /Policy Approval Inbox/);
  assert.doesNotMatch(html, /approval-review-accept/);
});


test("renderDashboardRootInnerHtml omits global suggested-next when no workspace current phase", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentGuidance: {
        schemaVersion: 1,
        profileSetId: "rpg_party_v1",
        tier: 3,
        displayLabel: "Bard",
        usingDefaultTier: false,
        temperamentProfileId: "builtin:cautious",
        temperamentLabel: "The Wary Scout"
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: { id: "T999", title: "Would have been suggested" },
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /wc-rec-next-pick-phase/);
  assert.match(html, /Start Phase 2/);
  assert.doesNotMatch(html, /T999/);
  assert.match(html, />No Items</);
  assert.doesNotMatch(html, /data-wc-action="planning-new-plan"/);
  assert.doesNotMatch(html, /data-wc-action="planning-resume-chat"/);
  assert.match(html, /<span class="wc-status-kv-label">Role<\/span><span class="wc-status-kv-val">Bard<\/span>/);
  assert.match(html, /<span class="wc-status-kv-label">Temperament<\/span><span class="wc-status-kv-val">The Wary Scout<\/span>/);
  assert.doesNotMatch(html, /wc-ready-scope-note/);
  assert.doesNotMatch(html, /wishlist_intake/);
  assert.doesNotMatch(html, /Wishlist intake rows are excluded/);
  assert.doesNotMatch(html, /wk run list-tasks/);
});

test("renderDashboardRootInnerHtml keeps dashboard copy compact", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture, null, {
    appName: "Visual Studio Code",
    uriScheme: "vscode",
    ideKind: "vscode",
    chatPrefill: {
      label: "VS Code Chat",
      canPrefillDirectly: true,
      externalCursorDeeplink: false
    }
  });
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  const htmlForCompact = configPanelIdx >= 0 ? html.slice(0, configPanelIdx) : html;
  const longTitles = extractParagraphBoldTitles(htmlForCompact).filter((title) => title.length > 32);
  const longMuted = extractMutedParagraphs(htmlForCompact).filter((text) => text.length > 120);
  assert.deepEqual(longTitles, []);
  assert.deepEqual(longMuted, []);
});

test("renderUpNextCardHtml recommends wishlist when in phase without delivery snapshot", () => {
  const html = renderUpNextCardHtml({
    ws: { currentKitPhase: "1", nextKitPhase: "2" },
    phaseSnapshot: null,
    suggestedNext: null,
    readyTop: [],
    readyCount: 0,
    firstWishlistOpen: { id: "W-open-1", title: "Wishlist backlog item", taskId: "T-wl-1" },
    humanGatesCount: 0
  });
  assert.match(html, /wc-rec-next-wishlist/);
  assert.match(html, /Wishlist backlog item/);
});

test("renderDashboardRootInnerHtml recommends wishlist when execution ready queue is empty", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentGuidance: {
        schemaVersion: 1,
        profileSetId: "rpg_party_v1",
        tier: 3,
        displayLabel: "Bard",
        usingDefaultTier: false,
        temperamentProfileId: "builtin:cautious",
        temperamentLabel: "The Wary Scout"
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: {
        openCount: 1,
        totalCount: 1,
        openTop: [{ id: "W-open-1", title: "Wishlist backlog item", taskId: "T-wl-1" }]
      },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      currentPhaseDelivery: {
        schemaVersion: 2,
        phaseKey: "1",
        closeoutPassed: false,
        released: false,
        remainingCount: 2,
        terminalCount: 0,
        checkedTaskCount: 2,
        queue: { ready: 0, proposed: 2, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 2,
          blocked: 0,
          research: 0
        },
        progressPercent: 0,
        releaseReadyPercent: 0,
        deliveryEvidenceViolationCount: 0
      },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /wc-rec-next-phase-work/);
  assert.match(html, /Continue Phase 1 delivery work/);
  assert.doesNotMatch(html, /wc-rec-next-wishlist/);
});

test("renderDashboardRootInnerHtml prefers first ready task over wishlist when both exist", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentGuidance: {
        schemaVersion: 1,
        profileSetId: "rpg_party_v1",
        tier: 3,
        displayLabel: "Bard",
        usingDefaultTier: false,
        temperamentProfileId: "builtin:cautious",
        temperamentLabel: "The Wary Scout"
      },
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "imp-1", title: "Ready improvement task", phase: "Phase 9" }]
      },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      suggestedNext: {
        id: "imp-1",
        title: "Ready improvement task",
        phase: "Phase 9",
        phaseKey: "9",
        type: "improvement"
      },
      wishlist: {
        enabled: true,
        openCount: 1,
        totalCount: 1,
        openTop: [{ id: "W-priority", title: "Process wishlist first", taskId: "T-wl-2" }]
      },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "9", nextKitPhase: "10", activeFocus: "Test" },
      currentPhaseDelivery: {
        schemaVersion: 2,
        phaseKey: "9",
        closeoutPassed: false,
        released: false,
        remainingCount: 1,
        terminalCount: 0,
        checkedTaskCount: 1,
        queue: { ready: 1, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 1,
          proposed: 0,
          blocked: 0,
          research: 0
        },
        progressPercent: 0,
        releaseReadyPercent: 0,
        deliveryEvidenceViolationCount: 0
      },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /wc-rec-next/);
  assert.doesNotMatch(html, /wc-rec-next-wishlist/);
  assert.match(html, /Ready improvement task/);
  assert.match(html, /data-task-id="imp-1"/);
  assert.match(html, /Process wishlist first/);
});

const phaseSnapshotDrained = {
  phaseKey: "108",
  closeoutPassed: true,
  released: false,
  remainingCount: 0,
  terminalCount: 3,
  checkedTaskCount: 3,
  queue: { ready: 0, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
  segments: {
    completed: 3,
    cancelled: 0,
    inProgress: 0,
    ready: 0,
    proposed: 0,
    blocked: 0,
    research: 0
  },
  progressPercent: 100,
  releaseReadyPercent: 100,
  deliveryEvidenceViolationCount: 0
};

test("dashboardRowPhaseKey and pickNextTaskInCurrentPhase prefer current phase rows", () => {
  assert.equal(dashboardRowPhaseKey({ phaseKey: "108" }), "108");
  assert.equal(dashboardRowPhaseKey({ phase: "Phase 109" }), "109");
  const picked = pickNextTaskInCurrentPhase(
    [
      { id: "T2", title: "Other", phaseKey: "109" },
      { id: "T1", title: "Current", phaseKey: "108" }
    ],
    "108"
  );
  assert.equal((picked).id, "T1");
});

test("lookupDashboardTaskPhaseKey resolves ready and proposed rollups", () => {
  const data = {
    readyExecutionSummary: {
      phaseBuckets: [
        {
          phaseKey: "109",
          taskIds: ["T100406"],
          top: [{ id: "T100406", phaseKey: "109" }]
        }
      ]
    },
    proposedExecutionSummary: {
      phaseBuckets: [
        {
          phaseKey: "100",
          taskIds: ["T100405"],
          top: [{ id: "T100405", phaseKey: "100" }]
        }
      ]
    }
  };
  assert.equal(lookupDashboardTaskPhaseKey(data, "T100406"), "109");
  assert.equal(lookupDashboardTaskPhaseKey(data, "T100405"), "100");
});

test("lookupProposedTaskPhaseKey resolves from phase buckets and top rows", () => {
  const data = {
    proposedExecutionSummary: {
      phaseBuckets: [
        {
          phaseKey: "100",
          taskIds: ["T100405", "T100406"],
          top: [{ id: "T100405", phaseKey: "100" }]
        }
      ],
      top: [{ id: "T100407", phaseKey: "101" }]
    }
  };
  assert.equal(lookupProposedTaskPhaseKey(data, "T100405"), "100");
  assert.equal(lookupProposedTaskPhaseKey(data, "T100406"), "100");
  assert.equal(lookupProposedTaskPhaseKey(data, "T100407"), "101");
});

test("renderUpNextCardHtml puts View action inline without footer tags", () => {
  const html = renderUpNextCardHtml({
    ws: { currentKitPhase: "108", nextKitPhase: "109" },
    phaseSnapshot: null,
    suggestedNext: { id: "T501", title: "Ship the thing", phaseKey: "108" },
    readyTop: [{ id: "T501", title: "Ship the thing", phaseKey: "108" }],
    readyCount: 1,
    firstWishlistOpen: null,
    humanGatesCount: 0
  });
  assert.match(html, /wc-rec-title-row/);
  assert.match(html, /Ship the thing[\s\S]*data-wc-action="task-detail"/);
  assert.match(html, />View &rarr;<\/button>/);
  assert.doesNotMatch(html, /wc-rec-footer/);
  assert.doesNotMatch(html, /wc-rec-tag/);
});

test("renderUpNextCardHtml surfaces phase closeout when delivery queue is drained", () => {
  const html = renderUpNextCardHtml({
    ws: { currentKitPhase: "108", nextKitPhase: "109" },
    phaseSnapshot: phaseSnapshotDrained,
    suggestedNext: { id: "T-other", title: "Later phase", phaseKey: "109" },
    readyTop: [{ id: "T-other", title: "Later phase", phaseKey: "109" }],
    readyCount: 1,
    firstWishlistOpen: null,
    humanGatesCount: 0
  });
  assert.match(html, /wc-rec-next-closeout/);
  assert.match(html, /Complete &amp; Release/);
  assert.match(html, /wc-rec-title-row/);
  assert.doesNotMatch(html, /wc-rec-tag/);
  assert.doesNotMatch(html, /Later phase/);
  assert.doesNotMatch(html, /After merge and publish/);
});

test("renderPhaseCatalogOverviewSection omits action buttons on delivered roster row", () => {
  const html = renderPhaseCatalogOverviewSection(
    {
      currentKitPhase: "114",
      nextKitPhase: "115",
      phaseCatalog: {
        supported: true,
        phases: [
          { phaseKey: "113", shortDescription: "Shipped", inCatalog: true },
          { phaseKey: "114", shortDescription: "Active", inCatalog: true },
          { phaseKey: "115", shortDescription: "Next", inCatalog: true }
        ]
      }
    },
    { currentKitPhase: "114", nextKitPhase: "115" },
    ["113"],
    null
  );
  const deliveredRow =
    html.match(
      /<tbody>[\s\S]*?<tr>[\s\S]*?dash-phase-roster-actions--delivered[\s\S]*?<\/tr>/
    )?.[0] ?? "";
  assert.match(deliveredRow, /wc-phase-tag-delivered/);
  assert.doesNotMatch(deliveredRow, /data-wc-action="phase-roster-start"/);
  assert.doesNotMatch(deliveredRow, /data-wc-action="phase-deliverables-edit"/);
  assert.doesNotMatch(deliveredRow, /dash-phase-roster-start-spacer/);
});

test("renderPhaseCatalogOverviewSection merges rolledOutPhaseKeys for roster narrowing", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 0, proposed: 0, blocked: 0, done: 0 },
      workspaceStatus: { currentKitPhase: "114", nextKitPhase: "115" },
      deliveredPhaseKeys: [],
      rolledOutPhaseKeys: ["113"],
      systemStatus: {
        phase: {
          currentKitPhase: "114",
          nextKitPhase: "115",
          phaseCatalog: {
            supported: true,
            phases: [
              { phaseKey: "110", shortDescription: "Old", inCatalog: true },
              { phaseKey: "113", shortDescription: "Rolled", inCatalog: true },
              { phaseKey: "114", shortDescription: "Current", inCatalog: true },
              { phaseKey: "115", shortDescription: "Next", inCatalog: true }
            ]
          }
        }
      },
      currentPhaseDelivery: {
        schemaVersion: 2,
        phaseKey: "114",
        closeoutPassed: false,
        released: false,
        remainingCount: 0,
        terminalCount: 0,
        checkedTaskCount: 0,
        queue: { ready: 0, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 0,
          blocked: 0,
          research: 0
        },
        progressPercent: 0,
        releaseReadyPercent: 0,
        deliveryEvidenceViolationCount: 0
      }
    }
  });
  const roster = html.match(/<section id="wc-phase-roster"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(roster, /dash-phase-roster-actions--delivered/);
  assert.match(roster, /<code>113<\/code>/);
  assert.match(roster, /wc-phase-tag-delivered/);
  assert.match(roster, /<code>110<\/code>[\s\S]*wc-phase-tag-future/);
  assert.equal((roster.match(/dash-phase-roster-actions--delivered/g) ?? []).length, 1);
  assert.match(html, /dash-phase-roster-start-spacer/);
});

test("renderUpNextCardHtml shows Phase Released only when phase is released", () => {
  const html = renderUpNextCardHtml({
    ws: { currentKitPhase: "108", nextKitPhase: "109" },
    phaseSnapshot: { ...phaseSnapshotDrained, released: true },
    suggestedNext: null,
    readyTop: [],
    readyCount: 0,
    firstWishlistOpen: null,
    humanGatesCount: 0
  });
  assert.match(html, /wc-rec-next-phase-released/);
  assert.match(html, /Phase released!/);
  assert.match(html, /&#127881;/);
  assert.doesNotMatch(html, /Complete &amp; Release/);
  assert.doesNotMatch(html, /wc-rec-subtitle/);
  assert.doesNotMatch(html, /After merge and publish/);
});

test("renderUpNextCardHtml prompts to pick a phase when none is current", () => {
  const html = renderUpNextCardHtml({
    ws: { nextKitPhase: "109" },
    phaseSnapshot: null,
    suggestedNext: null,
    readyTop: [],
    readyCount: 0,
    firstWishlistOpen: null,
    humanGatesCount: 0
  });
  assert.match(html, /wc-rec-next-pick-phase/);
  assert.match(html, /Start Phase 109/);
  assert.doesNotMatch(html, /from the roster/);
  assert.doesNotMatch(html, /Set the workspace current phase/);
  assert.doesNotMatch(html, /wc-rec-tag-phase/);
  assert.doesNotMatch(html, /focus-phase-roster/);
  assert.match(html, /wc-rec-title-row/);
  assert.match(html, /data-wc-action="phase-roster-start"/);
});

const deliverTestDepOverview = {
  schemaVersion: 1,
  activeTaskCount: 0,
  includedTaskCount: 0,
  edgeCount: 0,
  truncated: false,
  perfNote: null,
  nodes: [],
  edges: [],
  mermaidFlowchart: "",
  criticalPathReady: []
};

function renderBrandDashboardHtml(overrides = {}) {
  const readyCount = overrides.readyCount ?? 2;
  const blockedCount = overrides.blockedCount ?? 0;
  return renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentStatus: {
        schemaVersion: 1,
        source: "live_activity",
        kind: overrides.agentKind ?? "active",
        label: overrides.agentLabel ?? "Running <operator> & checking",
        confidence: "high",
        updatedAt: "2026-06-05T12:00:00.000Z",
        taskId: "T100708",
        title: "Brand <dashboard> UX"
      },
      agentActivitySummary: {
        schemaVersion: 1,
        generatedAt: "2026-06-05T12:00:00.000Z",
        source: "mixed",
        activeCount: 2,
        staleCount: 0,
        needsAttentionCount: 1,
        main: {
          schemaVersion: 1,
          rowId: "main-agent",
          displayName: "Main <Agent> & Co",
          role: "orchestrator",
          source: "live_activity",
          sourceConfidence: "high",
          status: "working_task",
          statusLabel: "Working on Task T100708",
          work: {
            taskId: "T100708",
            title: "Brand <dashboard> UX",
            command: null,
            phaseKey: "100",
            taskStatus: "in_progress",
            assignmentId: null,
            sessionId: null,
            currentStep: "Asserting wc-agent-card <script>"
          },
          refs: {
            activityId: "act-1",
            agentId: "main-agent",
            sessionId: null,
            assignmentId: null,
            agentDefinitionId: null,
            subagentDefinitionId: null,
            taskId: "T100708",
            prNumber: null
          },
          freshness: {
            updatedAt: "2026-06-05T12:00:00.000Z",
            startedAt: null,
            expiresAt: null,
            state: "fresh"
          },
          attention: { state: "none", message: null }
        },
        active: [],
        needsAttention: [
          {
            schemaVersion: 1,
            rowId: "review-agent",
            displayName: "Review Agent",
            role: "task_worker",
            source: "team_execution",
            sourceConfidence: "high",
            status: "awaiting_input",
            statusLabel: "Awaiting input",
            work: {
              taskId: "T100709",
              title: "Review test expectations",
              command: null,
              phaseKey: "100",
              taskStatus: "blocked",
              assignmentId: "T100709",
              sessionId: null,
              currentStep: "Waiting for renderer worker"
            },
            refs: {
              activityId: null,
              agentId: null,
              sessionId: null,
              assignmentId: "T100709",
              agentDefinitionId: null,
              subagentDefinitionId: null,
              taskId: "T100709",
              prNumber: null
            },
            freshness: {
              updatedAt: "2026-06-05T12:01:00.000Z",
              startedAt: null,
              expiresAt: null,
              state: "fresh"
            },
            attention: { state: "awaiting_input", message: "Needs renderer markup" }
          }
        ],
        inferredFallback: null,
        sourceMap: {
          liveActivityCount: 1,
          teamExecutionCount: 1,
          subagentSessionCount: 0,
          derivedFallbackUsed: false
        }
      },
      stateSummary: {
        proposed: 0,
        ready: readyCount,
        in_progress: 1,
        blocked: blockedCount,
        completed: 0
      },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: Math.max(0, readyCount - 1), top: [], phaseBuckets: [] },
      readyExecutionSummary: { schemaVersion: 1, count: readyCount > 0 ? 1 : 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: blockedCount, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openTop: [] },
      readyQueueTop: [],
      readyQueueCount: readyCount,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-06-05T12:00:00.000Z",
      workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101", activeFocus: "Brand dashboard UX" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
}

test("renderDashboardRootInnerHtml renders brand banner before segmented tab bar", () => {
  const html = renderBrandDashboardHtml();
  const bannerIdx = html.indexOf("wc-banner");
  const tabBarIdx = html.indexOf("wc-tab-bar");
  assert.ok(bannerIdx >= 0, "expected branded dashboard banner");
  assert.ok(tabBarIdx > bannerIdx, "banner should be above segmented tabs");
  assert.match(html, /class="[^"]*\bwc-banner\b[^"]*"/);
  assert.match(html, /<span class="wc-banner-name">Workflow Cannon<\/span>/);
  assert.match(html, /<span class="wc-banner-tagline">workspace-kit<\/span>/);
  assert.match(html, /data-agent-status-kind="active"/);
  assert.match(html, /wc-status-dot wc-status-dot--active/);
  assert.match(html, /wc-banner-status-label wc-banner-status-label--active/);
  assert.match(html, /Running &lt;operator&gt; &amp; checking|Brand &lt;dashboard&gt; UX/);
  assert.doesNotMatch(html, /<operator>|<dashboard>|<script>/);
});

test("renderDashboardRootInnerHtml renders segmented tabs with icons and Queue badge priority", () => {
  const html = renderBrandDashboardHtml({ readyCount: 2, blockedCount: 3 });
  const tabBar = html.slice(html.indexOf('class="wc-tab-bar"'), html.indexOf('class="wc-tab-panel"'));
  assert.match(tabBar, /<button[^>]+wc-tab-active[^>]+data-wc-tab="overview"[\s\S]*<span class="wc-tab-icon">[\s\S]*Overview/);
  assert.match(tabBar, /data-wc-tab="planning"[\s\S]*<span class="wc-tab-icon">[\s\S]*Planning/);
  assert.match(tabBar, /data-wc-tab="task-engine"[\s\S]*<span class="wc-tab-icon">[\s\S]*Queue[\s\S]*wc-tab-badge wc-tab-badge-ready[\s\S]*>2<\/span>/);
  assert.doesNotMatch(tabBar, /wc-tab-badge-blocked[\s\S]*>3<\/span>/);
  assert.match(tabBar, /data-wc-tab="status"[\s\S]*<span class="wc-tab-icon">[\s\S]*Status/);
  assert.match(tabBar, /data-wc-tab="config"[\s\S]*<span class="wc-tab-icon">[\s\S]*Config/);
  assert.match(tabBar, /data-wc-tab="cae"[\s\S]*<span class="wc-tab-icon">[\s\S]*CAE/);
});

test("renderDashboardRootInnerHtml renders blocked Queue badge when no ready work exists", () => {
  const html = renderBrandDashboardHtml({ readyCount: 0, blockedCount: 4 });
  const tabBar = html.slice(html.indexOf('class="wc-tab-bar"'), html.indexOf('class="wc-tab-panel"'));
  assert.match(tabBar, /data-wc-tab="task-engine"[\s\S]*wc-tab-badge wc-tab-badge-blocked[\s\S]*>4<\/span>/);
  assert.doesNotMatch(tabBar, /wc-tab-badge-ready/);
});

test("renderDashboardRootInnerHtml renders agent cards with status dots and escaped text", () => {
  const html = renderBrandDashboardHtml();
  assert.match(html, /wc-agent-card/);
  assert.match(html, /data-status="active"/);
  assert.match(html, /data-status="waiting"/);
  assert.match(html, /wc-dot wc-dot--active/);
  assert.match(html, /wc-dot wc-dot--waiting/);
  assert.match(html, /wc-agent-card-now-label">Now<\/div>/);
  assert.match(html, /wc-agent-card-task-chip[\s\S]*T100708/);
  assert.match(html, /Main &lt;Agent&gt; &amp; Co/);
  assert.match(html, /Brand &lt;dashboard&gt; UX/);
  assert.doesNotMatch(html, /Main <Agent>|Brand <dashboard>|<script>/);
});

test("renderDashboardRootInnerHtml proposed execution rows expose accept action", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 1, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "T777", title: "Example proposed execution", phase: "Phase 9" }]
      },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-success"[^>]*data-wc-action="proposed-exe-accept"/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-danger"[^>]*data-wc-action="proposed-exe-decline"/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.match(html, /T777/);
  const rowMatch = html.match(
    /<div class="dash-row" role="listitem">[\s\S]*?T777[\s\S]*?<\/div>/
  );
  assert.ok(rowMatch, "expected proposed execution row");
  const rowHtml = rowMatch[0];
  assert.equal((rowHtml.match(/class="dash-row-actions/g) ?? []).length, 1);
  assert.match(rowHtml, /dash-row-actions-grid/);
  const actionOrder = [
    "task-detail",
    "assign-phase",
    "task-comments-view",
    "task-comment-add",
    "proposed-exe-accept",
    "proposed-exe-decline",
  ];
  let lastIdx = -1;
  for (const action of actionOrder) {
    const idx = rowHtml.indexOf(`data-wc-action="${action}"`);
    assert.ok(idx > lastIdx, `expected ${action} in document order`);
    lastIdx = idx;
  }
});

test("renderDashboardRootInnerHtml proposed improvement rows use single 3x2 action grid", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 1, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "imp-777", title: "Example proposed improvement", phase: "Phase 9" }]
      },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  const rowMatch = html.match(
    /<div class="dash-row" role="listitem">[\s\S]*?imp-777[\s\S]*?<\/div>/
  );
  assert.ok(rowMatch, "expected proposed improvement row");
  const rowHtml = rowMatch[0];
  assert.equal((rowHtml.match(/class="dash-row-actions/g) ?? []).length, 1);
  assert.match(rowHtml, /dash-row-actions-grid/);
  assert.match(rowHtml, /data-wc-action="proposed-imp-accept"/);
  assert.match(rowHtml, /data-wc-action="proposed-imp-decline"/);
});

test("renderDashboardRootInnerHtml renders human gates section with resume actions", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      humanGatesSummary: {
        schemaVersion: 1,
        phaseKey: "100",
        count: 1,
        top: [
          {
            id: "T900",
            title: "Gated task",
            status: "awaiting_review",
            gateKind: "awaiting_review",
            ageMs: 120_000,
            requestedDecision: "Sign off",
            owner: "ops"
          }
        ]
      },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101", activeFocus: "Test" },
      agentStatus: {
        schemaVersion: 1,
        source: "derived",
        kind: "awaiting_human_gate",
        label: "Awaiting review · T900",
        confidence: "high",
        updatedAt: "2026-01-01T00:00:00.000Z",
        taskId: "T900"
      },
      agentActivitySummary: {
        schemaVersion: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
        source: "derived_only",
        activeCount: 1,
        staleCount: 0,
        needsAttentionCount: 0,
        main: null,
        active: [],
        needsAttention: [],
        inferredFallback: {
          schemaVersion: 1,
          source: "derived",
          kind: "awaiting_human_gate",
          label: "Awaiting review · T900",
          confidence: "high",
          updatedAt: "2026-01-01T00:00:00.000Z",
          taskId: "T900"
        },
        sourceMap: {
          liveActivityCount: 0,
          teamExecutionCount: 0,
          subagentSessionCount: 0,
          derivedFallbackUsed: true
        }
      },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /data-wc-track="status-human-gates"/);
  assert.match(html, /<b>Human Review<\/b> \(1\)/);
  assert.match(html, /data-wc-filter-btn="human-gates"/);
  assert.match(html, /Awaiting review/);
  assert.match(html, /data-wc-action="human-gate-resume-ready"/);
  assert.match(html, /data-wc-action="human-gate-resume-work"/);
  assert.match(html, /dash-agent-activity-row--fallback/);
  assert.match(html, /Awaiting review · T900/);
});

test("renderDashboardRootInnerHtml phase journal silence hint lives in Phase Notes card only", () => {
  const data = {
    stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
    proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
    proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
    readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
    readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
    wishlist: { openCount: 0, totalCount: 0, openTop: [] },
    blockedSummary: { count: 0, top: [], phaseBuckets: [] },
    humanGatesSummary: { schemaVersion: 1, phaseKey: "100", count: 0, top: [] },
    phaseJournalStats: {
      schemaVersion: 1,
      available: true,
      phases: [{ phaseKey: "100", activeNoteCount: 0, latestNoteAt: null }],
      currentPhase: {
        phaseKey: "100",
        activeNoteCount: 0,
        completedDeliveryTaskCount: 2,
        silenceWarning: true
      }
    },
    readyQueueTop: [],
    readyQueueCount: 0,
    suggestedNext: null,
    planningSession: null,
    taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
    workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101", activeFocus: "Test" },
    blockingAnalysis: [],
    dependencyOverview: deliverTestDepOverview
  };
  const bundle = {
    listPhaseNotes: {
      ok: true,
      code: "phase-notes-listed",
      data: { phaseKey: "100", phaseKeySource: "workspace-status", notes: [], count: 0 }
    },
    getPhaseContext: {
      ok: true,
      code: "phase-context",
      data: { phaseKey: "100", phaseKeySource: "workspace-status", notes: [], count: 0 }
    }
  };
  const html = renderDashboardRootInnerHtml({ ok: true, data }, null, null, bundle);
  assert.doesNotMatch(html, /Notes captured this phase/);
  assert.doesNotMatch(html, /dash-phase-journal-stats/);
  assert.doesNotMatch(html, /dash-quick-actions[\s\S]*data-wc-action="phase-note-add"/);
  const taskEngineIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusEnd = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  assert.ok(taskEngineIdx !== -1 && statusEnd > taskEngineIdx);
  const taskEnginePanel = html.slice(taskEngineIdx, statusEnd);
  assert.match(taskEnginePanel, /dash-phase-notes/);
  assert.match(taskEnginePanel, /dash-phase-journal-silence-warn/);
  assert.match(taskEnginePanel, /data-wc-action="phase-note-add"/);
});

test("renderDashboardRootInnerHtml ready rows keep flex task actions without grid modifier", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 1, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "T888", title: "Ready execution", phase: "Phase 9" }]
      },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 1,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  const rowMatch = html.match(
    /<div class="dash-row" role="listitem">[\s\S]*?T888[\s\S]*?<\/div>/
  );
  assert.ok(rowMatch, "expected ready row");
  const rowHtml = rowMatch[0];
  assert.match(rowHtml, /wc-task-actions/);
  assert.doesNotMatch(rowHtml, /dash-row-actions-grid/);
});

test("renderDashboardRootInnerHtml proposed phase buckets show Accept All with taskIds", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 2, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: {
        schemaVersion: 1,
        count: 2,
        top: [],
        phaseBuckets: [
          {
            schemaVersion: 1,
            phaseKey: "68",
            label: "Phase 68 (current) (2)",
            count: 2,
            top: [
              { id: "imp-aaa", title: "A", phase: "Phase 68" },
              { id: "imp-bbb", title: "B", phase: "Phase 68" }
            ],
            taskIds: ["imp-aaa", "imp-bbb"]
          }
        ]
      },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "68", nextKitPhase: "69", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /data-wc-action="proposed-imp-accept-phase"/);
  assert.match(html, /data-proposed-task-ids="imp-aaa,imp-bbb"/);
  assert.match(html, /data-proposed-phase-key="68"/);
});

test("renderDashboardRootInnerHtml merges ready improvement and execution rollups", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 4, in_progress: 0, blocked: 0, completed: 0 },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 3, top: [{ id: "T1", title: "imp" }] },
      readyExecutionSummary: { schemaVersion: 1, count: 1, top: [{ id: "T2", title: "exe" }] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 4,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 3, other: 1 },
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /<b>Ready<\/b> \(4\)/);
  assert.doesNotMatch(html, /Ready · Improvements/);
  assert.doesNotMatch(html, /Ready · Execution/);
  assert.doesNotMatch(html, /Ready Queue · 3 Improvements · 1 Other/);
  assert.match(html, /data-wc-track="status-ready"/);
  assert.match(html, /T1/);
  assert.match(html, /T2/);
});

test("buildPhaseCompleteReleaseChatPrompt directs MCP-first with CLI fallback and stays packet-first", () => {
  const p = buildPhaseCompleteReleaseChatPrompt("Phase 64", {
    phaseKey: "64",
    currentKitPhase: "64",
    nextKitPhase: "65",
    scope: "current"
  });
  assert.match(p, /MCP tools first/);
  assert.match(p, /fall back to the CLI command when MCP is unavailable/);
  assert.match(
    p,
    /pnpm exec wk run phase-release-orchestration-state '\{"phaseKey":"64","scope":"current","integrationBranch":"release\/phase-64","dashboardAuthorization":"complete-and-release"\}'/
  );
  assert.match(p, /When MCP is unavailable or stale: run the CLI command above\. Work from `data\.verdict`, `refs\.commands`, and `refs\.instructions`/);
  assert.match(p, /target phaseKey: `64`/);
  assert.match(p, /workspace current \/ next: `64` \/ `65`/);
  assert.match(p, /scope: `current`/);
  assert.match(p, /integration branch: `release\/phase-64`/);
  assert.match(p, /@\.ai\/playbooks\/phase-closeout-and-release\.md/);
  assert.match(p, /@\.ai\/playbooks\/task-to-phase-branch\.md/);
  assert.match(p, /@\.ai\/AGENT-CLI-MAP\.md/);
  assert.match(p, /agent-execution-packet/);
  assert.match(p, /Dashboard authorization covers closeout, release, and publish when gates allow/);
  assert.match(p, /Tier A\/B `wk run` mutations still require JSON `policyApproval`/);
  assert.match(p, /Disable packet-first if the first command is unavailable/);
  assert.match(p, /returns `ok: false`/);
  assert.match(p, /omits `data\.verdict`, `refs\.commands`, or `refs\.instructions`/);
  assert.match(p, /stale\/mismatched phase, branch, planning, or task-state evidence/);
  assert.match(p, /`phase-drain-delta` rejects, stales its cursor/);
  assert.match(p, /`refreshRecommendation\.mode: "full-refresh"`/);
  assert.match(p, /pnpm exec wk run phase-closeout-readiness '\{"phaseKey":"64"\}'/);
  assert.match(p, /Phase 1 plan review warnings remain, refine\/review the Phase 1 plan first/);
  assert.doesNotMatch(p, /Packet-first rollout is activation-gated/);
  assert.doesNotMatch(p, /rollout note explicitly enables/);
  assert.doesNotMatch(p, /pnpm exec wk run phase-release-orchestration-state '\{\}'/);
  assert.doesNotMatch(p, /pnpm exec wk run --json/);
  assert.doesNotMatch(p, /roll back the activation by reverting this prompt/);
  assert.doesNotMatch(p, /^## Complete & Release/);
});

test("buildPhaseCompleteReleaseChatPrompt keeps bucket scope in context", () => {
  const p = buildPhaseCompleteReleaseChatPrompt("Phase 100", {
    phaseKey: "100",
    currentKitPhase: "98",
    nextKitPhase: "99",
    scope: "bucket"
  });
  assert.match(p, /scope: `bucket`/);
  assert.match(p, /workspace current \/ next: `98` \/ `99`/);
  assert.match(p, /No safe release path or no phase work: stop and report instead of improvising/);
});

test("buildPhaseCompleteReleaseChatPrompt without phaseKey uses placeholders", () => {
  const p = buildPhaseCompleteReleaseChatPrompt("Phase 64");
  assert.match(p, /pnpm exec wk run phase-release-orchestration-state '\{"phaseKey":"<N>"/);
  assert.match(p, /release\/phase-<N>/);
  assert.doesNotMatch(p, /release\/phase-64/);
});

test("collectPhaseBucketTaskIds merges taskIds and top preview", () => {
  assert.deepEqual(
    collectPhaseBucketTaskIds({
      taskIds: ["T1", "T2"],
      top: [{ id: "T2" }, { id: "T3" }]
    }),
    ["T1", "T2", "T3"]
  );
});

test("resolvePhasePhraseForCompleteRelease prefers phaseKey then task.phase", () => {
  assert.equal(resolvePhasePhraseForCompleteRelease({ phaseKey: "64", top: [] }), "Phase 64");
  assert.equal(
    resolvePhasePhraseForCompleteRelease({
      phaseKey: null,
      top: [{ phase: "Phase 9 — Example" }]
    }),
    "Phase 9 — Example"
  );
  assert.equal(resolvePhasePhraseForCompleteRelease({ phaseKey: null, top: [] }), "Not Phased");
});

test("renderDashboardRootInnerHtml ready phase buckets include Complete & Release button", () => {
  const row = {
    id: "T900",
    title: "Ready task",
    priority: "P1",
    phase: "Phase 64",
    features: null,
    featureDetails: null
  };
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 1, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [row],
        phaseBuckets: [
          {
            schemaVersion: 1,
            phaseKey: "64",
            label: "Phase 64 (current) (1)",
            count: 1,
            top: [row]
          }
        ]
      },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 1,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "64", nextKitPhase: "65", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /dash-phase-release-btn/);
  assert.match(html, /data-wc-action="phase-complete-release"/);
  assert.match(html, /data-wc-phase-key="64"/);
  assert.match(html, /data-wc-phase-phrase="Phase 64"/);
  assert.match(html, /data-wc-phase-task-ids="T900"/);
  assert.match(html, /data-wc-workspace-current-phase="64"/);
  assert.match(html, /wc-cae-readiness-head/);
  assert.match(html, /data-wc-release-scope="bucket"/);
  assert.match(html, /data-wc-release-scope="current"/);
  assert.match(html, /Complete &amp; Release/);
  assert.doesNotMatch(html, /dash-phase-release-overview/);
  assert.doesNotMatch(html, /Closeout phase 64/);
  assert.match(html, /phase-bucket-summary/);
});

test("renderPlanningInterviewWizardPanel picker wires start control and planning type select", () => {
  const html = renderPlanningInterviewWizardPanel({ kind: "picker" });
  assert.match(html, /id="wc-planning-type"/);
  assert.match(html, /Planning Type/);
  assert.match(html, /dash-planning-wizard-picker-row/);
  assert.match(html, /data-wc-action="planning-wizard-start"/);
  assert.match(html, /value="change"/);
  assert.doesNotMatch(html, /Guided interview/);
  assert.doesNotMatch(html, /Answers run through/);
});

test("renderPlanningInterviewWizardPanel question mode escapes prompt and includes submit/cancel", () => {
  const html = renderPlanningInterviewWizardPanel({
    kind: "question",
    planningType: "change",
    questionId: "changeGoal",
    prompt: 'What <change>?',
    examples: ['A & B'],
    whyItMatters: "Trust",
    progressHint: "1 answered"
  });
  assert.match(html, /data-wc-action="planning-wizard-submit"/);
  assert.match(html, /data-wc-action="planning-wizard-cancel"/);
  assert.match(html, /&lt;change&gt;/);
  assert.match(html, /A &amp; B/);
});

test("renderPlanningInterviewWizardPanel success shows response-only persistence hint", () => {
  const html = renderPlanningInterviewWizardPanel({
    kind: "success",
    planningType: "change",
    code: "planning-response-ready",
    message: "All set."
  });
  assert.match(html, /Your answers were saved\. No task was created\./);
  assert.match(html, /data-wc-action="planning-wizard-dismiss"/);
});


test("renderTaskStateSyncStatusHtml shows display state and remediation", () => {
  const html = renderTaskStateSyncStatusHtml({
    schemaVersion: 1,
    available: true,
    displayState: "behind",
    remediation: "Catch up from git.",
    appliedSequence: 12,
    sourceCommit: "abcdef123456"
  });
  assert.match(html, /Task-state sync/);
  assert.match(html, /Behind/);
  assert.match(html, /Catch up from git/);
  assert.match(html, /Applied sequence/);
  assert.match(html, />12</);
});

test("renderDashboardRootInnerHtml wishlist section shows pager when openTotalPages > 1", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `W-${i}`,
    title: `Item ${i}`,
    taskId: `T-wl-${i}`
  }));
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: {
        enabled: true,
        openCount: 15,
        totalCount: 15,
        openPage: 0,
        openPageSize: 5,
        openTotalPages: 3,
        openTop: rows
      },
      blockedSummary: { count: 0, top: [] },
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: null,
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /Open 15/);
  assert.match(html, /· Page 1 \/ 3/);
  assert.match(html, /wc-wishlist-pager/);
  assert.match(html, /justify-content:center/);
  assert.match(html, /data-wc-action="wishlist-page"/);
});

test("renderDashboardRootInnerHtml wishlist pager points prev and next at adjacent pages", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `W-${i + 5}`,
    title: `Item ${i + 5}`,
    taskId: `T-wl-${i + 5}`
  }));
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: {
        enabled: true,
        openCount: 15,
        totalCount: 15,
        openPage: 1,
        openPageSize: 5,
        openTotalPages: 3,
        openTop: rows
      },
      blockedSummary: { count: 0, top: [] },
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: null,
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /Page 2 \/ 3/);
  assert.match(html, /data-wishlist-page="0">Prev/);
  assert.match(html, /data-wishlist-page="2">Next/);
});

function phaseDeliveryFixture(overrides = {}) {
  return {
    schemaVersion: 2,
    phaseKey: "100",
    closeoutPassed: true,
    released: false,
    remainingCount: 0,
    terminalCount: 10,
    checkedTaskCount: 10,
    queue: { ready: 5, proposed: 0, blocked: 0, inProgress: 2, research: 0 },
    segments: {
      completed: 8,
      cancelled: 2,
      inProgress: 0,
      ready: 0,
      proposed: 0,
      blocked: 0,
      research: 0
    },
    progressPercent: 100,
    releaseReadyPercent: 100,
    deliveryEvidenceViolationCount: 0,
    ...overrides
  };
}

function readinessDashboardPayload(dataOverrides = {}) {
  return {
    ok: true,
    data: {
      stateSummary: { ready: 71, proposed: 0, blocked: 0, completed: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 56, top: [], phaseBuckets: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 15, top: [], phaseBuckets: [{ phaseKey: "100", count: 15 }] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: {
        schemaVersion: 1,
        openCount: 0,
        totalCount: 0,
        openPage: 0,
        openPageSize: 10,
        openTotalPages: 0,
        openTop: []
      },
      readyQueueTop: [],
      readyQueueCount: 71,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 56, other: 15 },
      executionPlanningScope: "tasks-only",
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-05-14T00:00:00.000Z",
      workspaceStatus: {
        currentKitPhase: "100",
        nextKitPhase: "101",
        activeFocus: "Release gate",
        blockers: [],
        pendingDecisions: []
      },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview,
      currentPhaseDelivery: phaseDeliveryFixture(),
      ...dataOverrides
    }
  };
}

test("Phase Readiness shows phase-scoped ready counts not workspace ready total", () => {
  const html = renderDashboardRootInnerHtml(readinessDashboardPayload());
  assert.match(html, /Tasks assigned to this phase/);
  assert.match(html, /5 ready · 2 in progress/);
  assert.doesNotMatch(html, /71 ready/);
});

test("renderPhaseKickoffFindingsList and Phase Readiness card show kickoff findings", () => {
  const list = renderPhaseKickoffFindingsList([
    {
      code: "kickoff-git-integration-branch-missing",
      severity: "block",
      message: "Integration ref origin/release/phase-137 is not available"
    }
  ]);
  assert.match(list, /Kickoff findings/);
  assert.match(list, /kickoff-git-integration-branch-missing/);
  assert.match(list, /wc-kickoff-finding-block/);

  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      phaseKickoff: {
        schemaVersion: 1,
        phaseKey: "100",
        passed: false,
        findingCount: 1,
        enforcementMode: "advisory",
        findings: [
          {
            code: "kickoff-planning-stale-task",
            severity: "warn",
            message: "Stale ready task T001"
          }
        ]
      }
    })
  );
  assert.match(html, /Kickoff findings/);
  assert.match(html, /kickoff-planning-stale-task/);
});

test("Phase Readiness score is 100% when phase delivery has started", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      currentPhaseDelivery: phaseDeliveryFixture({
        queue: { ready: 0, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 3,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 0,
          blocked: 0,
          research: 0
        },
        terminalCount: 3,
        checkedTaskCount: 3,
        closeoutPassed: true
      })
    })
  );
  const readiness =
    html.match(/<section class="dash-card wc-cae-readiness[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(readiness, /wc-cae-score-badge[\s\S]*>100<span>%<\/span>/);
  assert.match(readiness, /Work in this phase has already started\. Readiness stays at 100%\./);
  assert.match(readiness, /3 done · work in progress/);
  assert.match(readiness, /wc-cae-check-ok[\s\S]*Tasks assigned to this phase/);
});

test("Phase Readiness score equals passed checks as equal shares before delivery starts", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      workspaceStatus: {
        currentKitPhase: "100",
        nextKitPhase: "101",
        blockers: [],
        pendingDecisions: ["Pick release train"]
      },
      currentPhaseDelivery: phaseDeliveryFixture({
        queue: { ready: 0, proposed: 2, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 2,
          blocked: 0,
          research: 0
        },
        terminalCount: 0,
        checkedTaskCount: 2,
        closeoutPassed: false,
        progressPercent: 0,
        releaseReadyPercent: 0
      })
    })
  );
  const readiness =
    html.match(/<section class="dash-card wc-cae-readiness[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(readiness, /wc-cae-score-badge[\s\S]*>80<span>%<\/span>/);
  assert.match(readiness, /wc-cae-check-ok[\s\S]*Tasks assigned to this phase/);
  assert.match(readiness, /wc-cae-check-warn[\s\S]*No open decisions[\s\S]*wc-context-help/);
  assert.match(readiness, /wc-cae-check-ok[\s\S]*No workspace blockers/);
  assert.doesNotMatch(readiness, /Delivery work started/);
  assert.doesNotMatch(readiness, /Proposed in phase manageable/);
});

test("Overview stat pills include Human gate count with yellow number class", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      humanGatesSummary: { schemaVersion: 1, phaseKey: "100", count: 2, top: [] }
    })
  );
  const overview = overviewPanelHtml(html);
  assert.match(overview, /wc-pill-human[\s\S]*data-wc-pill-filter="human-gates"/);
  assert.match(overview, /wc-stat-num-human">2</);
});

function overviewPanelHtml(html) {
  const start = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const end = html.indexOf('<motion.div class="wc-tab-panel" data-wc-tab="task-engine"');
  if (start === -1 || end <= start) {
    const altEnd = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
    return start !== -1 && altEnd > start ? html.slice(start, altEnd) : html;
  }
  return html.slice(start, end);
}

test("Phase Progress badge reflects closeout checklist not delivery bar alone", () => {
  const overview = overviewPanelHtml(
    renderDashboardRootInnerHtml(
      readinessDashboardPayload({
        currentPhaseDelivery: phaseDeliveryFixture({
          closeoutPassed: false,
          released: false,
          releaseReadyPercent: 100,
          progressPercent: 100,
          terminalCount: 8,
          checkedTaskCount: 10,
          segments: {
            completed: 8,
            cancelled: 0,
            inProgress: 2,
            ready: 0,
            proposed: 0,
            blocked: 0,
            research: 0
          }
        })
      })
    )
  );
  const progressSection =
    overview.match(/<section class="dash-card wc-phase-progress[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(progressSection, /wc-cae-score-badge[\s\S]*>71<span>%<\/span>/);
  assert.match(progressSection, /aria-valuenow="80"/);
  assert.doesNotMatch(progressSection, /wc-phase-card-hint/);
});

test("Phase Progress blocks closeout when later phases are delivered on roster", () => {
  const overview = overviewPanelHtml(
    renderDashboardRootInnerHtml(
      readinessDashboardPayload({
        legacyDeliveredMaxOrdinal: 120,
        workspaceStatus: {
          currentKitPhase: "118",
          nextKitPhase: "119",
          blockers: [],
          pendingDecisions: []
        },
        systemStatus: {
          phase: {
            currentKitPhase: "118",
            nextKitPhase: "119",
            canonicalPhaseKey: "118",
            phaseCatalog: {
              supported: true,
              phases: [
                { phaseKey: "118", shortDescription: "CI", inCatalog: true },
                { phaseKey: "119", shortDescription: "Sync", inCatalog: true },
                { phaseKey: "120", shortDescription: "Expand", inCatalog: true }
              ]
            }
          }
        },
        currentPhaseDelivery: {
          ...phaseSnapshotDrained,
          phaseKey: "118",
          closeoutPassed: true,
          releaseReadyPercent: 100,
          released: false
        }
      })
    )
  );
  const progressSection =
    overview.match(/<section class="dash-card wc-phase-progress[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(progressSection, /Phase ordering vs roster/);
  assert.match(progressSection, /wc-phase-ordering-risk/);
  const readinessSection =
    overview.match(/<section class="dash-card wc-cae-readiness[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(readinessSection, /wc-phase-ordering-risk/);
  assert.match(readinessSection, /dash-phase-release-btn[\s\S]*disabled/);
});

test("Phase Progress badge stays below 100% until phase is released", () => {
  const overview = overviewPanelHtml(
    renderDashboardRootInnerHtml(
      readinessDashboardPayload({
        currentPhaseDelivery: { ...phaseSnapshotDrained, released: false }
      })
    )
  );
  const progressSection =
    overview.match(/<section class="dash-card wc-phase-progress[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(progressSection, /wc-cae-score-badge[\s\S]*>86<span>%<\/span>/);
  assert.match(progressSection, /aria-valuenow="100"/);
});

test("Phase Progress renders Mark Phase Complete centered in card footer", () => {
  const overview = overviewPanelHtml(renderDashboardRootInnerHtml(readinessDashboardPayload()));
  const progressSection =
    overview.match(/<section class="dash-card wc-phase-progress[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(progressSection, /wc-phase-progress-footer/);
  assert.match(progressSection, /data-wc-action="phase-mark-complete"/);
  assert.match(progressSection, /Mark Phase Complete/);
  assert.doesNotMatch(progressSection, /\bdash-phase-mark-complete-btn[\s\S]*\bdisabled\b/);
});

test("Phase Progress disables Mark Phase Complete until closeout passes", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      currentPhaseDelivery: phaseDeliveryFixture({
        closeoutPassed: false,
        remainingCount: 3,
        releaseReadyPercent: 70
      })
    })
  );
  const progressSection =
    html.match(/<section class="dash-card wc-phase-progress[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(progressSection, /dash-phase-mark-complete-btn/);
  assert.match(progressSection, /\bdash-phase-mark-complete-btn[\s\S]*\bdisabled\b/);
});

test("Phase Progress renders closeout gate checkmarks", () => {
  const html = renderDashboardRootInnerHtml(readinessDashboardPayload());
  assert.match(html, /wc-phase-progress-checks/);
  assert.match(html, /Delivery work started/);
  assert.match(html, /All delivery tasks finished/);
  assert.match(html, /Delivery evidence recorded/);
  assert.match(html, /Human review clear/);
  assert.match(html, /Phase released/);
  assert.match(html, /Ready to release/);
});

test("Phase Readiness and Progress hidden when workspace has no current phase", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      workspaceStatus: {
        currentKitPhase: null,
        nextKitPhase: "108",
        blockers: [],
        pendingDecisions: []
      },
      systemStatus: {
        phase: {
          currentKitPhase: null,
          nextKitPhase: "108",
          canonicalPhaseKey: null,
          phaseCatalog: {
            supported: true,
            phases: [
              { phaseKey: "107", shortDescription: "Shipped slice", inCatalog: true },
              { phaseKey: "108", shortDescription: "Next up", inCatalog: true }
            ]
          }
        }
      },
      currentPhaseDelivery: {
        schemaVersion: 2,
        phaseKey: null,
        closeoutPassed: false,
        released: false,
        remainingCount: 0,
        terminalCount: 0,
        checkedTaskCount: 0,
        queue: { ready: 0, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 0,
          blocked: 0,
          research: 0
        },
        progressPercent: 0,
        releaseReadyPercent: 0,
        deliveryEvidenceViolationCount: 0
      }
    })
  );
  assert.doesNotMatch(html, /Phase Readiness · Phase/);
  assert.doesNotMatch(html, /Phase Progress · Phase/);
  assert.match(html, /data-wc-action="phase-roster-start"/);
});

test("Phase Progress renders segmented bar without release control", () => {
  const overview = overviewPanelHtml(renderDashboardRootInnerHtml(readinessDashboardPayload()));
  assert.match(overview, /Phase Progress · Phase/);
  assert.match(overview, /wc-phase-progress-track/);
  assert.match(overview, /wc-phase-progress-seg/);
  assert.doesNotMatch(overview, /wc-phase-progress-head[\s\S]*dash-phase-release-btn/);
  const readinessSection =
    overview.match(/<section class="dash-card wc-cae-readiness[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(readinessSection, /dash-phase-release-btn/);
});

test("Phase Readiness Complete & Release disabled before readiness reaches 100%", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      workspaceStatus: {
        currentKitPhase: "100",
        nextKitPhase: "101",
        blockers: [],
        pendingDecisions: ["Pick release train"]
      },
      currentPhaseDelivery: phaseDeliveryFixture({
        closeoutPassed: false,
        releaseReadyPercent: 40,
        progressPercent: 40,
        remainingCount: 6,
        terminalCount: 0,
        checkedTaskCount: 10,
        queue: { ready: 0, proposed: 2, blocked: 0, inProgress: 0, research: 0 },
        segments: {
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          ready: 0,
          proposed: 2,
          blocked: 0,
          research: 0
        }
      })
    })
  );
  const head = html.match(/wc-cae-readiness-head[\s\S]*?<\/div>\s*<div class="wc-cae-readiness-body"/)?.[0] ?? "";
  assert.match(head, /dash-phase-release-btn/);
  assert.match(head, /\bdash-phase-release-btn[\s\S]*\bdisabled\b/);
  assert.match(head, /wc-btn-disabled/);
  assert.doesNotMatch(head, /dash-phase-release-btn--preflight/);
  assert.match(head, /Complete &amp; Release unlocks when phase readiness reaches 100%/);
});

test("Phase Readiness enables Complete & Release at 100% readiness before closeout passes", () => {
  const html = renderDashboardRootInnerHtml(
    readinessDashboardPayload({
      currentPhaseDelivery: phaseDeliveryFixture({
        closeoutPassed: false,
        releaseReadyPercent: 40,
        progressPercent: 40,
        remainingCount: 6,
        terminalCount: 4,
        checkedTaskCount: 10
      })
    })
  );
  const head = html.match(/wc-cae-readiness-head[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(head, /dash-phase-release-btn/);
  assert.doesNotMatch(head, /\bdash-phase-release-btn[\s\S]*\bdisabled\b/);
  assert.match(head, /dash-phase-release-btn--preflight/);
});

test("Phase Readiness enables Complete & Release when closeout passed", () => {
  const html = renderDashboardRootInnerHtml(readinessDashboardPayload());
  const head = html.match(/wc-cae-readiness-head[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(head, /dash-phase-release-btn/);
  assert.doesNotMatch(head, /\bdash-phase-release-btn[\s\S]*\bdisabled\b/);
});

test("Phase Readiness shows Delivered tag when phase completed and released", () => {
  const overview = overviewPanelHtml(
    renderDashboardRootInnerHtml(
      readinessDashboardPayload({
        currentPhaseDelivery: phaseDeliveryFixture({ released: true })
      })
    )
  );
  assert.match(overview, /wc-phase-readiness-delivered/);
  assert.match(overview, /wc-phase-tag-delivered[\s\S]*Delivered/);
  assert.doesNotMatch(overview, /wc-phase-progress-head[\s\S]*dash-phase-release-btn/);
});

test("renderDashboardQueueTaskRowsHtml renders queue rows for host lazy terminal inject", () => {
  const html = renderDashboardQueueTaskRowsHtml([
    { id: "T900", title: "Done thing", summary: "Shipped it" }
  ]);
  assert.match(html, /dash-row-list/);
  assert.match(html, /T900/);
  assert.equal(lazyTerminalBucketListLimit(), 50);
});
