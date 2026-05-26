import { spawnSync } from "node:child_process";
import { TASK_STATE_GIT_BRANCH } from "./constants.js";

export type GitRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
};

export function runGit(cwd: string, argv: string[]): GitRunResult {
  const r = spawnSync("git", ["-C", cwd, ...argv], { encoding: "utf8" });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? "").trimEnd(),
    stderr: (r.stderr ?? "").trimEnd(),
    status: r.status
  };
}

export function isGitRepository(cwd: string): boolean {
  const r = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

/** Resolve a local or remote-tracking ref for the canonical task-state branch. */
export function resolveTaskStateGitRef(
  cwd: string,
  branch: string = TASK_STATE_GIT_BRANCH
): { ref: string; tipSha: string } | { missing: true; tried: string[] } {
  const tried: string[] = [];
  const candidates = [
    `refs/remotes/origin/${branch}`,
    `origin/${branch}`,
    `refs/heads/${branch}`,
    branch
  ];
  for (const candidate of candidates) {
    tried.push(candidate);
    const r = runGit(cwd, ["rev-parse", "--verify", candidate]);
    if (r.ok && r.stdout.trim()) {
      return { ref: candidate, tipSha: r.stdout.trim() };
    }
  }
  return { missing: true, tried };
}

export function gitFetchTaskStateBranch(
  cwd: string,
  branch: string = TASK_STATE_GIT_BRANCH
): GitRunResult {
  return runGit(cwd, ["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`]);
}

export function gitShowText(cwd: string, ref: string, filePath: string): string | null {
  const r = runGit(cwd, ["show", `${ref}:${filePath}`]);
  if (!r.ok) {
    return null;
  }
  return r.stdout;
}

export function gitLsTreeNames(cwd: string, ref: string, treePath: string): string[] {
  const r = runGit(cwd, ["ls-tree", "-r", "--name-only", ref, treePath]);
  if (!r.ok || !r.stdout) {
    return [];
  }
  return r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
