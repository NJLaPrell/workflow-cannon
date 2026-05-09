/**
 * Guidance pack export + import dry-run helpers (CAEUX-P2-05 / T100090).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { stableStringifyForCaeDigest } from "./cae-registry-load.js";

export type GuidancePackV1 = {
  schemaVersion: 1;
  exportedAt: string;
  sourceVersionId: string;
  artifacts: Array<Record<string, unknown>>;
  activations: Array<Record<string, unknown>>;
  artifactFileHashes?: Record<string, string | null>;
};

export function sha256FileIfReadable(absPath: string): string | null {
  try {
    if (!fs.existsSync(absPath)) return null;
    const st = fs.statSync(absPath);
    if (!st.isFile()) return null;
    return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
  } catch {
    return null;
  }
}

function artifactRowFingerprint(row: Record<string, unknown>): string {
  return stableStringifyForCaeDigest({
    artifactId: row.artifact_id,
    artifactType: row.artifact_type,
    path: row.path,
    title: row.title,
    description: row.description,
    metadata_json: row.metadata_json
  });
}

function activationRowFingerprint(row: Record<string, unknown>): string {
  return stableStringifyForCaeDigest({
    activationId: row.activation_id,
    family: row.family,
    priority: row.priority,
    lifecycle_state: row.lifecycle_state,
    scope_json: row.scope_json,
    artifact_refs_json: row.artifact_refs_json,
    acknowledgement_json: row.acknowledgement_json,
    metadata_json: row.metadata_json
  });
}

export function buildGuidancePackExport(input: {
  workspaceRoot: string;
  versionId: string;
  artifactRows: Record<string, unknown>[];
  activationRows: Record<string, unknown>[];
}): GuidancePackV1 {
  const hashes: Record<string, string | null> = {};
  const root = path.resolve(input.workspaceRoot);
  for (const r of input.artifactRows) {
    const aid = String(r.artifact_id ?? "");
    const p = String(r.path ?? "").trim();
    if (!aid.length || !p.length) continue;
    hashes[aid] = sha256FileIfReadable(path.resolve(root, p));
  }
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceVersionId: input.versionId,
    artifacts: input.artifactRows,
    activations: input.activationRows,
    artifactFileHashes: hashes
  };
}

export type GuidancePackDryRunResult = {
  schemaVersion: 1;
  artifactConflicts: Array<{ artifactId: string; reason: string }>;
  activationConflicts: Array<{ activationId: string; reason: string }>;
  artifactsWouldAdd: string[];
  activationsWouldAdd: string[];
};

export function dryRunGuidancePackImport(input: {
  pack: GuidancePackV1;
  activeArtifactRows: Record<string, unknown>[];
  activeActivationRows: Record<string, unknown>[];
}): GuidancePackDryRunResult {
  const activeArtById = new Map<string, Record<string, unknown>>();
  for (const r of input.activeArtifactRows) {
    const id = String(r.artifact_id ?? "");
    if (id.length) activeArtById.set(id, r);
  }
  const activeActById = new Map<string, Record<string, unknown>>();
  for (const r of input.activeActivationRows) {
    const id = String(r.activation_id ?? "");
    if (id.length) activeActById.set(id, r);
  }

  const artifactConflicts: GuidancePackDryRunResult["artifactConflicts"] = [];
  const artifactsWouldAdd: string[] = [];

  for (const r of input.pack.artifacts) {
    const id = String(r.artifact_id ?? "");
    if (!id.length) continue;
    const cur = activeArtById.get(id);
    if (!cur) {
      artifactsWouldAdd.push(id);
      continue;
    }
    if (artifactRowFingerprint(cur) !== artifactRowFingerprint(r)) {
      artifactConflicts.push({
        artifactId: id,
        reason: "Active registry row fingerprint differs from pack row for the same artifact_id"
      });
    }
  }

  const activationConflicts: GuidancePackDryRunResult["activationConflicts"] = [];
  const activationsWouldAdd: string[] = [];

  for (const r of input.pack.activations) {
    const id = String(r.activation_id ?? "");
    if (!id.length) continue;
    const cur = activeActById.get(id);
    if (!cur) {
      activationsWouldAdd.push(id);
      continue;
    }
    if (activationRowFingerprint(cur) !== activationRowFingerprint(r)) {
      activationConflicts.push({
        activationId: id,
        reason: "Active registry row fingerprint differs from pack row for the same activation_id"
      });
    }
  }

  return {
    schemaVersion: 1,
    artifactConflicts,
    activationConflicts,
    artifactsWouldAdd: artifactsWouldAdd.sort((a, b) => a.localeCompare(b)),
    activationsWouldAdd: activationsWouldAdd.sort((a, b) => a.localeCompare(b))
  };
}
