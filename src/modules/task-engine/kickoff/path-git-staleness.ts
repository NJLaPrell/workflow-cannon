import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  EvaluatePathStalenessInput,
  KickoffScopeFinding,
  PathStalenessEntry,
  PathStalenessResult
} from "./types.js";

const DEFAULT_STALE_COMMIT_THRESHOLD = 3;
type GitRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
};

function runGit(cwd: string, argv: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", cwd, ...argv]);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      resolve({ ok: false, stdout: "", stderr: "git spawn failed", status: null });
    });
    child.on("close", (status: number | null) => {
      resolve({
        ok: status === 0,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        status
      });
    });
  });
}

async function isGitRepository(workspacePath: string): Promise<boolean> {
  const r = await runGit(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

function gitPathspec(pathHint: string): string {
  return pathHint.replace(/\/\*\*$/, "");
}

function pathExistsOnDisk(workspacePath: string, relPath: string): boolean {
  try {
    fs.accessSync(path.join(workspacePath, relPath));
    return true;
  } catch {
    return false;
  }
}

async function countCommitsSince(
  workspacePath: string,
  relPath: string,
  sinceIso: string,
  baseRef?: string
): Promise<number> {
  const argv = [
    "rev-list",
    "--count",
    `--since=${sinceIso}`,
    baseRef ?? "HEAD",
    "--",
    gitPathspec(relPath)
  ];
  const r = await runGit(workspacePath, argv);
  if (!r.ok) {
    return 0;
  }
  const count = Number.parseInt(r.stdout.trim(), 10);
  return Number.isFinite(count) ? count : 0;
}

async function lastCommitIso(
  workspacePath: string,
  relPath: string,
  baseRef?: string
): Promise<string | null> {
  const argv = ["log", "-1", "--format=%aI", baseRef ?? "HEAD", "--", gitPathspec(relPath)];
  const r = await runGit(workspacePath, argv);
  if (!r.ok || !r.stdout.trim()) {
    return null;
  }
  return r.stdout.trim().split("\n")[0] ?? null;
}

async function wasDeletedInHistory(
  workspacePath: string,
  relPath: string,
  baseRef?: string
): Promise<boolean> {
  const argv = [
    "log",
    "-1",
    "--diff-filter=D",
    "--format=%H",
    baseRef ?? "HEAD",
    "--",
    gitPathspec(relPath)
  ];
  const r = await runGit(workspacePath, argv);
  return r.ok && r.stdout.trim().length > 0;
}

async function wasEverTracked(
  workspacePath: string,
  relPath: string,
  baseRef?: string
): Promise<boolean> {
  const argv = ["log", "-1", "--format=%H", baseRef ?? "HEAD", "--", gitPathspec(relPath)];
  const r = await runGit(workspacePath, argv);
  return r.ok && r.stdout.trim().length > 0;
}

function buildEntryFindings(
  entry: PathStalenessEntry,
  staleCommitThreshold: number
): KickoffScopeFinding[] {
  const findings: KickoffScopeFinding[] = [];
  if (!entry.exists && entry.deleted) {
    findings.push({
      code: "kickoff-scope-path-deleted",
      path: entry.path,
      message: `Scope path was deleted from the workspace: ${entry.path}`
    });
    return findings;
  }
  if (!entry.exists && !entry.deleted) {
    findings.push({
      code: "kickoff-scope-path-missing",
      path: entry.path,
      message: `Scope path does not exist in the workspace: ${entry.path}`
    });
    return findings;
  }
  if (entry.commitsSinceUpdate >= staleCommitThreshold) {
    findings.push({
      code: "kickoff-scope-path-stale",
      path: entry.path,
      message: `Scope path has ${entry.commitsSinceUpdate} commits since last task update (threshold ${staleCommitThreshold})`
    });
  }
  return findings;
}

/** Compare scope paths against git history relative to a task update timestamp. */
export async function evaluatePathStaleness(
  input: EvaluatePathStalenessInput
): Promise<PathStalenessResult> {
  const {
    workspacePath,
    paths,
    sinceIso,
    baseRef,
    staleCommitThreshold = DEFAULT_STALE_COMMIT_THRESHOLD
  } = input;

  if (!paths.length) {
    return { entries: [], findings: [] };
  }

  if (!(await isGitRepository(workspacePath))) {
    return {
      entries: [],
      findings: [
        {
          code: "kickoff-git-unavailable",
          message: "Git repository unavailable for path staleness evaluation"
        }
      ]
    };
  }

  const entries: PathStalenessEntry[] = [];
  const findings: KickoffScopeFinding[] = [];

  for (const relPath of paths) {
    const exists = pathExistsOnDisk(workspacePath, relPath);
    const everTracked = await wasEverTracked(workspacePath, relPath, baseRef);
    const deleted = !exists && (everTracked || (await wasDeletedInHistory(workspacePath, relPath, baseRef)));
    const commitsSinceUpdate = await countCommitsSince(workspacePath, relPath, sinceIso, baseRef);
    const lastIso = await lastCommitIso(workspacePath, relPath, baseRef);

    const entry: PathStalenessEntry = {
      path: relPath,
      exists,
      deleted,
      commitsSinceUpdate,
      lastCommitIso: lastIso
    };
    entries.push(entry);
    findings.push(...buildEntryFindings(entry, staleCommitThreshold));
  }

  return { entries, findings };
}
