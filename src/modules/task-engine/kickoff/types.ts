import type { TaskEntity } from "../types.js";

/** Stable finding codes for scope path manifest and git staleness checks. */
export type KickoffScopeFindingCode =
  | "kickoff-scope-path-missing"
  | "kickoff-scope-path-deleted"
  | "kickoff-scope-path-stale"
  | "kickoff-scope-path-parse-skipped"
  | "kickoff-git-unavailable";

export type KickoffScopeFinding = {
  code: KickoffScopeFindingCode;
  path?: string;
  message: string;
};

export type KickoffScopeManifestResult = {
  paths: string[];
  findings: KickoffScopeFinding[];
};

export type PathStalenessEntry = {
  path: string;
  exists: boolean;
  deleted: boolean;
  commitsSinceUpdate: number;
  lastCommitIso: string | null;
};

export type EvaluatePathStalenessInput = {
  workspacePath: string;
  paths: string[];
  sinceIso: string;
  baseRef?: string;
  /** Commits since `sinceIso` at or above this count emit kickoff-scope-path-stale. Default 3. */
  staleCommitThreshold?: number;
};

export type PathStalenessResult = {
  entries: PathStalenessEntry[];
  findings: KickoffScopeFinding[];
};

export type KickoffTaskInput = Pick<TaskEntity, "technicalScope" | "description" | "metadata">;
