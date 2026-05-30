#!/usr/bin/env node
/**
 * Create Option 2 dashboard read-service plan tasks (phase 122).
 * Usage: node scripts/create-dashboard-option2-tasks.mjs
 * Resume: node scripts/create-dashboard-option2-tasks.mjs --resume-json '{"T601":"T100594"}'
 */
import { spawnSync } from "node:child_process";

const OPTION1_GATE = "T100593";

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

const resumeJsonArg = process.argv.includes("--resume-json")
  ? process.argv[process.argv.indexOf("--resume-json") + 1]
  : null;

const policyApproval = {
  confirmed: true,
  rationale: "Create Option 2 dashboard read-service plan tasks (phase 122)",
};

const TASKS = [
  {
    title: "Dashboard service contracts + dataSource config",
    summary:
      "Versioned HTTP/SSE contracts and dashboard.dataSource (cli-polling | service | auto default auto).",
    dependsOn: [OPTION1_GATE],
    technicalScope: [
      "src/contracts/dashboard-snapshot.ts",
      "src/contracts/dashboard-events.ts",
      ".workspace-kit/config.json",
      ".ai/plans/dashboard-option-2-read-service.md",
    ],
    acceptanceCriteria: [
      "DashboardServiceSnapshot and DashboardServiceEvent shared by kit and extension",
      "dashboard.dataSource auto|service|cli-polling validated at service start",
    ],
    metadata: { handoffStep: "contracts-config" },
  },
  {
    title: "Kit dashboard read service (HTTP routes, snapshot store)",
    summary:
      "Long-lived workspace-kit process: /health, /snapshot, /slices/*, SSE /dashboard/events; warm SQLite.",
    dependsOn: ["T601"],
    technicalScope: [
      "src/services/dashboard-service/server.ts",
      "src/services/dashboard-service/routes.ts",
      "src/services/dashboard-service/snapshot-store.ts",
      "src/services/dashboard-service/slice-refreshers.ts",
      "src/services/dashboard-service/events.ts",
    ],
    acceptanceCriteria: [
      "Read-only SQLite; mutations still via CLI policy paths",
      "SSE emits dashboard.slice.updated and dashboard.snapshot.updated",
    ],
    metadata: { handoffStep: "service-process" },
  },
  {
    title: "Dashboard service watchers + tiered refresh intervals",
    summary:
      "Task/planning/config/git watchers plus backup intervals (critical 1-2s, queue 3-5s, ops 10s).",
    dependsOn: ["T602"],
    technicalScope: ["src/services/dashboard-service/watchers.ts"],
    acceptanceCriteria: [
      "POST /dashboard/refresh forces selected slices",
      "Critical slices <=2s; visible slices <=10s on warm service",
    ],
    metadata: { handoffStep: "watchers-intervals" },
  },
  {
    title: "wk run dashboard-service lifecycle + runtime metadata",
    summary:
      "dashboard-service-start/stop/status/snapshot; runtime.json, pid, service.log under .workspace-kit/dashboard-service/.",
    dependsOn: ["T602"],
    technicalScope: [
      "src/modules/task-engine/commands/",
      "src/modules/task-engine/instructions/",
    ],
    acceptanceCriteria: [
      "Start binds dynamic localhost port; status returns pid port generation uptime",
      "Idempotent start and stop",
    ],
    metadata: { handoffStep: "lifecycle-cli" },
  },
  {
    title: "ServiceDashboardDataSource (HTTP + SSE client)",
    summary:
      "Extension DashboardDataSource implementation feeding DashboardDataStore from kit service.",
    dependsOn: ["T601", "T604"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/views/dashboard/service-dashboard-data-source.ts",
    ],
    acceptanceCriteria: [
      "start/stop/refreshSlice/getSnapshot/subscribe wired to store",
      "Warm snapshot under 1 second; planningGeneration ingested from payloads",
    ],
    metadata: { handoffStep: "extension-datasource" },
  },
  {
    title: "auto dataSource mode, health probe, CLI fallback, mode badge",
    summary:
      "Default auto: try service health then CliPollingDashboardDataSource; user commands for restart and CLI mode.",
    dependsOn: ["T605"],
    technicalScope: [
      "extensions/cursor-workflow-cannon/src/extension.ts",
      "extensions/cursor-workflow-cannon/package.json",
    ],
    acceptanceCriteria: [
      "Service unavailable falls back without blanking sections",
      "Dashboard shows active data source mode",
    ],
    metadata: { handoffStep: "auto-fallback" },
  },
  {
    title: "Dashboard service observability (health, per-slice timing)",
    summary:
      "Expose uptime, last refresh per slice, errors, avg duration, generation, planningGeneration on /health.",
    dependsOn: ["T602"],
    technicalScope: ["src/services/dashboard-service/routes.ts"],
    acceptanceCriteria: [
      "Operators can diagnose slow or failing slices without CLI spawn",
    ],
    metadata: { handoffStep: "observability" },
  },
  {
    title: "Option 2 stabilize: tests, bench, DoD verification",
    summary:
      "Integration tests, bench gates, Option 2 Done criteria; document dependency on Option 1.",
    dependsOn: ["T606", "T607", "T603"],
    technicalScope: [
      "scripts/bench-dashboard-refresh.mjs",
      ".ai/plans/dashboard-option-2-read-service.md",
    ],
    acceptanceCriteria: [
      "Warm snapshot under 1s; cold under 5s; critical under 2s; visible under 10s",
      "No repeated CLI spawn during normal auto operation",
      "CLI poller fallback verified when service down",
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
      /* try next */
    }
  }
  if (!j) throw new Error(`No JSON in wk output: ${out.slice(0, 800)}`);
  if (!j.ok) throw new Error(`${j.code}: ${j.message}`);
  return j.data.task;
}

const ids = resumeJsonArg ? JSON.parse(resumeJsonArg) : {};
const slots = ["T601", "T602", "T603", "T604", "T605", "T606", "T607", "T608"];

for (let idx = 0; idx < TASKS.length; idx++) {
  const spec = TASKS[idx];
  const slot = slots[idx];
  if (ids[slot]) continue;

  const dependsOn = spec.dependsOn.map((key) => {
    if (key === OPTION1_GATE) return OPTION1_GATE;
    if (!ids[key]) throw new Error(`Missing dependency ${key}`);
    return ids[key];
  });

  const task = runCreate({
    allocateId: true,
    status: "proposed",
    type: "workspace-kit",
    title: spec.title,
    phaseKey: "122",
    phase: "Phase 122",
    priority: "P1",
    summary: spec.summary,
    dependsOn: dependsOn.length ? dependsOn : undefined,
    technicalScope: spec.technicalScope,
    acceptanceCriteria: spec.acceptanceCriteria,
    metadata: {
      epic: "dashboard-option-2-read-service",
      planPath: ".ai/plans/dashboard-option-2-read-service.md",
      option2Decisions: {
        servicePlacement: "2b_kit",
        transport: "http_sse",
        phaseKey: "122",
        cliSurface: "wk_run",
        defaultDataSource: "auto",
        refreshModel: "watchers_plus_intervals",
      },
      ...spec.metadata,
    },
    expectedPlanningGeneration: readPlanningGeneration(),
    policyApproval,
  });

  ids[slot] = task.id;
  console.log(`${task.id}\t${spec.title}`);
}

console.log("\nJSON_IDS=" + JSON.stringify(ids));
