import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

const dbPath = '.workspace-kit/tasks/workspace-kit.db';
const db = new Database(dbPath);

// 1. Determine next available task ID
const maxRow = db.prepare("SELECT id FROM task_engine_tasks ORDER BY CAST(substr(id, 2) AS INTEGER) DESC LIMIT 1").get();
const startNum = maxRow ? parseInt(maxRow.id.slice(1), 10) + 1 : 100660;
console.log(`Starting task ID allocation from: T${startNum}`);

// 2. Fetch current planning generation
const pgRow = db.prepare("SELECT planning_generation FROM workspace_planning_state WHERE id = 1").get();
const currentPlanningGen = pgRow ? pgRow.planning_generation : 0;
console.log(`Current planning generation: ${currentPlanningGen}`);

const PHASE_KEY = "129";
const PHASE_LABEL = "Phase 129";
const PLAN_REF = "AGENT_CARD_PLAN.md";

// WBS rows to register (T-AC-050 to T-AC-502)
const ROWS = [
  {
    wbsId: "T-AC-050",
    title: "Implement Agent Activity Projection Builder",
    approach: "Creates the stability boundary between volatile backend state and dashboard UI.",
    scope: [
      "Normalize current sources into DashboardAgentActivitySummary.",
      "Implement row id generation, display-name resolution, main-agent selection, source precedence, and duplicate merge rules.",
      "Implement freshness and attention calculation, preserving derived fallback."
    ],
    ac: [
      "Projection can be built from current live activity leases.",
      "Projection can include/enrich from task/team/subagent data.",
      "Duplicate sources do not create duplicate rows for the same work.",
      "Renderer does not need to know source-specific shapes."
    ],
    priority: "P1",
    dependsOnWbs: []
  },
  {
    wbsId: "T-AC-101",
    title: "Feed all active live activity leases into the projection",
    approach: "Unlocks multi-agent visibility from current data.",
    scope: [
      "Use listCurrentAgentActivityLeases rather than only readCurrentAgentActivityLease.",
      "Pass leases into the projection builder.",
      "Preserve existing single agentStatus behavior.",
      "Include active count and generatedAt."
    ],
    ac: [
      "Multiple active leases appear in projected summary.",
      "Expired leases are excluded from active rows.",
      "Existing agentStatus still works.",
      "When no live leases exist, derived status remains available."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-050"]
  },
  {
    wbsId: "T-AC-102",
    title: "Enrich projection rows with task title and phase context",
    approach: "Makes rows human-readable.",
    scope: [
      "Join taskId to task title where available.",
      "Preserve raw task id if task does not exist.",
      "Include phase key from lease or task fallback.",
      "Include task status if cheap and useful."
    ],
    ac: [
      "Activity rows display T### — title when task exists.",
      "Missing task does not fail dashboard summary.",
      "Phase key is populated from best available source."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-050"]
  },
  {
    wbsId: "T-AC-103",
    title: "Parse useful custom agent metadata from details",
    approach: "Allows custom agents to identify themselves without a new table.",
    scope: [
      "Parse known detail keys (agentDisplayName, customAgentName) from lease details.",
      "Clean metadata parsing logic."
    ],
    ac: [
      "Known detail keys appear in structured row fields or expanded metadata.",
      "Unknown detail keys are not rendered in compact card.",
      "Malformed details do not break dashboard summary."
    ],
    priority: "P2",
    dependsOnWbs: ["T-AC-050"]
  },
  {
    wbsId: "T-AC-201",
    title: "Render compact Agent Activity Board from projection only",
    approach: "Converts data into immediate human understanding.",
    scope: [
      "Render card header with freshness and source.",
      "Render Main Agent row and Active Agents list.",
      "Render Needs Attention list and footer summary."
    ],
    ac: [
      "One live activity renders as main agent.",
      "Multiple live activities render in active list.",
      "No live activity renders derived fallback.",
      "Empty state is clear and not alarming.",
      "Renderer does not depend on raw lease/team/subagent shapes."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-050"]
  },
  {
    wbsId: "T-AC-202",
    title: "Add status chips and attention sorting",
    approach: "Makes action-required states visible first.",
    scope: [
      "Map DashboardAgentStatusKind to human chip labels.",
      "Sort needs-attention states first.",
      "Separate routine active agents from attention rows."
    ],
    ac: [
      "Awaiting approval/human gate rows appear before routine work.",
      "Blocked rows appear in Needs Attention.",
      "Working/validating/planning rows appear in Active Agents."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-201"]
  },
  {
    wbsId: "T-AC-203",
    title: "Add freshness labels and stale handling",
    approach: "Prevents stale activity from misleading users.",
    scope: [
      "Show relative updated time.",
      "Label stale activities.",
      "Hide expired activities from active rows."
    ],
    ac: [
      "Fresh lease says updated seconds/minutes ago.",
      "Stale lease is labeled stale.",
      "Expired lease is not shown as active."
    ],
    priority: "P2",
    dependsOnWbs: ["T-AC-201"]
  },
  {
    wbsId: "T-AC-204",
    title: "Add expandable row details",
    approach: "Keeps overview clean while preserving inspectability.",
    scope: [
      "Compact view remains readable.",
      "Expanded row reveals technical context.",
      "Raw JSON is hidden unless expanded."
    ],
    ac: [
      "Compact view remains readable.",
      "Expanded row reveals technical context.",
      "Raw JSON is hidden unless explicitly expanded/debug."
    ],
    priority: "P2",
    dependsOnWbs: ["T-AC-201"]
  },
  {
    wbsId: "T-AC-301",
    title: "Add agent activity projection/slice",
    approach: "Enables frequent updates without full dashboard refresh.",
    scope: [
      "Support dashboard-summary projection filter.",
      "Projection excludes heavy queue/status rollups."
    ],
    ac: [
      "Agent activity can be refreshed independently.",
      "Projection excludes heavy queue/status rollups.",
      "Existing full/overview projections remain compatible."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-050"]
  },
  {
    wbsId: "T-AC-302",
    title: "Poll/patch activity slice while dashboard is visible",
    approach: "Makes the panel feel live before the service/event stream exists.",
    scope: [
      "Poll every 3 seconds while dashboard is visible.",
      "Pause/defer during mutation locks."
    ],
    ac: [
      "Updating set-agent-activity is visible within 5 seconds.",
      "No full dashboard reload is required.",
      "Mutations are not blocked by this polling."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-301"]
  },
  {
    wbsId: "T-AC-303",
    title: "Prepare event-stream compatibility",
    approach: "Avoids rework when dashboard service arrives.",
    scope: [
      "Keep renderer data-source agnostic.",
      "Define event payload shape for future service."
    ],
    ac: [
      "Future service can emit agentActivity.updated or slice update events into same renderer contract."
    ],
    priority: "P2",
    dependsOnWbs: ["T-AC-301"]
  },
  {
    wbsId: "T-AC-401",
    title: "Add agent-facing activity usage guidance",
    approach: "The panel is only as good as the activity agents report.",
    scope: [
      "starting/changing/blocking/validating/reviewing/releasing step instructions.",
      "Docs explain TTL/heartbeat expectations."
    ],
    ac: [
      "Agent docs include rich example payload.",
      "Docs define useful details keys.",
      "Docs explain TTL/heartbeat expectations."
    ],
    priority: "P1",
    dependsOnWbs: []
  },
  {
    wbsId: "T-AC-402",
    title: "Add automatic activity hooks at known command boundaries",
    approach: "Reduces reliance on agents remembering to report activity.",
    scope: [
      "Hook run-transition start/complete, validations, and human gates."
    ],
    ac: [
      "Key commands record useful activity without manual agent effort.",
      "Manual set-agent-activity remains supported.",
      "Hooks do not create noisy or misleading long-lived leases."
    ],
    priority: "P2",
    dependsOnWbs: ["T-AC-401"]
  },
  {
    wbsId: "T-AC-501",
    title: "Add comprehensive render fixtures",
    approach: "Prevents dashboard regressions.",
    scope: [
      "Generate fixtures covering various multi-agent states and stale/expired leases."
    ],
    ac: [
      "Render tests cover all key states.",
      "Sorting is deterministic.",
      "HTML is accessible and stable."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-201"]
  },
  {
    wbsId: "T-AC-502",
    title: "Add dashboard data contract/projection tests",
    approach: "Protects backend summary shape and projection behavior.",
    scope: [
      "Contract test for multiple current activity leases, enriched titles, and projection merge."
    ],
    ac: [
      "Dashboard summary payload remains versioned and stable.",
      "Tests fail if multiple activities regress to single activity.",
      "Tests fail if duplicate sources produce duplicate active rows."
    ],
    priority: "P1",
    dependsOnWbs: ["T-AC-050"]
  }
];

// Map WBS IDs to numeric IDs
const wbsToId = new Map();
ROWS.forEach((row, i) => {
  wbsToId.set(row.wbsId, `T${startNum + i}`);
});

// Construct tasks payload
const tasks = ROWS.map((row) => {
  const id = wbsToId.get(row.wbsId);
  const dependsOn = row.dependsOnWbs.map(w => wbsToId.get(w)).filter(Boolean);
  
  return {
    id,
    title: row.title,
    type: "workspace-kit",
    priority: row.priority,
    status: dependsOn.length === 0 ? "ready" : "proposed",
    phaseKey: PHASE_KEY,
    phase: PHASE_LABEL,
    approach: row.approach,
    summary: row.approach,
    technicalScope: row.scope,
    acceptanceCriteria: row.ac,
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    metadata: {
      wbsId: row.wbsId,
      planRef: PLAN_REF,
      planningProvenance: {
        source: "persist-planning-execution-drafts",
        planningType: "sprint-phase",
        planRef: PLAN_REF
      }
    }
  };
});

const payload = {
  targetPhaseKey: PHASE_KEY,
  targetPhase: PHASE_LABEL,
  desiredStatus: "proposed",
  planRef: PLAN_REF,
  planningType: "sprint-phase",
  clientMutationId: `agent-card-tasks-${Date.now()}`,
  expectedPlanningGeneration: currentPlanningGen,
  tasks
};

console.log("Tasks payload prepared. Executing persist-planning-execution-drafts command...");
const r = spawnSync(
  "pnpm",
  ["exec", "wk", "run", "persist-planning-execution-drafts", JSON.stringify(payload)],
  {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  }
);

console.log("STDOUT:");
console.log(r.stdout);
console.log("STDERR:");
console.log(r.stderr);
if (r.status !== 0) {
  process.exit(r.status || 1);
}
console.log("Tasks successfully materialized!");
