#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const RUN = ["pnpm", "exec", "wk", "run"];
function run(cmd, payload) {
  const r = spawnSync(RUN[0], [...RUN.slice(1), cmd, JSON.stringify(payload)], { encoding: "utf8", maxBuffer: 64*1024*1024 });
  try { return JSON.parse(r.stdout); } catch { console.error(r.stdout); console.error(r.stderr); throw new Error("non-json"); }
}
function gen() { return run("dashboard-summary", {}).data.planningGeneration; }

const g1 = gen();
console.log("gen1:", g1);
const c = run("create-task", {
  allocateId: true,
  title: "defect repro: single create publishes events?",
  status: "proposed",
  type: "execution",
  expectedPlanningGeneration: g1,
  actor: "defect-repro",
  clientMutationId: "defect-repro-single-v2"
});
console.log("create:", c.ok, c.code, c?.data?.task?.id);
const id = c?.data?.task?.id;
if (!id) process.exit(1);

const g2 = gen();
console.log("gen2:", g2);
const t = run("run-transition", {
  taskId: id,
  action: "accept",
  actor: "defect-repro",
  expectedPlanningGeneration: g2,
  policyApproval: { confirmed: true, rationale: "defect repro" }
});
console.log("transition:", t.ok, t.code);
if (!t.ok) {
  console.log("  expected:", t?.data?.expectedVersion, "actual:", t?.data?.actualVersion);
}
