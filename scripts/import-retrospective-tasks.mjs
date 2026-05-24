#!/usr/bin/env node
/**
 * Import RETROSPECTIVE_TASKS.md sections R001–R024 as proposed task-engine tasks.
 * Usage: node scripts/import-retrospective-tasks.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mdPath = path.join(repoRoot, "RETROSPECTIVE_TASKS.md");
const WK = path.join(repoRoot, ".workspace-kit/bin/wk");

function wkRun(command, args) {
  const r = spawnSync(WK, ["run", command, JSON.stringify(args)], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  const out = (r.stdout || "").trim() || (r.stderr || "").trim();
  if (!out) {
    throw new Error(`wk run ${command}: empty output (exit ${r.status})`);
  }
  return JSON.parse(out);
}

function sectionField(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

function subsection(body, heading) {
  const re = new RegExp(
    `### ${heading}\\s*\\n([\\s\\S]*?)(?=\\n### |\\n---\\s*\\n|$)`,
    "i"
  );
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

function bulletsFrom(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

function priorityFrom(raw) {
  const p = raw.toLowerCase();
  if (p.includes("high")) return "P1";
  if (p.includes("low")) return "P3";
  return "P2";
}

function taskTypeFromCategory(categoryRaw) {
  const first = categoryRaw.split("/")[0].trim().toLowerCase();
  return first.includes("defect") ? "improvement" : "improvement";
}

function parseSections(md) {
  const stopAt = md.indexOf("## Suggested initial task-engine import order");
  const slice = stopAt >= 0 ? md.slice(0, stopAt) : md;
  const parts = slice.split(/^## (R\d{3}) — /m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const retroId = parts[i];
    const body = parts[i + 1] ?? "";
    const titleLine = body.split("\n")[0].trim();
    if (!titleLine) continue;

    const problem = subsection(body, "Problem");
    const cause = subsection(body, "Cause");
    const userStory = subsection(body, "User story");
    const acceptance = bulletsFrom(subsection(body, "Acceptance criteria"));
    const resolution = subsection(body, "Suggested resolution");
    const category = sectionField(body, "Category");
    const suggestedArea = sectionField(body, "Suggested area");

    const technicalScope = [
      ...suggestedArea
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      `Source: RETROSPECTIVE_TASKS.md ${retroId}`
    ];

    const descriptionParts = [
      `Retrospective ${retroId} (imported from RETROSPECTIVE_TASKS.md).`,
      "",
      problem ? `## Problem\n${problem}` : "",
      cause ? `## Cause\n${cause}` : "",
      resolution ? `## Suggested resolution\n${resolution}` : ""
    ].filter(Boolean);

    out.push({
      retroId,
      title: `Retro: ${titleLine}`,
      summary: userStory || problem.slice(0, 280) || titleLine,
      description: descriptionParts.join("\n").slice(0, 12_000),
      acceptanceCriteria:
        acceptance.length > 0
          ? acceptance
          : ["Behavior matches acceptance criteria in RETROSPECTIVE_TASKS.md"],
      technicalScope,
      priority: priorityFrom(sectionField(body, "Priority")),
      category,
      type: taskTypeFromCategory(category),
      metadata: {
        retrospectiveId: retroId,
        retrospectiveCategory: category,
        suggestedArea,
        source: "RETROSPECTIVE_TASKS.md",
        issue: problem.slice(0, 4000),
        supportingReasoning: [cause, userStory].filter(Boolean).join("\n\n").slice(0, 4000)
      },
      clientMutationId: `retrospective-import-${retroId}-20260524`
    });
  }
  return out;
}

function main() {
  const md = fs.readFileSync(mdPath, "utf8");
  const items = parseSections(md);
  if (items.length === 0) {
    console.error("No retrospective sections parsed.");
    process.exit(1);
  }

  let gen = wkRun("list-tasks", { limit: 1 }).data?.planningGeneration;
  if (typeof gen !== "number") {
    throw new Error("Could not read planningGeneration from list-tasks");
  }

  const created = [];
  const failed = [];

  for (const item of items) {
    const payload = {
      allocateId: true,
      status: "proposed",
      type: item.type,
      title: item.title,
      phaseKey: "109",
      phase: "Phase 109",
      priority: item.priority,
      expectedPlanningGeneration: gen,
      planRef: "RETROSPECTIVE_TASKS.md",
      summary: item.summary,
      description: item.description,
      technicalScope: item.technicalScope,
      acceptanceCriteria: item.acceptanceCriteria,
      risk: item.priority === "P1" ? "Medium" : "Low",
      metadata: item.metadata,
      clientMutationId: item.clientMutationId
    };

    const result = wkRun("create-task", payload);
    if (result.ok !== true) {
      failed.push({ retroId: item.retroId, code: result.code, message: result.message });
      continue;
    }
    gen = result.data.planningGeneration;
    created.push({
      retroId: item.retroId,
      taskId: result.data.task.id,
      title: result.data.task.title
    });
    console.log(`${item.retroId} → ${result.data.task.id}: ${result.data.task.title}`);
  }

  console.log("\n---");
  console.log(`Created: ${created.length}, Failed: ${failed.length}`);
  if (failed.length) {
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

main();
