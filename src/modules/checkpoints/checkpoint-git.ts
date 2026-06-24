import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type GitRunResult = { ok: true; stdout: string } | { ok: false; error: string };

export function runGit(workspacePath: string, args: string[]): GitRunResult {
  try {
    const stdout = execFileSync("git", ["-C", workspacePath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024
    });
    return { ok: true, stdout: stdout.trimEnd() };
  } catch (e) {
    const err = e as { stderr?: Buffer; message?: string };
    const msg =
      err.stderr && err.stderr.length
        ? err.stderr.toString("utf8").trim()
        : err.message ?? String(e);
    return { ok: false, error: msg };
  }
}

export function isGitRepo(workspacePath: string): boolean {
  return runGit(workspacePath, ["rev-parse", "--is-inside-work-tree"]).ok;
}

export function getHeadSha(workspacePath: string): GitRunResult & { sha?: string } {
  const r = runGit(workspacePath, ["rev-parse", "HEAD"]);
  if (!r.ok) {
    return r;
  }
  const sha = r.stdout.split(/\s+/)[0]!;
  return { ok: true, stdout: r.stdout, sha };
}

/**
 * Paths from `git status --porcelain=v1` (staged + unstaged + untracked), repo-relative.
 */
export function readWorkingTreeManifest(workspacePath: string): GitRunResult & { paths?: string[] } {
  const r = runGit(workspacePath, ["status", "--porcelain=v1"]);
  if (!r.ok) {
    return r;
  }
  if (!r.stdout) {
    return { ok: true, stdout: "", paths: [] };
  }
  const paths: string[] = [];
  for (const line of r.stdout.split("\n")) {
    if (line.length < 4) {
      continue;
    }
    const rest = line.slice(3).trim();
    if (!rest) {
      continue;
    }
    if (rest.includes(" -> ")) {
      paths.push(rest.split(" -> ").pop()!.trim());
    } else {
      paths.push(rest);
    }
  }
  return { ok: true, stdout: r.stdout, paths: [...new Set(paths)] };
}

export function isWorkingTreeClean(workspacePath: string): boolean {
  const m = readWorkingTreeManifest(workspacePath);
  return m.ok && (m.paths?.length ?? 0) === 0;
}

/**
 * Like {@link isWorkingTreeClean} but ignores `.workspace-kit/` paths so kit SQLite/WAL under the
 * repo root does not block stash/rewind decisions (those files should be gitignored in real repos).
 */
export function isWorkingTreeCleanIgnoringWorkspaceKit(workspacePath: string): boolean {
  const r = runGit(workspacePath, ["status", "--porcelain=v1"]);
  if (!r.ok) {
    return false;
  }
  if (!r.stdout.trim()) {
    return true;
  }
  for (const line of r.stdout.split("\n")) {
    if (line.length < 4) {
      continue;
    }
    const rest = line.slice(3).trim();
    if (!rest) {
      continue;
    }
    const p = rest.includes(" -> ") ? rest.split(" -> ").pop()!.trim() : rest;
    const norm = p.replace(/\\/g, "/");
    if (norm === ".workspace-kit" || norm.startsWith(".workspace-kit/")) {
      continue;
    }
    return false;
  }
  return true;
}

export function createStash(workspacePath: string, message: string): GitRunResult & { stashSha?: string } {
  const stashMsg = message.slice(0, 200);
  const before = runGit(workspacePath, ["stash", "list", "--format=%H"]);
  if (!before.ok) {
    return before;
  }
  const beforeSet = new Set(before.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
  /** Exclude `.workspace-kit` so kit SQLite + config are never stashed away (would delete DB from disk). */
  const push = runGit(workspacePath, [
    "stash",
    "push",
    "-u",
    "-m",
    stashMsg,
    "--",
    ".",
    ":!.workspace-kit"
  ]);
  if (!push.ok) {
    return push;
  }
  const after = runGit(workspacePath, ["stash", "list", "--format=%H"]);
  if (!after.ok) {
    return after;
  }
  const stashSha = after.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !beforeSet.has(line));
  if (!stashSha) {
    return {
      ok: false,
      error: "Unable to resolve exact stash commit SHA for recovery; stash push may have raced with another writer"
    };
  }
  return { ok: true, stdout: push.stdout, stashSha };
}

export type CheckpointPatchArtifact = {
  artifactId: string;
  patchPath: string;
  patchPathRelativeToGitCommonDir: string;
  capturedAt: string;
  includesUntrackedFiles: false;
};

function resolveGitPath(workspacePath: string, raw: string): string {
  return path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(workspacePath, raw));
}

/**
 * Persist a deterministic patch artifact for dirty tracked changes.
 * Returns `ok:false` when untracked files exist (stash fallback required).
 */
export function createPatchArtifactForDirtyWork(
  workspacePath: string,
  checkpointId: string
): GitRunResult & { artifact?: CheckpointPatchArtifact } {
  const status = runGit(workspacePath, ["status", "--porcelain=v1", "--", ".", ":!.workspace-kit"]);
  if (!status.ok) {
    return status;
  }
  const lines = status.stdout.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, error: "No dirty paths to capture as a patch artifact" };
  }
  if (lines.some((line) => line.startsWith("?? "))) {
    return {
      ok: false,
      error: "Untracked files are present; patch artifact mode is not safely recoverable for this dirty state"
    };
  }
  const staged = runGit(workspacePath, ["diff", "--binary", "--full-index", "--cached", "--", ".", ":!.workspace-kit"]);
  if (!staged.ok) {
    return staged;
  }
  const unstaged = runGit(workspacePath, ["diff", "--binary", "--full-index", "--", ".", ":!.workspace-kit"]);
  if (!unstaged.ok) {
    return unstaged;
  }
  const patchBody = [
    "# workspace-kit checkpoint patch artifact",
    `# checkpointId=${checkpointId}`,
    `# generatedAt=${new Date().toISOString()}`,
    "# apply staged first, then unstaged",
    "",
    "--- staged.patch ---",
    staged.stdout,
    "",
    "--- unstaged.patch ---",
    unstaged.stdout,
    ""
  ].join("\n");
  if (!patchBody.includes("diff --git")) {
    return { ok: false, error: "No tracked git diff hunks were captured for patch artifact mode" };
  }
  const commonDir = runGit(workspacePath, ["rev-parse", "--git-common-dir"]);
  if (!commonDir.ok) {
    return commonDir;
  }
  const commonDirPath = resolveGitPath(workspacePath, commonDir.stdout.trim());
  const relPatchPath = path.join("workflow-cannon", "checkpoints", `${checkpointId}.patch`);
  const absPatchPath = path.join(commonDirPath, relPatchPath);
  fs.mkdirSync(path.dirname(absPatchPath), { recursive: true });
  fs.writeFileSync(absPatchPath, patchBody, "utf8");
  return {
    ok: true,
    stdout: absPatchPath,
    artifact: {
      artifactId: `patch-${checkpointId}`,
      patchPath: absPatchPath,
      patchPathRelativeToGitCommonDir: relPatchPath.replace(/\\/g, "/"),
      capturedAt: new Date().toISOString(),
      includesUntrackedFiles: false
    }
  };
}

export function diffNameStatus(
  workspacePath: string,
  fromRef: string,
  toRef: string
): GitRunResult {
  return runGit(workspacePath, ["diff", "--name-status", fromRef, toRef]);
}

export function readGitSubmodulePaths(workspacePath: string): string[] {
  const p = path.join(workspacePath, ".gitmodules");
  if (!fs.existsSync(p)) {
    return [];
  }
  const raw = fs.readFileSync(p, "utf8");
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*path\s*=\s*(.+)\s*$/.exec(line);
    if (m?.[1]) {
      out.push(m[1]!.trim().replace(/\\/g, "/"));
    }
  }
  return out;
}

function pathUnderPrefix(file: string, prefix: string): boolean {
  const f = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const pref = prefix.replace(/\\/g, "/").replace(/\/$/, "");
  return f === pref || f.startsWith(`${pref}/`);
}

/** Returns a short reason string when manifest must block rewind, else null. */
export function rewindBlockedByManifest(
  manifest: string[],
  workspacePath: string
): string | null {
  for (const file of manifest) {
    const f = file.replace(/\\/g, "/");
    if (f === "node_modules" || f.startsWith("node_modules/")) {
      return "manifest includes node_modules; rewind refused (vendor tree)";
    }
    if (f === "vendor" || f.startsWith("vendor/")) {
      return "manifest includes vendor/; rewind refused";
    }
  }
  const subs = readGitSubmodulePaths(workspacePath);
  for (const file of manifest) {
    for (const sub of subs) {
      if (pathUnderPrefix(file, sub)) {
        return `manifest touches submodule path '${sub}'; rewind refused`;
      }
    }
  }
  return null;
}

export function applyStashSha(workspacePath: string, stashSha: string): GitRunResult {
  return runGit(workspacePath, ["stash", "apply", stashSha]);
}

export function resetHard(workspacePath: string, commitSha: string): GitRunResult {
  return runGit(workspacePath, ["reset", "--hard", commitSha]);
}
