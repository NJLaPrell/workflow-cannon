import fs from "node:fs";
import { spawnSync } from "node:child_process";

const PLAN_ID = "d0283a5e-a782-4700-83c0-7a5824d6dd3c";
const STRIP = new Set([
  "ideaId",
  "brainstorm",
  "plan",
  "agentDirective",
  "createdAt",
  "updatedAt",
  "review",
  "acceptance",
  "delivery"
]);

const WBS_TO_TASK = {
  "WBS-1": "T100816",
  "WBS-2": "T100817",
  "WBS-3": "T100818",
  "WBS-4": "T100819",
  "WBS-5": "T100820",
  "WBS-6": "T100821",
  "WBS-7": "T100822",
  "WBS-8": "T100823",
  "WBS-9": "T100824",
  "WBS-10": "T100825",
  "WBS-11": "T100826",
  "WBS-12": "T100827",
  "WBS-26": "T100828",
  "WBS-27": "T100829",
  "WBS-28": "T100830",
  "WBS-29": "T100831",
  "WBS-30": "T100832",
  "WBS-16": "T100833",
  "WBS-20": "T100834",
  "WBS-22": "T100835"
};

const PHASE_144 = new Set(["WBS-13", "WBS-14", "WBS-15", "WBS-18", "WBS-24", "WBS-25", "WBS-31"]);

function runWk(cmd, payload) {
  const r = spawnSync("pnpm", ["exec", "wk", "run", cmd, JSON.stringify(payload)], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024
  });
  const j = JSON.parse(r.stdout);
  if (r.status !== 0 || j.ok === false) {
    console.error(cmd, j.code, j.message);
    console.error(JSON.stringify(j.data, null, 2).slice(0, 4000));
    process.exit(1);
  }
  return j;
}

function remapDeps(deps) {
  return deps.map((d) => {
    if (PHASE_144.has(d)) return d;
    return WBS_TO_TASK[d] ?? d;
  });
}

const latest = 20;
const raw = JSON.parse(
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v${latest}.json`, "utf8")
);
const artifact = {};
for (const [k, v] of Object.entries(raw)) {
  if (!STRIP.has(k)) artifact[k] = v;
}
delete artifact.approvalRecord;
artifact.status = "draft";

for (const row of artifact.wbs) {
  if (!PHASE_144.has(row.wbsId)) continue;
  row.dependsOn = remapDeps(row.dependsOn ?? []);
  if (row.generatedTaskPayload?.dependsOn) {
    row.generatedTaskPayload.dependsOn = remapDeps(row.generatedTaskPayload.dependsOn);
  }
}

const gen = runWk("get-idea", { ideaId: "I011" }).data.planningGeneration;
runWk("draft-plan-artifact", {
  persist: true,
  artifact,
  expectedPlanningGeneration: gen,
  policyApproval: {
    confirmed: true,
    rationale: "Remap phase 144 WBS dependsOn to phase 143 task ids for cross-phase finalize"
  }
});

const gen2 = runWk("get-idea", { ideaId: "I011" }).data.planningGeneration;
const fin = runWk("finalize-plan-to-phase", {
  planId: PLAN_ID,
  dryRun: false,
  targetPhaseKey: "144",
  targetPhase: "Phase 144",
  desiredStatus: "ready",
  wbsFilter: [...PHASE_144],
  expectedPlanningGeneration: gen2,
  clientMutationId: "finalize-i011-phase-144-v21",
  policyApproval: {
    confirmed: true,
    rationale: "Materialize I011 phase 144 legacy sunset and dogfood (7 WBS rows)"
  }
});

console.log("phase 144 finalize", fin.code, "count", fin.data?.count);
fin.data?.createdTasks?.forEach((t) => console.log(t.id, t.phaseKey, t.title?.slice(0, 65)));
