/**
 * Compare two CAE registry SQLite version snapshots (CAEUX-P2-02 / T100087).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { stableStringifyForCaeDigest } from "./cae-registry-load.js";

export type CaeRegistrySqliteArtifactRow = {
  version_id: string;
  artifact_id: string;
  artifact_type: string;
  path: string;
  title: string | null;
  description: string | null;
  metadata_json: string;
  retired_at: string | null;
};

export type CaeRegistrySqliteActivationRow = {
  version_id: string;
  activation_id: string;
  family: string;
  priority: number;
  lifecycle_state: string;
  scope_json: string;
  artifact_refs_json: string;
  acknowledgement_json: string | null;
  metadata_json: string;
  retired_at: string | null;
};

function artifactContentSnap(r: CaeRegistrySqliteArtifactRow): string {
  return stableStringifyForCaeDigest({
    artifactType: r.artifact_type,
    path: r.path,
    title: r.title,
    description: r.description,
    metadataJson: r.metadata_json,
    retiredAt: r.retired_at
  });
}

function artifactSnapSansRetired(r: CaeRegistrySqliteArtifactRow): string {
  return stableStringifyForCaeDigest({
    artifactType: r.artifact_type,
    path: r.path,
    title: r.title,
    description: r.description,
    metadataJson: r.metadata_json
  });
}

function activationContentSnap(r: CaeRegistrySqliteActivationRow): string {
  return stableStringifyForCaeDigest({
    family: r.family,
    priority: r.priority,
    lifecycleState: r.lifecycle_state,
    scopeJson: r.scope_json,
    artifactRefsJson: r.artifact_refs_json,
    acknowledgementJson: r.acknowledgement_json,
    metadataJson: r.metadata_json,
    retiredAt: r.retired_at
  });
}

function normRetired(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function sha256FileIfExists(absPath: string): string | null {
  try {
    if (!fs.existsSync(absPath)) return null;
    const st = fs.statSync(absPath);
    if (!st.isFile()) return null;
    const buf = fs.readFileSync(absPath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

function collectPathConflicts(rows: CaeRegistrySqliteArtifactRow[]): Array<{ path: string; artifactIds: string[] }> {
  const byPath = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = String(r.path ?? "").trim();
    if (!p.length) continue;
    const set = byPath.get(p) ?? new Set<string>();
    set.add(r.artifact_id);
    byPath.set(p, set);
  }
  const out: Array<{ path: string; artifactIds: string[] }> = [];
  for (const [p, set] of byPath) {
    if (set.size > 1) {
      out.push({ path: p, artifactIds: [...set].sort((a, b) => a.localeCompare(b)) });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export type CompareCaeRegistryVersionsInput = {
  workspaceRoot: string;
  fromVersionId: string;
  toVersionId: string;
  fromArtifacts: CaeRegistrySqliteArtifactRow[];
  toArtifacts: CaeRegistrySqliteArtifactRow[];
  fromActivations: CaeRegistrySqliteActivationRow[];
  toActivations: CaeRegistrySqliteActivationRow[];
  includeFileContentHashes?: boolean;
};

export type CaeRegistryVersionCompareData = {
  schemaVersion: 1;
  fromVersionId: string;
  toVersionId: string;
  artifacts: {
    added: string[];
    removed: string[];
    changed: string[];
    retired: string[];
    hidden: string[];
    conflicting: Array<
      | { kind: "duplicate_path"; scope: "from" | "to"; path: string; artifactIds: string[] }
      | { kind: "path_mismatch_same_id"; artifactId: string; fromPath: string; toPath: string }
    >;
  };
  activations: {
    added: string[];
    removed: string[];
    changed: string[];
    retired: string[];
    hidden: string[];
    conflicting: string[];
  };
  fileContentHashDiffs?: Array<{
    artifactId: string;
    fromPath: string;
    toPath: string;
    fromSha: string | null;
    toSha: string | null;
  }>;
};

export function compareCaeRegistryVersions(input: CompareCaeRegistryVersionsInput): CaeRegistryVersionCompareData {
  const fromA = new Map(input.fromArtifacts.map((r) => [r.artifact_id, r]));
  const toA = new Map(input.toArtifacts.map((r) => [r.artifact_id, r]));
  const fromAct = new Map(input.fromActivations.map((r) => [r.activation_id, r]));
  const toAct = new Map(input.toActivations.map((r) => [r.activation_id, r]));

  const artAdded: string[] = [];
  const artRemoved: string[] = [];
  const artChanged: string[] = [];
  const artRetired: string[] = [];
  const artConflicting: CaeRegistryVersionCompareData["artifacts"]["conflicting"] = [];

  const allArtIds = new Set<string>([...fromA.keys(), ...toA.keys()]);
  for (const id of [...allArtIds].sort((a, b) => a.localeCompare(b))) {
    const f = fromA.get(id);
    const t = toA.get(id);
    if (f && !t) {
      artRemoved.push(id);
      continue;
    }
    if (t && !f) {
      artAdded.push(id);
      continue;
    }
    if (f && t) {
      if (String(f.path).trim() !== String(t.path).trim()) {
        artConflicting.push({ kind: "path_mismatch_same_id", artifactId: id, fromPath: f.path, toPath: t.path });
      }
      const rFrom = normRetired(f.retired_at);
      const rTo = normRetired(t.retired_at);
      if (rFrom !== rTo) {
        artRetired.push(id);
      }
      if (artifactSnapSansRetired(f) !== artifactSnapSansRetired(t)) {
        artChanged.push(id);
      }
    }
  }

  for (const c of collectPathConflicts(input.fromArtifacts)) {
    artConflicting.push({ kind: "duplicate_path", scope: "from", path: c.path, artifactIds: c.artifactIds });
  }
  for (const c of collectPathConflicts(input.toArtifacts)) {
    artConflicting.push({ kind: "duplicate_path", scope: "to", path: c.path, artifactIds: c.artifactIds });
  }

  const actAdded: string[] = [];
  const actRemoved: string[] = [];
  const actChanged: string[] = [];
  const actRetired: string[] = [];
  const actHidden: string[] = [];
  const actConflicting: string[] = [];

  const allActIds = new Set<string>([...fromAct.keys(), ...toAct.keys()]);
  for (const id of [...allActIds].sort((a, b) => a.localeCompare(b))) {
    const f = fromAct.get(id);
    const t = toAct.get(id);
    if (f && !t) {
      actRemoved.push(id);
      continue;
    }
    if (t && !f) {
      actAdded.push(id);
      continue;
    }
    if (f && t) {
      if ((f.lifecycle_state === "hidden") !== (t.lifecycle_state === "hidden")) {
        actHidden.push(id);
      }
      if (normRetired(f.retired_at) !== normRetired(t.retired_at)) {
        actRetired.push(id);
      }
      if (activationContentSnap(f) !== activationContentSnap(t)) {
        actChanged.push(id);
      }
    }
  }

  const root = path.resolve(input.workspaceRoot);
  let fileContentHashDiffs: CaeRegistryVersionCompareData["fileContentHashDiffs"] | undefined;
  if (input.includeFileContentHashes) {
    fileContentHashDiffs = [];
    for (const id of [...allArtIds].sort((a, b) => a.localeCompare(b))) {
      const f = fromA.get(id);
      const t = toA.get(id);
      const fromPath = f ? String(f.path).trim() : "";
      const toPath = t ? String(t.path).trim() : "";
      if (!fromPath && !toPath) continue;
      const fromAbs = fromPath.length ? path.resolve(root, fromPath) : "";
      const toAbs = toPath.length ? path.resolve(root, toPath) : "";
      const fromSha = fromAbs ? sha256FileIfExists(fromAbs) : null;
      const toSha = toAbs ? sha256FileIfExists(toAbs) : null;
      if (fromSha !== toSha) {
        fileContentHashDiffs.push({
          artifactId: id,
          fromPath: fromPath || "",
          toPath: toPath || "",
          fromSha,
          toSha
        });
      }
    }
  }

  return {
    schemaVersion: 1,
    fromVersionId: input.fromVersionId,
    toVersionId: input.toVersionId,
    artifacts: {
      added: artAdded,
      removed: artRemoved,
      changed: [...new Set(artChanged)].sort((a, b) => a.localeCompare(b)),
      retired: [...new Set(artRetired)].sort((a, b) => a.localeCompare(b)),
      hidden: [],
      conflicting: artConflicting
    },
    activations: {
      added: actAdded,
      removed: actRemoved,
      changed: [...new Set(actChanged)].sort((a, b) => a.localeCompare(b)),
      retired: [...new Set(actRetired)].sort((a, b) => a.localeCompare(b)),
      hidden: [...new Set(actHidden)].sort((a, b) => a.localeCompare(b)),
      conflicting: actConflicting
    },
    ...(fileContentHashDiffs !== undefined ? { fileContentHashDiffs } : {})
  };
}
