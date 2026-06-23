import { spawnSync } from "node:child_process";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";

export type TaskStateAuthorityMode = "enforce" | "advisory" | "disabled";
export type TaskStateAuthorityWorkerMutationMode = "deny" | "intent";
export type TaskStateAuthorityClassification = "authority" | "worker" | "unknown" | "disabled";

export type TaskStateAuthorityExplainEntry = {
  code: string;
  message: string;
};

export type TaskStateAuthorityPosture = {
  schemaVersion: 1;
  mode: TaskStateAuthorityMode;
  classification: TaskStateAuthorityClassification;
  workerBranchMutations: TaskStateAuthorityWorkerMutationMode;
  branch: string | null;
  detachedHead: boolean;
  authorityBranchPatterns: string[];
  workerBranchPatterns: string[];
  explain: TaskStateAuthorityExplainEntry[];
};

type NormalizedStateAuthorityConfig = {
  mode: TaskStateAuthorityMode;
  authorityBranchPatterns: string[];
  workerBranchPatterns: string[];
  workerBranchMutations: TaskStateAuthorityWorkerMutationMode;
};

const DEFAULT_AUTHORITY_BRANCH_PATTERNS = ["main", "master", "release/phase-*"];
const DEFAULT_WORKER_BRANCH_PATTERNS = ["feature/*", "task/*"];

function readStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback];
  }
  const out = input
    .filter((row): row is string => typeof row === "string")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  return out.length > 0 ? out : [...fallback];
}

function normalizeStateAuthorityConfig(
  effectiveConfig?: Record<string, unknown> | null
): NormalizedStateAuthorityConfig {
  const tasks =
    effectiveConfig?.tasks && typeof effectiveConfig.tasks === "object" && !Array.isArray(effectiveConfig.tasks)
      ? (effectiveConfig.tasks as Record<string, unknown>)
      : undefined;
  const raw =
    tasks?.stateAuthority && typeof tasks.stateAuthority === "object" && !Array.isArray(tasks.stateAuthority)
      ? (tasks.stateAuthority as Record<string, unknown>)
      : {};
  const mode =
    raw.mode === "enforce" || raw.mode === "advisory" || raw.mode === "disabled" ? raw.mode : "advisory";
  const workerBranchMutations =
    raw.workerBranchMutations === "intent" || raw.workerBranchMutations === "deny"
      ? raw.workerBranchMutations
      : "deny";
  return {
    mode,
    authorityBranchPatterns: readStringArray(raw.authorityBranchPatterns, DEFAULT_AUTHORITY_BRANCH_PATTERNS),
    workerBranchPatterns: readStringArray(raw.workerBranchPatterns, DEFAULT_WORKER_BRANCH_PATTERNS),
    workerBranchMutations
  };
}

function branchMatchesPattern(branch: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(branch);
}

function anyPatternMatches(branch: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (branchMatchesPattern(branch, pattern)) {
      return true;
    }
  }
  return false;
}

function runGit(workspacePath: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", args, {
    cwd: workspacePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? ""
  };
}

function readBranchContext(workspacePath: string): { available: boolean; branch: string | null; detachedHead: boolean } {
  const inside = runGit(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout !== "true") {
    return { available: false, branch: null, detachedHead: false };
  }
  const symbolic = runGit(workspacePath, ["symbolic-ref", "-q", "HEAD"]);
  if (!symbolic.ok || !symbolic.stdout.startsWith("refs/heads/")) {
    return { available: true, branch: null, detachedHead: true };
  }
  return {
    available: true,
    branch: symbolic.stdout.slice("refs/heads/".length),
    detachedHead: false
  };
}

export function resolveTaskStateAuthorityPosture(ctx: ModuleLifecycleContext): TaskStateAuthorityPosture {
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const config = normalizeStateAuthorityConfig(effectiveConfig);
  const explain: TaskStateAuthorityExplainEntry[] = [];

  if (config.mode === "disabled") {
    explain.push({
      code: "state-authority-disabled",
      message: "tasks.stateAuthority.mode=disabled; branch authority checks are bypassed."
    });
    return {
      schemaVersion: 1,
      mode: config.mode,
      classification: "disabled",
      workerBranchMutations: config.workerBranchMutations,
      branch: null,
      detachedHead: false,
      authorityBranchPatterns: config.authorityBranchPatterns,
      workerBranchPatterns: config.workerBranchPatterns,
      explain
    };
  }

  const branchContext = readBranchContext(ctx.workspacePath);
  if (!branchContext.available) {
    explain.push({
      code: "git-unavailable",
      message: "Unable to resolve git branch; mutation authority classification is unknown."
    });
    return {
      schemaVersion: 1,
      mode: config.mode,
      classification: "unknown",
      workerBranchMutations: config.workerBranchMutations,
      branch: null,
      detachedHead: false,
      authorityBranchPatterns: config.authorityBranchPatterns,
      workerBranchPatterns: config.workerBranchPatterns,
      explain
    };
  }
  if (branchContext.detachedHead || !branchContext.branch) {
    explain.push({
      code: "detached-head",
      message: "HEAD is detached; branch-based mutation authority is unknown."
    });
    return {
      schemaVersion: 1,
      mode: config.mode,
      classification: "unknown",
      workerBranchMutations: config.workerBranchMutations,
      branch: branchContext.branch,
      detachedHead: true,
      authorityBranchPatterns: config.authorityBranchPatterns,
      workerBranchPatterns: config.workerBranchPatterns,
      explain
    };
  }

  const authorityMatch = anyPatternMatches(branchContext.branch, config.authorityBranchPatterns);
  const workerMatch = anyPatternMatches(branchContext.branch, config.workerBranchPatterns);
  if (authorityMatch) {
    explain.push({
      code: "authority-branch-match",
      message: `Branch '${branchContext.branch}' matches authority patterns.`
    });
    if (workerMatch) {
      explain.push({
        code: "worker-pattern-also-matched",
        message: "Worker patterns also match; authority classification wins deterministically."
      });
    }
    return {
      schemaVersion: 1,
      mode: config.mode,
      classification: "authority",
      workerBranchMutations: config.workerBranchMutations,
      branch: branchContext.branch,
      detachedHead: false,
      authorityBranchPatterns: config.authorityBranchPatterns,
      workerBranchPatterns: config.workerBranchPatterns,
      explain
    };
  }
  if (workerMatch) {
    explain.push({
      code: "worker-branch-match",
      message: `Branch '${branchContext.branch}' matches worker patterns.`
    });
    return {
      schemaVersion: 1,
      mode: config.mode,
      classification: "worker",
      workerBranchMutations: config.workerBranchMutations,
      branch: branchContext.branch,
      detachedHead: false,
      authorityBranchPatterns: config.authorityBranchPatterns,
      workerBranchPatterns: config.workerBranchPatterns,
      explain
    };
  }

  explain.push({
    code: "branch-unmatched",
    message: `Branch '${branchContext.branch}' did not match authority or worker patterns.`
  });
  return {
    schemaVersion: 1,
    mode: config.mode,
    classification: "unknown",
    workerBranchMutations: config.workerBranchMutations,
    branch: branchContext.branch,
    detachedHead: false,
    authorityBranchPatterns: config.authorityBranchPatterns,
    workerBranchPatterns: config.workerBranchPatterns,
    explain
  };
}

export function isTaskStateAuthorityMutationAllowed(posture: TaskStateAuthorityPosture): boolean {
  if (posture.classification === "authority" || posture.classification === "disabled") {
    return true;
  }
  if (posture.mode === "advisory") {
    return true;
  }
  return false;
}
