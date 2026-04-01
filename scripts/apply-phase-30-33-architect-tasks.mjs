#!/usr/bin/env node
/**
 * One-shot: set phase / phaseKey / dependsOn for T450–T469 per maintainer phase plan
 * (Phase 30–33). Idempotent clientMutationId per task.
 *
 *   node scripts/apply-phase-30-33-architect-tasks.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

const P30 = "Phase 30 — persistence, packaging, and task-store evolution";
const P31 = "Phase 31 — policy, approvals, and sensitivity";
const P32 = "Phase 32 — architecture boundaries and platform surfaces";
const P33 = "Phase 33 — documentation, editor integration, and CLI ergonomics";

/** @type {{ id: string; phase: string; phaseKey: string; dependsOn: string[] }[]} */
const rows = [
  { id: "T450", phase: P30, phaseKey: "30", dependsOn: [] },
  { id: "T451", phase: P30, phaseKey: "30", dependsOn: [] },
  { id: "T452", phase: P30, phaseKey: "30", dependsOn: ["T451"] },
  { id: "T467", phase: P30, phaseKey: "30", dependsOn: ["T451"] },
  { id: "T466", phase: P30, phaseKey: "30", dependsOn: [] },
  { id: "T454", phase: P31, phaseKey: "31", dependsOn: [] },
  { id: "T453", phase: P31, phaseKey: "31", dependsOn: ["T454"] },
  { id: "T468", phase: P31, phaseKey: "31", dependsOn: ["T453"] },
  { id: "T456", phase: P32, phaseKey: "32", dependsOn: [] },
  { id: "T465", phase: P32, phaseKey: "32", dependsOn: [] },
  { id: "T457", phase: P32, phaseKey: "32", dependsOn: [] },
  { id: "T458", phase: P32, phaseKey: "32", dependsOn: ["T456"] },
  { id: "T455", phase: P33, phaseKey: "33", dependsOn: [] },
  { id: "T462", phase: P33, phaseKey: "33", dependsOn: [] },
  { id: "T463", phase: P33, phaseKey: "33", dependsOn: ["T462"] },
  { id: "T460", phase: P33, phaseKey: "33", dependsOn: ["T455"] },
  { id: "T461", phase: P33, phaseKey: "33", dependsOn: ["T455"] },
  { id: "T459", phase: P33, phaseKey: "33", dependsOn: ["T455"] },
  { id: "T464", phase: P33, phaseKey: "33", dependsOn: [] },
  { id: "T469", phase: P33, phaseKey: "33", dependsOn: [] }
];

let ok = 0;
for (const r of rows) {
  const payload = {
    taskId: r.id,
    updates: {
      phase: r.phase,
      phaseKey: r.phaseKey,
      dependsOn: r.dependsOn
    },
    clientMutationId: `phase-30-33-plan-2026-04-01-${r.id}`
  };
  const out = execFileSync(process.execPath, [cli, "run", "update-task", JSON.stringify(payload)], {
    cwd: root,
    encoding: "utf8"
  });
  const parsed = JSON.parse(out.trim());
  if (!parsed.ok) {
    console.error(r.id, parsed);
    process.exitCode = 1;
    break;
  }
  console.log(parsed.message ?? "ok", r.id, r.phaseKey);
  ok++;
}
console.log(`Done: ${ok}/${rows.length}`);
