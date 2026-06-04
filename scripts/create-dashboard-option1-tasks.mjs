#!/usr/bin/env node
/**
 * One-shot: create Option 1 dashboard plan tasks in task engine.
 * Usage: node scripts/create-dashboard-option1-tasks.mjs [planningGeneration]
 */
import { spawnSync } from "node:child_process";

function readPlanningGeneration() {
  const r = spawnSync("pnpm", ["exec", "wk", "run", "get-next-actions", "{}"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = r.stdout || "";
  for (let i = out.indexOf("{"); i >= 0; i = out.indexOf("{", i + 1)) {
    try {
      const j = JSON.parse(out.slice(i));
      if (j.ok && j.data?.planningGeneration != null) {
        return Number(j.data.planningGeneration);
      }
    } catch {
      /* continue */
    }
  }
  throw new Error("Could not read planningGeneration");
}

/**
 * Resume after partial run:
 *   node script.mjs --resume T100583
 *   node script.mjs --resume-json '{"T583":"T100583","T584":"T100587"}'
 */
const resumeJsonArg = process.argv.includes("--resume-json")
  ? process.argv[process.argv.indexOf("--resume-json") + 1]
  : null;
const resumeId = process.argv.includes("--resume")
  ? process.argv[process.argv.indexOf("--resume") + 1]
  : null;
const policyApproval = {
  confirmed: true,
  rationale: "Create Option 1 dashboard state-store plan tasks",
};

const TASKS = [
  {
    title: "Dashboard data map (slice → source → UI)",
    summary:
      "Author machine dashboard data map linking kit sources to dashboard sections and slice freshness SLAs.",
    dependsOn: [],
    technicalScope: [
      ".ai/runbooks/dashboard-data-map.md",
      ".ai/plans/dashboard-option-1-state-store-and-pollers.md",
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-section-registry.ts",
    ],
    acceptanceCriteria: [
      "Map covers handoff initial known map plus lazy list-tasks buckets and config host reads",
      "Each row documents source command, builder, UI section, freshness SLA, and mutation invalidation kind",
      "Map linked from .ai/plans/dashboard-option-1-state-store-and-pollers.md",
    ],
    metadata: { handoffStep: "source-mapping" },
  },
  {
    title: "Dashboard snapshot types, slice registry, DataStore + tests",
    summary:
      "Add DashboardDataStore, slice registry, snapshot types; unit tests for change detection and last-good-on-error.",
    dependsOn: ["T583"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-snapshot-types.ts",
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts",
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-data-store.ts",
      "extensions/cursor-workflow-cannon/test/dashboard-data-store.test.mjs",
    ],
    acceptanceCriteria: [
      "Store emits DashboardSliceUpdate only when slice value or status changes",
      "dashboard-data-store.test.mjs passes",
      "No webview behavior change yet",
    ],
    metadata: { handoffStep: "store-foundation" },
  },
  {
    title: "Wire DashboardViewProvider to render from store snapshot",
    summary:
      "Bridge DashboardViewProvider to DashboardDataStore; patchSectionsFromSnapshot; preserve paint lane bootstrap.",
    dependsOn: ["T584"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts",
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-refresh-controller.ts",
    ],
    acceptanceCriteria: [
      "Dashboard loads without regression vs startup direct path",
      "dashboard-summary can feed multiple store slices",
      "wcReplaceRoot / section patch behavior unchanged for mutations",
    ],
    metadata: { handoffStep: "provider-bridge" },
  },
  {
    title: "DashboardPollerCoordinator (critical/queue/ops/status groups)",
    summary:
      "Targeted pollers with single-flight per slice; retire 45s global poll; refreshCriticalNow on resolve.",
    dependsOn: ["T585"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-pollers.ts",
      "extensions/cursor-workflow-cannon/test/dashboard-pollers.test.mjs",
      "extensions/cursor-workflow-cannon/src/extension.ts",
    ],
    acceptanceCriteria: [
      "Critical slices refresh within 5s on normal workspace",
      "Visible non-heavy slices within 10s",
      "Mutations do not block behind refresh reads",
      "dashboard-pollers.test.mjs passes",
    ],
    metadata: { handoffStep: "pollers" },
  },
  {
    title: "dashboard-summary builder split by projection",
    summary:
      "Refactor kit dashboard-summary to buildDashboardBase + projection builders; cheaper overview path.",
    dependsOn: ["T584"],
    technicalScope: [
      "src/modules/task-engine/commands/task-engine-dashboard-on-command.ts",
      "src/modules/task-engine/dashboard/dashboard-summary-projection.ts",
      "src/modules/task-engine/instructions/dashboard-summary.md",
      "scripts/bench-dashboard-refresh.mjs",
    ],
    acceptanceCriteria: [
      "pnpm run check passes",
      "bench shows materially lower ms for overview vs full rebuild",
      "Projections remain backward compatible",
      "Extension pollers use smallest projection per slice registry",
    ],
    metadata: { handoffStep: "kit-builders" },
  },
  {
    title: "Dashboard stale/fresh UI markers per section",
    summary:
      "Per-section freshness copy from slice status and updatedAt in patchSectionsFromSnapshot.",
    dependsOn: ["T585"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard-shell.ts",
      "extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts",
    ],
    acceptanceCriteria: [
      "Visible sections never imply fresh when slice is stale or error",
      "Last good HTML remains during refresh failure",
    ],
    metadata: { handoffStep: "freshness-ui" },
  },
  {
    title: "Mutation → slice invalidation + poller pause/resume",
    summary:
      "Map DashboardMutationKind to stale slices; pause pollers on mutation; refreshSlicesNow on success.",
    dependsOn: ["T586"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-section-invalidation.ts",
      "extensions/cursor-workflow-cannon/test/dashboard-targeted-invalidation.test.mjs",
    ],
    acceptanceCriteria: [
      "task-queue mutation stale overview, queue, phase, agent within one refresh cycle",
      "Drawer workflows unchanged; planningGeneration ingested from slice payloads",
    ],
    metadata: { handoffStep: "mutation-slices" },
  },
  {
    title: "Option 1 stabilize: load trace, bench gates, acceptance",
    summary:
      "dashboard-load-trace, bench SLA gates, handoff DoD verification; document Option 2 deferred.",
    dependsOn: ["T586", "T588", "T589"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-load-trace.ts",
      "scripts/bench-dashboard-refresh.mjs",
      ".ai/plans/dashboard-option-1-state-store-and-pollers.md",
    ],
    acceptanceCriteria: [
      "Trace answers which slice/command was slow from output channel",
      "All handoff Option 1 acceptance tests exist and pass",
      "Plan documents Option 2 deferred until green",
    ],
    metadata: { handoffStep: "stabilize" },
  },
];

function runCreate(payload) {
  const r = spawnSync(
    "pnpm",
    ["exec", "wk", "run", "create-task", JSON.stringify(payload)],
    {
      cwd: new URL("..", import.meta.url).pathname,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const out = r.stdout || "";
  let j = null;
  for (let i = out.indexOf("{"); i >= 0; i = out.indexOf("{", i + 1)) {
    try {
      const parsed = JSON.parse(out.slice(i));
      if (typeof parsed.ok === "boolean") j = parsed;
    } catch {
      /* try next brace */
    }
  }
  if (!j) {
    throw new Error(`No JSON in wk output: ${out.slice(0, 800)}`);
  }
  if (!j.ok) {
    throw new Error(`${j.code}: ${j.message}`);
  }
  return j.data.task;
}

const ids = resumeJsonArg ? JSON.parse(resumeJsonArg) : {};
if (resumeId) {
  ids.T583 = resumeId;
  console.log(`Resuming: T583=${resumeId}`);
}
if (Object.keys(ids).length) {
  console.log("Seeded ids:", ids);
}

const slots = ["T583", "T584", "T585", "T586", "T587", "T588", "T589", "T590"];
for (let idx = 0; idx < TASKS.length; idx++) {
  const spec = TASKS[idx];
  const slot = slots[idx];
  if (ids[slot]) continue;
  const dependsOn = spec.dependsOn.map((key) => {
    if (!ids[key]) throw new Error(`Missing dependency ${key}`);
    return ids[key];
  });

  const task = runCreate({
    allocateId: true,
    status: "proposed",
    type: "workspace-kit",
    title: spec.title,
    phaseKey: "121",
    phase: "Phase 121",
    priority: "P1",
    summary: spec.summary,
    dependsOn: dependsOn.length ? dependsOn : undefined,
    technicalScope: spec.technicalScope,
    acceptanceCriteria: spec.acceptanceCriteria,
    metadata: {
      epic: "dashboard-option-1-state-store",
      planPath: ".ai/plans/dashboard-option-1-state-store-and-pollers.md",
      ...spec.metadata,
    },
    expectedPlanningGeneration: readPlanningGeneration(),
    policyApproval,
  });

  ids[slot] = task.id;
  console.log(`${task.id}\t${spec.title}`);
}

console.log("\nJSON_IDS=" + JSON.stringify(ids));
