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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  assert.match(html, /<b>Role:<\/b> Adventurer/);
  assert.match(html, /<b>Agent Temperament:<\/b> The Steady Adventurer/);
  assert.match(html, /dashboard-overview/);
  assert.match(html, /dash-overview-phase-row/);
  assert.match(html, /data-wc-action="deliver-phase-prompt"/);
  assert.match(html, />Deliver<\/button>/);
  assert.match(html, /Current Phase/);
  assert.match(html, /Next Phase/);
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
  const tasksHeading = html.indexOf("<p><b>Tasks</b></p>");
  const quickBar = html.indexOf("dash-quick-actions");
  assert.ok(quickBar !== -1 && tasksHeading !== -1 && quickBar < tasksHeading);
  assert.match(html, /<p><b>Tasks<\/b><\/p>/);
  assert.match(html, /dash-count-grid/);
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
  assert.match(html, /imp-example/);
  assert.match(html, /T319/);
  assert.match(html, /T320/);
  assert.match(html, /W1/);
  assert.match(html, /class="dash-row-action dash-row-action-tertiary"[^>]*data-wc-action="wishlist-view"/);
  assert.match(html, />View<\/button>/);
  assert.match(html, /class="dash-row-action dash-row-action-primary"[^>]*data-wc-action="wishlist-chat"/);
  assert.match(html, />Process<\/button>/);
  assert.match(html, /class="dash-row-action dash-row-action-secondary"[^>]*data-wc-action="wishlist-decline"/);
  assert.match(html, />Decline<\/button>/);
  assert.match(html, /data-task-id="T501"/);
  assert.match(html, /class="dash-row-action dash-row-action-primary"[^>]*data-wc-action="proposed-imp-accept"/);
  assert.match(html, /data-wc-action="proposed-imp-decline"/);
  assert.doesNotMatch(html, /proposed-imp-chat/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.match(html, /data-wc-action="task-detail"/);
  assert.match(html, /class="dash-row-action dash-row-action-tertiary"[^>]*data-wc-action="task-detail"/);
  assert.match(html, /data-wc-action="task-detail"[\s\S]*?>View<\/button>/);
  assert.match(html, /dash-row-action/);
  assert.match(html, /phase-bucket/);
  assert.doesNotMatch(html, /<details open class="phase-bucket"/);
  assert.match(html, /dashboard-terminal-tasks/);
  assert.match(html, /<b>Completed<\/b>/);
  assert.match(html, /<b>Cancelled<\/b>/);
  assert.match(html, /terminal-phase-bucket/);
  assert.match(html, /T099/);
  assert.match(html, /Not Phased/);
  assert.doesNotMatch(html, /Dependency Overview/);
  assert.match(html, /Planning Interview/);
  assert.match(html, /data-wc-action="planning-new-plan"/);
  assert.match(html, /No interview in progress/);
  assert.match(html, /Store Updated/);
  assert.doesNotMatch(html, /same store as execution queue/i);
  assert.doesNotMatch(html, /Suggested Next/i);
  assert.match(html, /dashboard-approvals/);
  assert.match(html, /Chat and this dashboard are not approval/);
  assert.match(html, /list-approval-queue/);
});

test("renderDashboardRootInnerHtml approvals section lists review queue and review-item example", () => {
  const summary = {
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2" }
    }
  };
  const aq = {
    ok: true,
    code: "approval-queue-listed",
    data: {
      reviewItemQueue: [{ id: "T900", title: "Example imp", status: "ready", phase: "Phase 1", priority: "P2" }],
      operatorHints: {
        reviewItemExample: "pnpm exec wk run review-item '{\"taskId\":\"T900\"}'"
      }
    }
  };
  const html = renderDashboardRootInnerHtml(summary, aq);
  assert.match(html, /Review-item queue/);
  assert.match(html, /T900/);
  assert.match(html, /Example imp/);
  assert.match(html, /review-item/);
  assert.match(html, /pnpm exec wk run review-item/);
  assert.match(
    html,
    /class="dash-row-action dash-row-action-tertiary"[^>]*data-wc-action="task-detail"[^>]*data-task-id="T900"/
  );
  assert.match(html, /data-wc-action="task-detail"[\s\S]*?data-task-id="T900"[\s\S]*?>View<\/button>/);
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
        temperamentLabel: "The Steady Adventurer"
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
  assert.match(html, /data-wc-action="planning-new-plan"/);
  assert.match(html, />New Plan<\/button>/);
  assert.match(html, /Wishlist/);
  assert.match(html, /Resume/);
  assert.match(html, /build-plan/);
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
  assert.match(html, /data-wc-action="planning-new-plan"/);
  assert.match(html, /No interview in progress/);
  assert.match(html, /<b>Role:<\/b> Bard/);
  assert.match(html, /<b>Agent Temperament:<\/b> The Wary Scout/);
});

test("renderDashboardRootInnerHtml shows Not Planned when next phase duplicates current", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
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
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "14", nextKitPhase: "14", activeFocus: "Test" },
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
  assert.match(html, /Next Phase<\/b> Not Planned/);
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

test("renderDashboardRootInnerHtml disables Deliver with no-ready tooltip when current phase bucket is empty", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
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
  assert.match(html, /class="dash-deliver-chip"[^>]*disabled/);
  assert.match(html, /There are no ready to work tasks for this phase/);
  assert.doesNotMatch(html, /class="dash-deliver-chip"[^>]*data-wc-action="deliver-phase-prompt"/);
});

test("renderDashboardRootInnerHtml enables Deliver when ready execution exists in current phase bucket", () => {
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
        top: [],
        phaseBuckets: [
          {
            schemaVersion: 1,
            phaseKey: "1",
            label: "Phase 1 (current) (1)",
            count: 1,
            top: []
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
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: deliverTestDepOverview
    }
  });
  assert.match(html, /class="dash-deliver-chip"[^>]*data-wc-action="deliver-phase-prompt"/);
  assert.doesNotMatch(html, /class="dash-deliver-chip"[^>]*disabled/);
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
  assert.match(html, /class="dash-row-action dash-row-action-primary"[^>]*data-wc-action="proposed-exe-accept"/);
  assert.match(html, /data-wc-action="proposed-exe-decline"/);
  assert.doesNotMatch(html, /proposed-exe-chat/);
  assert.match(html, /T777/);
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

test("buildPhaseCompleteReleaseChatPrompt matches phase-closeout template", () => {
  assert.equal(
    buildPhaseCompleteReleaseChatPrompt("Phase 64"),
    "The operator added this context: **Phase 64**\n\n" +
      "Follow **`.ai/playbooks/phase-closeout-and-release.md`** (playbook id **`phase-closeout-and-release`**).\n\n" +
      "Operator entrypoint: Cursor slash **`/complete-phase <N> [approve-release]`** — **`.cursor/commands/complete-phase.md`**. " +
      "Include **`approve-release`** only when explicitly authorizing publish/tag/npm after **`main`** merge; **without it, stop before publish automation** (**`.ai/RELEASING.md`**, playbook §4).\n\n" +
      "Treat **`release/phase-<N>`** as the phase integration branch; validate there, merge **`release/phase-<N>`** → **`main`**, then cut the release per **`.ai/RELEASING.md`**.\n\n" +
      "**Slash and chat express intent only.** Tier A/B **`workspace-kit run`** still requires JSON **`policyApproval`** on the **third** CLI argument (**`.ai/POLICY-APPROVAL.md`**, **`.ai/AGENT-CLI-MAP.md`**).\n\n" +
      "At **§7 Phase delivery summary**, paste the template with **every** token expanded — evidence rules: **`{featureMarkdownBullets}`**, **`{optionalNotesBlockOrEmpty}`** (no stale **`{feature}`** placeholders).\n\n" +
      "Optional: **`.cursor/rules/playbook-phase-closeout.mdc`**."
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
  assert.match(html, /class="dash-phase-release-btn"/);
  assert.match(html, /data-wc-action="phase-complete-release"/);
  assert.match(html, /data-wc-phase-phrase="Phase 64"/);
  assert.match(html, /Complete &amp; Release/);
  assert.match(html, /phase-bucket-summary/);
});

test("renderPlanningInterviewWizardPanel picker wires start control and planning type select", () => {
  const html = renderPlanningInterviewWizardPanel({ kind: "picker" });
  assert.match(html, /id="wc-planning-type"/);
  assert.match(html, /data-wc-action="planning-wizard-start"/);
  assert.match(html, /value="change"/);
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
    undefined,
    { kind: "picker" }
  );
  assert.match(html, /dash-planning-wizard/);
  assert.match(html, /wc-planning-type/);
});
