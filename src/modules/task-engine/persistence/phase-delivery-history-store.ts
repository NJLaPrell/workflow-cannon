import type DatabaseCtor from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

export const KIT_PHASE_DELIVERY_HISTORY_TABLE = "kit_phase_delivery_history";

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

export function phaseDeliveryHistoryTableAvailable(db: SqliteDb): boolean {
  try {
    const path = typeof db.name === "string" ? db.name : "";
    if (!path) {
      return tableExists(db, KIT_PHASE_DELIVERY_HISTORY_TABLE);
    }
    const v = readKitSqliteUserVersion(path);
    return v >= 35 && tableExists(db, KIT_PHASE_DELIVERY_HISTORY_TABLE);
  } catch {
    return tableExists(db, KIT_PHASE_DELIVERY_HISTORY_TABLE);
  }
}

export type PhaseDeliveryHistoryStatus = "delivered" | "skipped" | "superseded";

export type PhaseDeliveryHistoryRow = {
  phaseKey: string;
  status: PhaseDeliveryHistoryStatus | string;
  deliveredAt: string;
  releaseVersion: string | null;
  gitTag: string | null;
  githubReleaseUrl: string | null;
  npmPackage: string | null;
  npmDistTag: string | null;
  releaseWorkflowUrl: string | null;
  mainCommitSha: string | null;
  releaseBranch: string | null;
  releasePrUrl: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPhaseDeliveryHistoryInput = {
  phaseKey: string;
  status?: PhaseDeliveryHistoryStatus | string;
  deliveredAt: string;
  releaseVersion?: string | null;
  gitTag?: string | null;
  githubReleaseUrl?: string | null;
  npmPackage?: string | null;
  npmDistTag?: string | null;
  releaseWorkflowUrl?: string | null;
  mainCommitSha?: string | null;
  releaseBranch?: string | null;
  releasePrUrl?: string | null;
  evidence?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  nowIso?: string;
};

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") {
    return null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseEvidence(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function upsertPhaseDeliveryHistory(db: SqliteDb, input: UpsertPhaseDeliveryHistoryInput): PhaseDeliveryHistoryRow | null {
  if (!phaseDeliveryHistoryTableAvailable(db)) {
    return null;
  }
  const phaseKey = cleanString(input.phaseKey);
  const deliveredAt = cleanString(input.deliveredAt);
  if (!phaseKey || !deliveredAt) {
    return null;
  }
  const nowIso = cleanString(input.nowIso) ?? new Date().toISOString();
  const createdAt = cleanString(input.createdAt) ?? nowIso;
  const updatedAt = cleanString(input.updatedAt) ?? nowIso;
  const evidenceJson = JSON.stringify(input.evidence ?? {});
  db.prepare(
    `INSERT INTO ${KIT_PHASE_DELIVERY_HISTORY_TABLE} (
       phase_key, status, delivered_at, release_version, git_tag, github_release_url,
       npm_package, npm_dist_tag, release_workflow_url, main_commit_sha, release_branch,
       release_pr_url, evidence_json, created_at, updated_at
     ) VALUES (
       @phaseKey, @status, @deliveredAt, @releaseVersion, @gitTag, @githubReleaseUrl,
       @npmPackage, @npmDistTag, @releaseWorkflowUrl, @mainCommitSha, @releaseBranch,
       @releasePrUrl, @evidenceJson, @createdAt, @updatedAt
     )
     ON CONFLICT(phase_key) DO UPDATE SET
       status = excluded.status,
       delivered_at = excluded.delivered_at,
       release_version = excluded.release_version,
       git_tag = excluded.git_tag,
       github_release_url = excluded.github_release_url,
       npm_package = excluded.npm_package,
       npm_dist_tag = excluded.npm_dist_tag,
       release_workflow_url = excluded.release_workflow_url,
       main_commit_sha = excluded.main_commit_sha,
       release_branch = excluded.release_branch,
       release_pr_url = excluded.release_pr_url,
       evidence_json = excluded.evidence_json,
       updated_at = excluded.updated_at`
  ).run({
    phaseKey,
    status: cleanString(input.status) ?? "delivered",
    deliveredAt,
    releaseVersion: cleanString(input.releaseVersion),
    gitTag: cleanString(input.gitTag),
    githubReleaseUrl: cleanString(input.githubReleaseUrl),
    npmPackage: cleanString(input.npmPackage),
    npmDistTag: cleanString(input.npmDistTag),
    releaseWorkflowUrl: cleanString(input.releaseWorkflowUrl),
    mainCommitSha: cleanString(input.mainCommitSha),
    releaseBranch: cleanString(input.releaseBranch),
    releasePrUrl: cleanString(input.releasePrUrl),
    evidenceJson,
    createdAt,
    updatedAt,
    nowIso
  });
  return readPhaseDeliveryHistoryRow(db, phaseKey);
}

export function readPhaseDeliveryHistoryRow(db: SqliteDb, phaseKey: string): PhaseDeliveryHistoryRow | null {
  if (!phaseDeliveryHistoryTableAvailable(db)) {
    return null;
  }
  const key = cleanString(phaseKey);
  if (!key) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT phase_key, status, delivered_at, release_version, git_tag, github_release_url,
              npm_package, npm_dist_tag, release_workflow_url, main_commit_sha, release_branch,
              release_pr_url, evidence_json, created_at, updated_at
       FROM ${KIT_PHASE_DELIVERY_HISTORY_TABLE}
       WHERE phase_key = ?`
    )
    .get(key) as
    | {
        phase_key: string;
        status: string;
        delivered_at: string;
        release_version: string | null;
        git_tag: string | null;
        github_release_url: string | null;
        npm_package: string | null;
        npm_dist_tag: string | null;
        release_workflow_url: string | null;
        main_commit_sha: string | null;
        release_branch: string | null;
        release_pr_url: string | null;
        evidence_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  return row ? mapPhaseDeliveryHistoryRow(row) : null;
}

export function listPhaseDeliveryHistory(db: SqliteDb, limit = 500): PhaseDeliveryHistoryRow[] {
  if (!phaseDeliveryHistoryTableAvailable(db)) {
    return [];
  }
  const rows = db
    .prepare(
      `SELECT phase_key, status, delivered_at, release_version, git_tag, github_release_url,
              npm_package, npm_dist_tag, release_workflow_url, main_commit_sha, release_branch,
              release_pr_url, evidence_json, created_at, updated_at
       FROM ${KIT_PHASE_DELIVERY_HISTORY_TABLE}
       ORDER BY delivered_at DESC, phase_key DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.floor(limit))) as Parameters<typeof mapPhaseDeliveryHistoryRow>[0][];
  return rows.map(mapPhaseDeliveryHistoryRow);
}

export function readPhaseDeliveryDatesByKey(db: SqliteDb, limit = 500): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of listPhaseDeliveryHistory(db, limit)) {
    if (row.status === "delivered") {
      out[row.phaseKey] = row.deliveredAt;
    }
  }
  return out;
}

export function readDeliveredPhaseKeysFromHistory(db: SqliteDb, limit = 500): string[] {
  return listPhaseDeliveryHistory(db, limit)
    .filter((row) => row.status === "delivered")
    .map((row) => row.phaseKey)
    .sort((a, b) => {
      const an = Number.parseInt(a.match(/^(\d+)/)?.[1] ?? "", 10);
      const bn = Number.parseInt(b.match(/^(\d+)/)?.[1] ?? "", 10);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
        return an - bn;
      }
      return a.localeCompare(b);
    });
}

function mapPhaseDeliveryHistoryRow(row: {
  phase_key: string;
  status: string;
  delivered_at: string;
  release_version: string | null;
  git_tag: string | null;
  github_release_url: string | null;
  npm_package: string | null;
  npm_dist_tag: string | null;
  release_workflow_url: string | null;
  main_commit_sha: string | null;
  release_branch: string | null;
  release_pr_url: string | null;
  evidence_json: string;
  created_at: string;
  updated_at: string;
}): PhaseDeliveryHistoryRow {
  return {
    phaseKey: row.phase_key,
    status: row.status,
    deliveredAt: row.delivered_at,
    releaseVersion: row.release_version,
    gitTag: row.git_tag,
    githubReleaseUrl: row.github_release_url,
    npmPackage: row.npm_package,
    npmDistTag: row.npm_dist_tag,
    releaseWorkflowUrl: row.release_workflow_url,
    mainCommitSha: row.main_commit_sha,
    releaseBranch: row.release_branch,
    releasePrUrl: row.release_pr_url,
    evidence: parseEvidence(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
