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
  renderPlanningInterviewWizardPanel
} from "../dist/views/dashboard/render-dashboard.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../dist/phase-complete-release-prompt.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "../dist/views/guidance/render-guidance-panel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test("renderDashboardRootInnerHtml shows error JSON when ok is false", () => {
  const html = renderDashboardRootInnerHtml({
    ok: false,
    code: "extension-exec-error",
    message: "CLI not found"
  });
  assert.match(html, /extension-exec-error/);
  assert.match(html, /bad/);
});

test("renderDashboardRootInnerHtml renders fixture-shaped success payload", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  assert.match(html, /dash-card/);
  assert.match(html, /dash-agent-status-banner/);
  assert.ok(html.indexOf("dash-agent-status-banner") < html.indexOf("wc-cae-readiness"));
  assert.ok(html.indexOf("wc-cae-readiness") < html.indexOf("wc-tab-bar"));
  assert.match(html, /<b>WC Agent is:<\/b> <span class="dash-agent-status-label">Awaiting Instruction<\/span>/);
  assert.match(html, /dash-agent-row-list/);
  assert.match(html, /aria-label="Awaiting Instruction, Current agent"/);
  const overviewPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="overview"');
  const taskEnginePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"');
  const configPanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  const caePanelIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="cae"');
  assert.ok(overviewPanelIdx >= 0 && taskEnginePanelIdx > overviewPanelIdx && statusPanelIdx > taskEnginePanelIdx);
  const overviewPanel = html.slice(overviewPanelIdx, taskEnginePanelIdx);
  const statusPanel = html.slice(statusPanelIdx, configPanelIdx);
  const caePanel = html.slice(caePanelIdx);
  assert.doesNotMatch(overviewPanel, /Role|Temperament|Presentation/);
  assert.match(statusPanel, /Agent Profile/);
  assert.match(statusPanel, /<span class="wc-status-kv-label">Role<\/span><span class="wc-status-kv-val">Adventurer<\/span>/);
  assert.match(statusPanel, /<span class="wc-status-kv-label">Temperament<\/span><span class="wc-status-kv-val">The Steady Adventurer<\/span>/);
  assert.match(statusPanel, /Manage guidance policies via the CAE sidebar panel/);
  assert.doesNotMatch(caePanel, /Active Guidance|aria-label="Agent guidance"/);
  assert.ok(statusPanel.indexOf('aria-label="Agent profile"') < statusPanel.indexOf('aria-label="Workspace identity"'));
  const roleIdx = statusPanelIdx + statusPanel.indexOf("Agent Profile");
  const agentStatusIdx = html.indexOf("<b>WC Agent is:</b>");
  const phaseIdx = html.indexOf("Current Phase");
  assert.ok(agentStatusIdx !== -1 && roleIdx !== -1 && agentStatusIdx < roleIdx);
  assert.ok(agentStatusIdx !== -1 && phaseIdx !== -1 && agentStatusIdx < phaseIdx);
  assert.ok(phaseIdx !== -1 && roleIdx !== -1 && phaseIdx < roleIdx);
  assert.match(html, /Phase Readiness/);
  assert.match(html, /aria-label="Phase readiness"/);
  assert.match(html, /wc-cae-readiness-collapsed/);
  assert.match(html, /data-wc-action="phase-readiness-toggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /wc-cae-readiness-body/);
  assert.match(html, /Current Phase/);
  assert.doesNotMatch(html, /Next action/i);
  assert.doesNotMatch(html, /Planning generation/i);
  assert.doesNotMatch(html, /expectedPlanningGeneration/);
  assert.match(html, /dash-quick-actions/);
  assert.match(html, /data-wc-action="add-wishlist-item"/);
  assert.match(html, />Add wishlist item<\/button>/);
  assert.match(html, /data-wc-action="collaboration-hub"/);
  assert.match(html, />Collaboration profiles<\/button>/);
  assert.match(html, /data-wc-action="generate-features-chat"/);
  assert.match(html, />Generate Features<\/button>/);
  const taskBlock = html.indexOf("dashboard-tasks-block");
  const quickBar = html.indexOf("dash-quick-actions");
  assert.ok(taskBlock !== -1 && quickBar !== -1 && taskBlock < quickBar);
  assert.match(html, /dash-count-grid/);
  assert.match(html, /wc-ready-scope-note/);
  assert.match(html, /wishlist_intake/);
  assert.match(html, /Wishlist intake rows are excluded/);
  assert.match(html, />Proposed<\/span> <span class="dash-count-num ok">1<\/span>/);
  assert.match(html, />Ready<\/span> <span class="dash-count-num ok">2<\/span>/);
  assert.match(html, /dashboard-tasks-block/);
  assert.match(html, /status-section/);
  assert.match(html, /data-wc-track="status-prop-exe"/);
  assert.match(html, /data-wc-track="wishlist"/);
  assert.match(html, /Ready · Improvements/);
  assert.match(html, /Ready · Execution/);
  assert.match(html, /Wishlist/);
  assert.match(html, /Proposed · Improvements/);
  assert.match(html, /Proposed · Execution/);
  const readyIdx = html.indexOf("Ready · Improvements");
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
  assert.match(html, /data-wc-track="status-ready-imp"/);
  assert.match(html, /data-wc-track="status-ready-exe"/);
  assert.match(html, /data-wc-filter="ready"/);
  assert.match(html, /data-wc-filter="research"/);
  assert.match(html, /data-wc-filter="terminal"/);
  assert.match(html, /data-wc-phase-filter/);
  assert.match(html, /<option value="all">All phases<\/option>/);
  assert.match(html, /<option value="__no_phase__">No Phase<\/option>/);
  assert.match(html, /<option value="14">Current \(14\)<\/option>/);
  assert.match(html, /<option value="15">Next \(15\)<\/option>/);
  assert.match(html, /<option value="29">Phase 29<\/option>/);
  assert.match(html, /imp-example/);
  assert.match(html, /T319/);
  assert.match(html, /T320/);
  assert.match(html, /W1/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-secondary"[^>]*data-wc-action="wishlist-view"/);
  assert.match(html, />View<\/button>/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-primary"[^>]*data-wc-action="wishlist-chat"/);
  assert.match(html, />Process<\/button>/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-secondary"[^>]*data-wc-action="wishlist-decline"/);
  assert.match(html, />Decline<\/button>/);
  assert.match(html, /data-task-id="T501"/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-primary"[^>]*data-wc-action="proposed-imp-accept"/);
  assert.match(html, /data-wc-action="proposed-imp-decline"/);
  assert.doesNotMatch(html, /proposed-imp-chat/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.match(html, /data-wc-action="task-detail"/);
  assert.match(html, /data-wc-action="assign-phase"/);
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-secondary"[^>]*data-wc-action="task-detail"/);
  assert.match(html, /data-wc-action="task-detail"[\s\S]*?>View Task<\/button>/);
  assert.match(html, /data-wc-action="task-comments-view"[\s\S]*?>View Comments<\/button>/);
  assert.match(html, /data-wc-action="task-comment-add"[\s\S]*?>Add Comment<\/button>/);
  assert.match(html, /wc-btn-sm/);
  assert.match(html, /phase-bucket/);
  assert.match(html, /data-wc-phase-bucket="14"/);
  assert.match(html, /data-wc-phase-bucket="__no_phase__"/);
  assert.doesNotMatch(html, /<details open class="phase-bucket"/);
  assert.match(html, /dashboard-terminal-tasks/);
  assert.match(html, /<b>Completed<\/b>/);
  assert.match(html, /<b>Cancelled<\/b>/);
  assert.match(html, /terminal-phase-bucket/);
  assert.match(html, /T099/);
  assert.match(html, /Not Phased/);
  assert.doesNotMatch(html, /Dependency Overview/);
  assert.match(html, /Planning Interview/);
  assert.doesNotMatch(html, /data-wc-action="planning-new-plan"/);
  assert.doesNotMatch(html, /data-wc-action="planning-resume-chat"/);
  assert.match(html, /No interview in progress/);
  assert.doesNotMatch(html, /This card updates when/);
  assert.match(html, /Store updated/);
  assert.match(html, /wc-status-counts-scope-note/);
  assert.match(html, /stateSummary/);
  assert.doesNotMatch(html, /same store as execution queue/i);
  assert.doesNotMatch(html, /Suggested Next/i);
  assert.doesNotMatch(html, /dashboard-approvals/);
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
  assert.match(html, /dash-phase-roster-col-phase/);
  assert.match(html, /dash-phase-roster-col-status/);
  assert.match(html, /dash-phase-roster-col-deliverables/);
  assert.match(html, /data-wc-action="phase-deliverables-edit"/);
  assert.match(html, /dash-phase-edit-anchor/);
  assert.match(html, /dash-phase-deliverables-input/);
  assert.match(html, /data-wc-phase-row="95"/);
  assert.match(html, /aria-label="Edit deliverables for phase 95"/);
  assert.match(html, /dash-phase-deliverables-cell/);
  assert.match(html, /dash-phase-deliverables-body/);
  assert.match(html, /dash-phase-no-catalog/);
  assert.doesNotMatch(html, /<label[^>]*dash-phase-deliverables-editor/);
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
  const readinessIdx = html.indexOf("<b>Phase Readiness</b>");
  const tabBarIdx = html.indexOf('class="wc-tab-bar"');
  const queueTabIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const caeTabIdx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="cae"');
  assert.ok(agentIdx !== -1 && readinessIdx > agentIdx);
  assert.ok(tabBarIdx !== -1 && readinessIdx < tabBarIdx);
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
  assert.match(html, /phase-notes-chat/);
  assert.match(html, /phase-note-view/);
  assert.match(html, /phase-note-edit/);
  assert.match(html, /phase-note-delete/);
  assert.match(html, /phase-note-convert/);
  assert.match(html, /phase-notes-propose-persist/);
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
  assert.match(html, /data-agent-status-kind="working_task"/);
  assert.match(html, /Working on Task T123 &lt;script&gt;/);
  assert.match(html, /dash-agent-row/);
  assert.match(html, /aria-label="Working on Task T123 &lt;script&gt;, Current agent"/);
  assert.match(html, /T123/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.indexOf("WC Agent is:") < html.indexOf("Current Phase"));
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
  assert.match(html, /dash-agent-row--subagent/);
  assert.match(html, /aria-label="test-subagent, Subagent"/);
});

test("renderDashboardRootInnerHtml planning card shows resume CLI when session present", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      agentGuidance: {
        schemaVersion: 1,
        profileSetId: "rpg_party_v1",
        tier: 2,
        displayLabel: "Adventurer",
        usingDefaultTier: true,
        temperamentProfileId: "builtin:balanced",
        temperamentLabel: "The Steady Adventurer",
        agentPresentation: {
          schemaVersion: 1,
          mode: "derived",
          workLog: "normal",
          rationale: "simple",
          technicality: "balanced",
          finalAnswerDetail: "normal",
          privateReasoning: "never_disclose"
        }
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
      planningSession: {
        schemaVersion: 1,
        updatedAt: "2026-04-01T12:00:00.000Z",
        planningType: "wishlist",
        outputMode: "wishlist",
        status: "in_progress",
        completionPct: 40,
        answeredCritical: 2,
        totalCritical: 5,
        resumeCli: "pnpm run wk run build-plan '{\"action\":\"resume\"}'"
      },
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
  assert.match(html, /Planning Interview/);
  assert.match(html, /<span class="wc-status-kv-label">Presentation<\/span>/);
  assert.match(html, /Work-log normal/);
  assert.doesNotMatch(html, /data-wc-action="planning-new-plan"/);
  assert.doesNotMatch(html, />New Plan<\/button>/);
  assert.match(html, /Wishlist/);
  assert.match(html, /data-wc-action="planning-resume-chat"/);
  assert.match(html, />Resume<\/button>/);
  assert.match(html, /data-wc-action="planning-discard"/);
  assert.match(html, />Discard<\/button>/);
  assert.match(html, /build-plan/);
  assert.doesNotMatch(html, /copy into a terminal/);
  assert.doesNotMatch(html, /wc-planning-type/);
  assert.match(html, /40%/);
  assert.match(html, /through required questions/);
});

test("renderDashboardRootInnerHtml omits suggested-next section", () => {
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
  assert.doesNotMatch(html, /Suggested Next/i);
  assert.doesNotMatch(html, /T999/);
  assert.match(html, />No Items</);
  assert.doesNotMatch(html, /data-wc-action="planning-new-plan"/);
  assert.doesNotMatch(html, /data-wc-action="planning-resume-chat"/);
  assert.match(html, /No interview in progress/);
  assert.doesNotMatch(html, /This card updates when/);
  assert.match(html, /<span class="wc-status-kv-label">Role<\/span><span class="wc-status-kv-val">Bard<\/span>/);
  assert.match(html, /<span class="wc-status-kv-label">Temperament<\/span><span class="wc-status-kv-val">The Wary Scout<\/span>/);
  assert.match(html, /wc-ready-scope-note/);
  assert.match(html, /wishlist_intake/);
  assert.match(html, /Wishlist intake rows are excluded/);
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
  const longTitles = extractParagraphBoldTitles(html).filter((title) => title.length > 32);
  const longMuted = extractMutedParagraphs(html).filter((text) => text.length > 120);
  assert.deepEqual(longTitles, []);
  assert.deepEqual(longMuted, []);
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
  assert.match(html, /wc-rec-next-wishlist/);
  assert.match(html, /Wishlist backlog item/);
  assert.match(html, /data-wc-action="wishlist-chat"/);
  assert.match(html, /data-wishlist-id="W-open-1"/);
  assert.match(html, /No execution-queue ready work/);
});

test("renderDashboardRootInnerHtml prefers wishlist over ready improvement when execution queue empty", () => {
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
      wishlist: {
        openCount: 1,
        totalCount: 1,
        openTop: [{ id: "W-priority", title: "Process wishlist first", taskId: "T-wl-2" }]
      },
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
  assert.match(html, /wc-rec-next-wishlist/);
  assert.match(html, /Process wishlist first/);
  assert.match(html, /Ready improvement task/);
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
  assert.match(html, /class="wc-btn wc-btn-sm wc-btn-primary"[^>]*data-wc-action="proposed-exe-accept"/);
  assert.match(html, /data-wc-action="proposed-exe-decline"/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.match(html, /T777/);
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
  assert.match(html, /data-wc-action="proposed-imp-accept-phase"/);
  assert.match(html, /data-proposed-task-ids="imp-aaa,imp-bbb"/);
});

test("renderDashboardRootInnerHtml shows readyQueueBreakdown when present", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 4, in_progress: 0, blocked: 0, completed: 0 },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 3, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 1, top: [] },
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
  assert.match(html, /Ready Queue · 3 Improvements · 1 Other/);
});

test("buildPhaseCompleteReleaseChatPrompt is one-shot delivery + closeout with concrete branch when phaseKey set", () => {
  const p = buildPhaseCompleteReleaseChatPrompt("Phase 64", { phaseKey: "64" });
  assert.match(p, /The operator added this context: \*\*Phase 64\*\*/);
  assert.match(p, /\*\*Mission:\*\*/);
  assert.match(p, /@\.ai\/playbooks\/phase-closeout-and-release\.md/);
  assert.match(p, /@\.ai\/playbooks\/task-to-phase-branch\.md/);
  assert.match(p, /@\.ai\/MACHINE-PLAYBOOKS\.md/);
  assert.match(p, /Stage A.*§2/);
  assert.match(p, /\*\*`release\/phase-64`\*\*/);
  assert.match(p, /\*\*`release\/phase-64`\*\* → \*\*`main`\*\*/);
  assert.match(p, /Hard gate.*§3/);
  assert.match(p, /task-to-phase-branch/);
  assert.match(p, /playbook-task-to-phase-branch\.mdc/);
  assert.match(p, /playbook-phase-closeout\.mdc/);
  assert.match(p, /handoff/i);
});

test("buildPhaseCompleteReleaseChatPrompt without phaseKey keeps placeholder branch", () => {
  const p = buildPhaseCompleteReleaseChatPrompt("Phase 64");
  assert.match(p, /release\/phase-<N>/);
  assert.doesNotMatch(p, /release\/phase-64/);
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
  assert.match(html, /data-wc-phase-phrase="Phase 64"/);
  assert.match(html, /Complete &amp; Release/);
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
  assert.match(html, /Response-only/);
  assert.match(html, /data-wc-action="planning-wizard-dismiss"/);
});

test("renderDashboardRootInnerHtml embeds planning wizard panel when provided", () => {
  const html = renderDashboardRootInnerHtml(
    {
      ok: true,
      data: {
        stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
        proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
        proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
        readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
        readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
        wishlist: { openCount: 0, totalCount: 0, openTop: [] },
        blockedSummary: { count: 0, top: [] },
        suggestedNext: null,
        planningSession: null,
        taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
        workspaceStatus: null,
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
    },
    { kind: "picker" }
  );
  assert.match(html, /dash-planning-wizard/);
  assert.match(html, /wc-planning-type/);
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
