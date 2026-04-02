#!/usr/bin/env node
/**
 * Bucket ready tasks into phaseKey 34 / 35 / 36 with stable phase labels.
 * Idempotent if re-run with same mapping.
 *
 * Uses `assign-task-phase` (narrow mutation + evidence) instead of generic `update-task`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

const LABEL = {
  "34": "Phase 34 — Cursor extension & consumer experience",
  "35": "Phase 35 — Task engine, queue operations & planning handoff",
  "36": "Phase 36 — Policy, integrations, improvement loop & documentation architecture"
};

/** Cursor extension + consumer experience → current phase */
const P34 = new Set(["T505", "T506", "T511", "T518"]);

/** Task engine, queue ops + planning handoff → next phase */
const P35 = new Set(["T507", "T510", "T513", "T520", "T523"]);

/** All other ready tasks (verified below) → phase after */
const P36 = new Set([
  "T508",
  "T509",
  "T512",
  "T514",
  "T515",
  "T516",
  "T517",
  "T519",
  "T521",
  "T522",
  "T524",
  "T491",
  "T492",
  "T493",
  "T494",
  "T495",
  "T496",
  "T497",
  "T498",
  "T499",
  "T500",
  "T501",
  "T502",
  "T503",
  "T504"
]);

function run(sub, payload) {
  const out = execFileSync(process.execPath, [CLI, "run", sub, JSON.stringify(payload)], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(`${sub}: ${j.message || j.code}`);
  return j;
}

function main() {
  const overlap = [...P34].filter((id) => P35.has(id) || P36.has(id));
  if (overlap.length) throw new Error(`Duplicate bucket: ${overlap}`);

  const listed = new Set([...P34, ...P35, ...P36]);
  const out = execFileSync(process.execPath, [CLI, "run", "list-tasks", '{"status":"ready"}'], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(j.message || j.code);
  const readyIds = new Set((j.data.tasks || []).map((t) => t.id));
  const missing = [...listed].filter((id) => !readyIds.has(id));
  const extra = [...readyIds].filter((id) => !listed.has(id));
  if (missing.length) throw new Error(`Expected ready tasks missing from script: ${missing.join(", ")}`);
  if (extra.length) throw new Error(`Ready tasks not in script (add to a bucket): ${extra.join(", ")}`);

  for (const id of P34) {
    run("assign-task-phase", {
      taskId: id,
      phaseKey: "34",
      phase: LABEL["34"],
      actor: "phase-bucket-script"
    });
  }
  for (const id of P35) {
    run("assign-task-phase", {
      taskId: id,
      phaseKey: "35",
      phase: LABEL["35"],
      actor: "phase-bucket-script"
    });
  }
  for (const id of P36) {
    run("assign-task-phase", {
      taskId: id,
      phaseKey: "36",
      phase: LABEL["36"],
      actor: "phase-bucket-script"
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase34: [...P34].sort(),
        phase35: [...P35].sort(),
        phase36: [...P36].sort(),
        counts: { "34": P34.size, "35": P35.size, "36": P36.size }
      },
      null,
      2
    )
  );
}

main();
