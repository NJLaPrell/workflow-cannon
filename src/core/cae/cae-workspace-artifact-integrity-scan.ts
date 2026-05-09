/**
 * Orphan + broken-ref scan for workspace CAE markdown (T100092).
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { CAE_WORKSPACE_ARTIFACT_DIRECTORIES, CAE_WORKSPACE_ARTIFACT_ROOT } from "./workspace-artifact-conventions.js";

export type CaeWorkspaceArtifactIntegrityFinding = {
  kind: "orphan_file" | "broken_ref";
  path: string;
  artifactId?: string;
  suggestion: string;
};

export type CaeWorkspaceArtifactIntegrityReport = {
  schemaVersion: 1;
  versionId: string;
  findings: CaeWorkspaceArtifactIntegrityFinding[];
};

function* walkMarkdownFilesUnderDir(absDir: string): Generator<string> {
  if (!existsSync(absDir)) return;
  for (const ent of readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      yield* walkMarkdownFilesUnderDir(abs);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
      yield abs;
    }
  }
}

function posixRelative(fromRoot: string, absFile: string): string {
  const rel = path.relative(fromRoot, absFile);
  return rel.split(path.sep).join("/");
}

/**
 * Scan workspace markdown under `.ai/cae/artifacts/` vs SQLite registry paths for the given version.
 */
export function scanCaeWorkspaceArtifactIntegrity(input: {
  workspaceRoot: string;
  db: InstanceType<typeof Database>;
  versionId: string;
}): CaeWorkspaceArtifactIntegrityReport {
  const roots = Object.values(CAE_WORKSPACE_ARTIFACT_DIRECTORIES).map((sub) =>
    path.join(input.workspaceRoot, CAE_WORKSPACE_ARTIFACT_ROOT, sub)
  );

  const rows = input.db
    .prepare(
      `SELECT artifact_id, path, retired_at FROM cae_registry_artifacts
       WHERE version_id = ? AND artifact_id GLOB 'workspace.*'`
    )
    .all(input.versionId) as { artifact_id: string; path: string; retired_at: string | null }[];

  const claimedPaths = new Set<string>();
  for (const r of rows) {
    const p = String(r.path ?? "").trim().replace(/\\/g, "/");
    if (!p.length) continue;
    claimedPaths.add(p);
  }

  const findings: CaeWorkspaceArtifactIntegrityFinding[] = [];

  for (const r of rows) {
    if (r.retired_at) continue;
    const p = String(r.path ?? "").trim().replace(/\\/g, "/");
    if (!p.length) continue;
    const abs = path.join(input.workspaceRoot, p);
    if (!existsSync(abs)) {
      findings.push({
        kind: "broken_ref",
        path: p,
        artifactId: r.artifact_id,
        suggestion: `Restore markdown at '${p}' or run cae-update-workspace-artifact to point '${r.artifact_id}' at a valid slug/path.`
      });
    }
  }

  for (const absRoot of roots) {
    for (const absFile of walkMarkdownFilesUnderDir(absRoot)) {
      const rel = posixRelative(input.workspaceRoot, absFile);
      if (claimedPaths.has(rel)) continue;
      findings.push({
        kind: "orphan_file",
        path: rel,
        suggestion: `No registry row references '${rel}'. Import with a new workspace artifact id, delete the file, or move it under _archive if it is obsolete.`
      });
    }
  }

  findings.sort((a, b) => {
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.path.localeCompare(b.path);
  });

  return { schemaVersion: 1, versionId: input.versionId, findings };
}
