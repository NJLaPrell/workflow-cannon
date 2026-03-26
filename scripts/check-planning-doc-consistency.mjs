#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();

const PATHS = {
  roadmap: resolve(ROOT, "docs/maintainers/ROADMAP.md"),
  tasks: resolve(ROOT, "docs/maintainers/TASKS.md"),
  featureMatrix: resolve(ROOT, "docs/maintainers/FEATURE-MATRIX.md")
};

function inferRoadmapPhase4Status(text) {
  if (/Phase 4 .*COMPLETE/i.test(text)) return "Completed";
  if (/Phase 4 .*next/i.test(text) || /Phase 4 .*v0\.6\.0/i.test(text)) return "In progress / ready";
  return "Planned";
}

function inferTasksPhase4Status(text) {
  const phaseBlock = text.split("## Phase 4 scale and ecosystem hardening")[1] || "";
  const rows = [...phaseBlock.matchAll(/^### \[(.)\] T(193|194|195)/gm)].map((m) => m[1]);
  if (rows.length === 3 && rows.every((x) => x.toLowerCase() === "x")) return "Completed";
  if (rows.some((x) => x.toLowerCase() === "~") || rows.some((x) => x === " ")) return "In progress / ready";
  return "Planned";
}

function inferFeatureMatrixPhase4Status(text) {
  const row = text.match(/Phase 4 - Scale and ecosystem hardening.*\|\s*([^\|]+)\s*$/m);
  if (!row) return "Unknown";
  const status = row[1].trim();
  if (/completed/i.test(status)) return "Completed";
  if (/in progress|ready/i.test(status)) return "In progress / ready";
  return "Planned";
}

async function main() {
  const [roadmap, tasks, featureMatrix] = await Promise.all([
    readFile(PATHS.roadmap, "utf8"),
    readFile(PATHS.tasks, "utf8"),
    readFile(PATHS.featureMatrix, "utf8")
  ]);

  const statuses = {
    roadmap: inferRoadmapPhase4Status(roadmap),
    tasks: inferTasksPhase4Status(tasks),
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
