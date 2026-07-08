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
  "acceptance"
]);

function runWk(cmd, payload) {
  const r = spawnSync("pnpm", ["exec", "wk", "run", cmd, JSON.stringify(payload)], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024
  });
  let j;
  try {
    j = JSON.parse(r.stdout);
  } catch {
    console.error("parse fail", r.stdout?.slice(0, 2000));
    process.exit(1);
  }
  if (r.status !== 0 || j.ok === false) {
    console.error(cmd, j.code || r.status, j.message);
    if (j.data?.errors) console.error(JSON.stringify(j.data.errors.slice(0, 10), null, 2));
    process.exit(1);
  }
  return j;
}

const raw = JSON.parse(
  fs.readFileSync(`.workspace-kit/planning/plan-artifacts/${PLAN_ID}/artifact.v18.json`, "utf8")
);
const artifact = {};
for (const [k, v] of Object.entries(raw)) {
  if (!STRIP.has(k)) artifact[k] = v;
}
delete artifact.approvalRecord;
artifact.status = "draft";

const w1 = artifact.wbs.find((r) => r.wbsId === "WBS-1");
w1.approach =
  `${w1.approach} Handles fresh workspace and empty Ideas inventory on first run with no data.`.trim();
if (!w1.acceptanceCriteria.some((c) => /first-run|fresh workspace|no data/i.test(c))) {
  w1.acceptanceCriteria.push(
    "Fresh workspace with no Ideas rows returns first-run stage guidance and empty-state blockers without errors"
  );
}
if (!w1.testingVerification.some((t) => /first-run/i.test(t))) {
  w1.testingVerification.push("test/get-planner-flow-status-first-run.test.mjs");
}

const w6 = artifact.wbs.find((r) => r.wbsId === "WBS-6");
w6.approach =
  `${w6.approach} Returns initial blank-state planner-packet when idea has no linked plan on first run.`.trim();
if (!w6.acceptanceCriteria.some((c) => /first-run|fresh workspace|empty/i.test(c))) {
  w6.acceptanceCriteria.push(
    "planner-packet on fresh workspace with no linked plan returns initial empty-state packet without file reads"
  );
}

const gen = runWk("get-idea", { ideaId: "I011" }).data.planningGeneration;
const draft = runWk("draft-plan-artifact", {
  persist: true,
  artifact,
  expectedPlanningGeneration: gen,
  policyApproval: {
    confirmed: true,
    rationale: "Amend accepted I011 plan: first-run and empty-state coverage for finalize batch review"
  }
});
console.log("draft", draft.code, "v", draft.data.version, "ideaPlanStatus", draft.data.ideaPlanStatus);

const gen2 = runWk("get-idea", { ideaId: "I011" }).data.planningGeneration;
const fin = runWk("finalize-plan-to-phase", {
  planId: PLAN_ID,
  dryRun: true,
  expectedPlanningGeneration: gen2
});

console.log("finalize", fin.code);
const d = fin.data;
console.log("tasks", d.taskPreview?.length ?? d.tasks?.length ?? "?");
console.log("review passed", d.review?.passed, "errors", d.review?.errorCount);
