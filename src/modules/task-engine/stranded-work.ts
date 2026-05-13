import { execFileSync } from "node:child_process";

import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

export type StrandedWorkFinding = {
  code: "stranded-local-work" | "stranded-work-base-unavailable" | "stranded-work-git-unavailable";
  taskId: string | null;
  title: string | null;
  baseRef: string;
  files: string[];
  message: string;
  remediation: string;
};

export type StrandedWorkReport = {
  schemaVersion: 1;
  baseRef: string;
  phaseKey: string | null;
  passed: boolean;
  degraded: boolean;
  changedFiles: string[];
  findings: StrandedWorkFinding[];
};

function runGit(workspacePath: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", workspacePath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string" && row.trim().length > 0);
}

function taskTouchedFiles(task: TaskEntity): string[] {
  const metadata = task.metadata ?? {};
  const direct = stringArray(metadata.touchedFiles);
  const evidence = metadata.deliveryEvidence;
  const evidenceFiles =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? stringArray((evidence as Record<string, unknown>).touchedFiles)
      : [];
  return [...new Set([...direct, ...evidenceFiles])];
}

function defaultBaseRef(phaseKey: string | null): string {
  return phaseKey ? `origin/release/phase-${phaseKey}` : "origin/main";
}

export function buildStrandedWorkReport(args: {
  workspacePath: string;
  tasks: TaskEntity[];
  phaseKey?: string | null;
  baseRef?: string | null;
}): StrandedWorkReport {
  const phaseKey = args.phaseKey?.trim() || null;
  const baseRef = args.baseRef?.trim() || defaultBaseRef(phaseKey);
  const unavailable = (code: StrandedWorkFinding["code"], message: string): StrandedWorkReport => ({
    schemaVersion: 1,
    baseRef,
    phaseKey,
    passed: false,
    degraded: true,
    changedFiles: [],
    findings: [
      {
        code,
        taskId: null,
        title: null,
        baseRef,
        files: [],
        message,
        remediation: "Fetch the release/base branch or rerun from a git checkout before phase closeout."
      }
    ]
  });

  if (runGit(args.workspacePath, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    return unavailable("stranded-work-git-unavailable", "Stranded-work check requires a git worktree.");
  }
  if (runGit(args.workspacePath, ["rev-parse", "--verify", `${baseRef}^{commit}`]) === null) {
    return unavailable("stranded-work-base-unavailable", `Base ref '${baseRef}' is not available.`);
  }

  const diff = runGit(args.workspacePath, ["diff", "--name-only", baseRef, "HEAD", "--"]);
  const changedFiles = diff ? diff.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  if (changedFiles.length === 0) {
    return { schemaVersion: 1, baseRef, phaseKey, passed: true, degraded: false, changedFiles, findings: [] };
  }

  const changed = new Set(changedFiles);
  const completedTasks = args.tasks.filter((task) => {
    if (task.archived || task.status !== "completed") return false;
    if (phaseKey === null) return inferTaskPhaseKey(task) !== null;
    return inferTaskPhaseKey(task) === phaseKey;
  });
  const findings: StrandedWorkFinding[] = [];

  for (const task of completedTasks) {
    const touched = taskTouchedFiles(task);
    const files = touched.length > 0 ? touched.filter((file) => changed.has(file)) : changedFiles;
    if (files.length === 0) continue;
    findings.push({
      code: "stranded-local-work",
      taskId: task.id,
      title: task.title,
      baseRef,
      files,
      message: `Completed task ${task.id} has local work that is not present in ${baseRef}.`,
      remediation: "Merge or rebase the work into the phase branch, or move the task out of completed state before closeout."
    });
  }

  return {
    schemaVersion: 1,
    baseRef,
    phaseKey,
    passed: findings.length === 0,
    degraded: false,
    changedFiles,
    findings
  };
}