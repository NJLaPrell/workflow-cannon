#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();

const PATHS = {
  roadmap: resolve(ROOT, "docs/maintainers/ROADMAP.md"),
  taskState: resolve(ROOT, ".workspace-kit/tasks/state.json"),
  featureMatrix: resolve(ROOT, "docs/maintainers/FEATURE-MATRIX.md")
};

/** CI and fresh clones omit gitignored `.workspace-kit/tasks/state.json`; align with roadmap when absent. */
async function readTaskStateText() {
  try {
    return await readFile(PATHS.taskState, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

function inferRoadmapPhase4Status(text) {
  if (/Phase 4 .*COMPLETE/i.test(text)) return "Completed";
  if (/Phase 4 .*next/i.test(text) || /Phase 4 .*v0\.6\.0/i.test(text)) return "In progress / ready";
  return "Planned";
}

function inferTaskStatePhase4Status(taskStateText) {
  if (taskStateText === null) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(taskStateText);
  } catch {
    return "Unknown";
  }
  const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  const phase4 = tasks.filter((t) => ["T193", "T194", "T195"].includes(t?.id));
  if (phase4.length < 3) return "Unknown";
  const statuses = phase4.map((t) => t?.status);
  if (statuses.every((s) => s === "completed")) return "Completed";
  if (statuses.some((s) => s === "in_progress" || s === "ready")) return "In progress / ready";
  return "Planned";
}

function inferFeatureMatrixPhase4Status(text) {
  const milestoneTableRows = text
    .split("\n")
    .filter((line) => line.trim().startsWith("| Phase 4 - Scale and ecosystem hardening"));
  if (milestoneTableRows.length === 0) return "Unknown";
  const columns = milestoneTableRows[0].split("|").map((col) => col.trim());
  const status = columns[3] ?? "";
  if (!status) return "Unknown";
  if (/completed/i.test(status)) return "Completed";
  if (/in progress|ready/i.test(status)) return "In progress / ready";
  return "Planned";
}

async function main() {
  const [roadmap, taskStateRaw, featureMatrix] = await Promise.all([
    readFile(PATHS.roadmap, "utf8"),
    readTaskStateText(),
    readFile(PATHS.featureMatrix, "utf8")
  ]);

  const roadmapStatus = inferRoadmapPhase4Status(roadmap);
  const fromFile = inferTaskStatePhase4Status(taskStateRaw);
  const statuses = {
    roadmap: roadmapStatus,
    taskState: fromFile ?? roadmapStatus,
    featureMatrix: inferFeatureMatrixPhase4Status(featureMatrix)
  };

  const unique = new Set(Object.values(statuses));
  if (unique.size !== 1) {
    console.error("Planning consistency check FAILED:");
    console.error(JSON.stringify(statuses, null, 2));
    process.exit(1);
  }

  console.log(`Planning consistency check passed (Phase 4 status: ${statuses.roadmap}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
