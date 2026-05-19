import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { probeGitHead } from "./queue/queue-git-alignment.js";

export const RELEASE_STATUS_SCHEMA_VERSION = 1 as const;

export type ReleaseSignalStatus = {
  git: "ok" | "unavailable";
  npm: "ok" | "degraded" | "unavailable";
  github: "ok" | "degraded" | "unavailable";
};

export type ReleaseStatusSnapshot = {
  schemaVersion: typeof RELEASE_STATUS_SCHEMA_VERSION;
  branch: string | null;
  headSha: string | null;
  latestTag: string | null;
  npmDistTags: Record<string, string> | null;
  latestReleaseUrl: string | null;
  currentPhase: string | null;
  nextPhase: string | null;
  packageName: string | null;
  signalStatus: ReleaseSignalStatus;
  degraded: string[];
};

export type ReleaseStatusCollectors = {
  readPackageName?: (workspacePath: string) => string | null;
  readGitBranch?: (workspacePath: string) => string | null;
  readLatestTag?: (workspacePath: string) => string | null;
  readNpmDistTags?: (packageName: string) => Record<string, string> | null;
  readLatestReleaseUrl?: (workspacePath: string) => string | null;
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

function defaultReadPackageName(workspacePath: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(workspacePath, "package.json"), "utf8");
    const doc = JSON.parse(raw) as { name?: string };
    return typeof doc.name === "string" && doc.name.trim() ? doc.name.trim() : null;
  } catch {
    return null;
  }
}

function defaultReadGitBranch(workspacePath: string): string | null {
  const branch = runGit(workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return branch && branch !== "HEAD" ? branch : null;
}

function defaultReadLatestTag(workspacePath: string): string | null {
  return runGit(workspacePath, ["describe", "--tags", "--abbrev=0"]);
}

function defaultReadNpmDistTags(packageName: string): Record<string, string> | null {
  try {
    const out = execFileSync("npm", ["view", packageName, "dist-tags", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const parsed: unknown = JSON.parse(out);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        tags[k] = v.trim();
      }
    }
    return Object.keys(tags).length > 0 ? tags : null;
  } catch {
    return null;
  }
}

function defaultReadLatestReleaseUrl(workspacePath: string): string | null {
  try {
    const out = execFileSync(
      "gh",
      ["release", "view", "--json", "url,tagName", "--jq", ".url"],
      {
        cwd: workspacePath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GH_PAGER: "", PAGER: "" }
      }
    ).trim();
    return out || null;
  } catch {
    try {
      const list = execFileSync("gh", ["release", "list", "--limit", "1", "--json", "url"], {
        cwd: workspacePath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GH_PAGER: "", PAGER: "" }
      }).trim();
      if (!list) {
        return null;
      }
      const parsed: unknown = JSON.parse(list);
      const row = Array.isArray(parsed) ? parsed[0] : null;
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const url = (row as Record<string, unknown>).url;
        return typeof url === "string" && url.trim() ? url.trim() : null;
      }
    } catch {
      return null;
    }
    return null;
  }
}

export function buildReleaseStatusSnapshot(args: {
  workspacePath: string;
  currentPhase: string | null;
  nextPhase: string | null;
  collectors?: ReleaseStatusCollectors;
}): ReleaseStatusSnapshot {
  const collectors = args.collectors ?? {};
  const degraded: string[] = [];
  const signalStatus: ReleaseSignalStatus = {
    git: "unavailable",
    npm: "unavailable",
    github: "unavailable"
  };

  const packageName = (collectors.readPackageName ?? defaultReadPackageName)(args.workspacePath);

  const gitProbe = probeGitHead(args.workspacePath);
  let branch: string | null = null;
  let headSha: string | null = null;
  let latestTag: string | null = null;
  if (gitProbe.ok) {
    signalStatus.git = "ok";
    headSha = gitProbe.headSha ?? null;
    branch = (collectors.readGitBranch ?? defaultReadGitBranch)(args.workspacePath);
    latestTag = (collectors.readLatestTag ?? defaultReadLatestTag)(args.workspacePath);
  } else {
    degraded.push(gitProbe.error ?? "git unavailable");
  }

  let npmDistTags: Record<string, string> | null = null;
  if (packageName) {
    npmDistTags = (collectors.readNpmDistTags ?? defaultReadNpmDistTags)(packageName);
    if (npmDistTags) {
      signalStatus.npm = "ok";
    } else {
      signalStatus.npm = "degraded";
      degraded.push(`npm dist-tags unavailable for ${packageName}`);
    }
  } else {
    signalStatus.npm = "degraded";
    degraded.push("package.json name missing");
  }

  const latestReleaseUrl = (collectors.readLatestReleaseUrl ?? defaultReadLatestReleaseUrl)(args.workspacePath);
  if (latestReleaseUrl) {
    signalStatus.github = "ok";
  } else {
    signalStatus.github = "degraded";
    degraded.push("GitHub latest release URL unavailable (gh auth or no releases)");
  }

  return {
    schemaVersion: RELEASE_STATUS_SCHEMA_VERSION,
    branch,
    headSha,
    latestTag,
    npmDistTags,
    latestReleaseUrl,
    currentPhase: args.currentPhase,
    nextPhase: args.nextPhase,
    packageName,
    signalStatus,
    degraded
  };
}
