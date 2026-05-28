#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const RUN = ["pnpm", "exec", "wk", "run"];
function run(cmd, payload) {
  const r = spawnSync(RUN[0], [...RUN.slice(1), cmd, JSON.stringify(payload)], { encoding: "utf8", maxBuffer: 64*1024*1024 });
  try { return JSON.parse(r.stdout); } catch { console.error("stdout:", r.stdout); console.error("stderr:", r.stderr); throw new Error("non-json"); }
}

const result = run("rebuild-task-state-cache", {
  policyApproval: {
    confirmed: true,
    rationale: "Unblock apply-task-batch defect (T###s in SQLite missing from event log); user approved Option A."
  }
});
console.log("ok:", result.ok, "code:", result.code, "msg:", result.message);
if (result.data) {
  console.log("appliedSequence:", result.data.appliedSequence);
  console.log("rebuiltTasks:", result.data.taskCount ?? result.data.rebuiltTaskCount ?? "(see data)");
}
