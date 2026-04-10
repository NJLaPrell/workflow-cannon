/**
 * Load CAE artifact + activation registry from kit SQLite (active version).
 * Phase 70 — CAE_PLAN.md / T890.
 */

import fs from "node:fs";
import path from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import Database from "better-sqlite3";

import registryEntrySchema from "../../../schemas/cae/registry-entry.v1.json" with { type: "json" };
import activationDefSchema from "../../../schemas/cae/activation-definition.schema.json" with { type: "json" };

import { prepareKitSqliteDatabase } from "../state/workspace-kit-sqlite.js";
import {
  caeRegistryTablesReady,
  getActiveCaeRegistryVersionId,
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  listCaeRegistryActivationsForVersion,
  listCaeRegistryArtifactsForVersion,
  openKitSqliteReadWrite
} from "./cae-kit-sqlite.js";
import type {
  CaeLoadedRegistry,
  CaeRegistryActivationRow,
  CaeRegistryArtifactRow,
  LoadCaeRegistryResult
} from "./cae-registry-load.js";
import {
  digestCaeRegistryIdSet,
  verifyCaeArtifactRefPathsExist
} from "./cae-registry-load.js";

type SqliteDatabase = InstanceType<typeof Database>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv/dist/2020 default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;
const ajv = new Ajv2020Ctor({ allErrors: true, strict: false });
const validateArtifact = ajv.compile(registryEntrySchema as object) as ValidateFunction;
const validateActivation = ajv.compile(activationDefSchema as object) as ValidateFunction;

function parseJsonObject(raw: string, label: string): LoadCaeRegistryResult | Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return {
        ok: false,
        code: "cae-registry-sqlite-invalid-json",
        message: `${label} must be a JSON object`
      };
    }
    return v as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      code: "cae-registry-sqlite-invalid-json",
      message: `${label} is not valid JSON`
    };
  }
}

function dbArtifactToRegistryRow(row: {
  artifact_id: string;
  artifact_type: string;
  path: string;
  title: string | null;
  description: string | null;
  metadata_json: string;
  retired_at: string | null;
}): LoadCaeRegistryResult | CaeRegistryArtifactRow {
  if (row.retired_at) {
    return { ok: false, code: "cae-registry-sqlite-internal", message: "Unexpected retired artifact row" };
  }
  const metaParsed = parseJsonObject(row.metadata_json || "{}", "artifact metadata_json");
  if ("ok" in metaParsed && metaParsed.ok === false) return metaParsed;
  const meta = metaParsed as Record<string, unknown>;
  const out: Record<string, unknown> = {
    schemaVersion: 1,
    artifactId: row.artifact_id,
    artifactType: row.artifact_type,
    ref: { path: row.path }
  };
  if (row.title) out.title = row.title;
  if (typeof meta.fragment === "string") {
    (out.ref as Record<string, unknown>).fragment = meta.fragment;
  }
  if (Array.isArray(meta.tags)) {
    out.tags = meta.tags;
  }
  return out as CaeRegistryArtifactRow;
}

function dbActivationToRegistryRow(row: {
  activation_id: string;
  family: string;
  priority: number;
  lifecycle_state: string;
  scope_json: string;
  artifact_refs_json: string;
  acknowledgement_json: string | null;
  metadata_json: string;
  retired_at: string | null;
}): LoadCaeRegistryResult | CaeRegistryActivationRow {
  if (row.retired_at) {
    return { ok: false, code: "cae-registry-sqlite-internal", message: "Unexpected retired activation row" };
  }
  const scopeParsed = parseJsonObject(row.scope_json, "activation scope_json");
  if ("ok" in scopeParsed && scopeParsed.ok === false) return scopeParsed;
  let refsParsed: unknown;
  try {
    refsParsed = JSON.parse(row.artifact_refs_json) as unknown;
  } catch {
    return {
      ok: false,
      code: "cae-registry-sqlite-invalid-json",
      message: "activation artifact_refs_json is not valid JSON"
    };
  }
  if (!Array.isArray(refsParsed)) {
    return {
      ok: false,
      code: "cae-registry-sqlite-invalid-json",
      message: "activation artifact_refs_json must be a JSON array"
    };
  }
  const metaParsed = parseJsonObject(row.metadata_json || "{}", "activation metadata_json");
  if ("ok" in metaParsed && metaParsed.ok === false) return metaParsed;
  const meta = metaParsed as Record<string, unknown>;

  const out: Record<string, unknown> = {
    schemaVersion: 1,
    activationId: row.activation_id,
    family: row.family,
    lifecycleState: row.lifecycle_state,
    priority: row.priority,
    scope: scopeParsed,
    artifactRefs: refsParsed
  };

  if (row.acknowledgement_json && row.acknowledgement_json.trim().length > 0) {
    const ackParsed = parseJsonObject(row.acknowledgement_json, "activation acknowledgement_json");
    if ("ok" in ackParsed && ackParsed.ok === false) return ackParsed;
    const ack = ackParsed as Record<string, unknown>;
    if (typeof ack.strength === "string" && typeof ack.token === "string") {
      out.acknowledgement = ackParsed;
    }
  }

  if (meta.flags && typeof meta.flags === "object" && !Array.isArray(meta.flags)) {
    out.flags = meta.flags;
  }

  return out as CaeRegistryActivationRow;
}

/**
 * Assemble and validate the active CAE registry from an open kit SQLite handle.
 */
export function loadCaeRegistryFromSqliteDb(
  db: SqliteDatabase,
  workspaceRoot: string,
  options?: { verifyArtifactPaths?: boolean }
): LoadCaeRegistryResult {
  if (!caeRegistryTablesReady(db)) {
    return {
      ok: false,
      code: "cae-registry-sqlite-not-ready",
      message: "Kit SQLite schema does not include CAE registry tables (upgrade workspace-kit)"
    };
  }
  const versionId = getActiveCaeRegistryVersionId(db);
  if (!versionId) {
    return {
      ok: false,
      code: "cae-registry-sqlite-no-active-version",
      message: "No active CAE registry version in SQLite (import or activate a version)"
    };
  }

  const artifacts: CaeRegistryArtifactRow[] = [];
  const rawArts = listCaeRegistryArtifactsForVersion(db, versionId).filter((r) => !r.retired_at);
  for (let i = 0; i < rawArts.length; i++) {
    const mapped = dbArtifactToRegistryRow(rawArts[i]);
    if ("ok" in mapped && (mapped as LoadCaeRegistryResult).ok === false) {
      return mapped as LoadCaeRegistryResult;
    }
    const row = mapped as CaeRegistryArtifactRow;
    if (!validateArtifact(row)) {
      return {
        ok: false,
        code: "cae-registry-schema-invalid",
        message: `SQLite artifact ${rawArts[i].artifact_id}: ${ajv.errorsText(validateArtifact.errors)}`
      };
    }
    artifacts.push(row);
  }

  const activations: CaeRegistryActivationRow[] = [];
  const rawActs = listCaeRegistryActivationsForVersion(db, versionId).filter((r) => !r.retired_at);
  for (let i = 0; i < rawActs.length; i++) {
    const mapped = dbActivationToRegistryRow(rawActs[i]);
    if ("ok" in mapped && (mapped as LoadCaeRegistryResult).ok === false) {
      return mapped as LoadCaeRegistryResult;
    }
    const row = mapped as CaeRegistryActivationRow;
    if (!validateActivation(row)) {
      return {
        ok: false,
        code: "cae-activations-schema-invalid",
        message: `SQLite activation ${rawActs[i].activation_id}: ${ajv.errorsText(validateActivation.errors)}`
      };
    }
    activations.push(row);
  }

  const artifactById = new Map<string, CaeRegistryArtifactRow>();
  for (const row of artifacts) {
    const id = row.artifactId as string;
    if (artifactById.has(id)) {
      return { ok: false, code: "cae-registry-schema-invalid", message: `Duplicate artifactId: ${id}` };
    }
    artifactById.set(id, row);
  }

  const activationById = new Map<string, CaeRegistryActivationRow>();
  for (const row of activations) {
    const id = row.activationId as string;
    if (activationById.has(id)) {
      return { ok: false, code: "cae-activations-schema-invalid", message: `Duplicate activationId: ${id}` };
    }
    activationById.set(id, row);
  }

  for (const act of activations) {
    const refs = act.artifactRefs as Array<{ artifactId?: string }> | undefined;
    if (!refs?.length) continue;
    for (const r of refs) {
      const aid = r.artifactId;
      if (aid && !artifactById.has(aid)) {
        return {
          ok: false,
          code: "cae-registry-schema-invalid",
          message: `Activation references unknown artifactId: ${aid}`
        };
      }
    }
  }

  const verifyPaths = options?.verifyArtifactPaths !== false;
  if (verifyPaths) {
    const v = verifyCaeArtifactRefPathsExist(workspaceRoot, artifacts);
    if (v) return v;
  }

  const registryDigest = digestCaeRegistryIdSet([...artifactById.keys()], [...activationById.keys()]);

  const value: CaeLoadedRegistry = {
    artifacts,
    activations,
    artifactById,
    activationById,
    registryDigest
  };
  return { ok: true, value };
}

/**
 * Open kit planning SQLite from `workspaceRoot` + `effective` config and load the active CAE registry.
 */
export function loadCaeRegistryFromSqlite(
  workspaceRoot: string,
  effective: Record<string, unknown>,
  options?: { verifyArtifactPaths?: boolean }
): LoadCaeRegistryResult {
  const db = openKitSqliteReadWrite(workspaceRoot, effective);
  if (!db) {
    return {
      ok: false,
      code: "cae-kit-sqlite-unavailable",
      message: "Planning SQLite database not found or not openable"
    };
  }
  try {
    return loadCaeRegistryFromSqliteDb(db, workspaceRoot, options);
  } finally {
    db.close();
  }
}

/** Open DB at path (read/write), migrate, and load registry — for tests without full workspace config. */
export function loadCaeRegistryFromSqliteFilePath(
  dbAbsPath: string,
  workspaceRoot: string,
  options?: { verifyArtifactPaths?: boolean }
): LoadCaeRegistryResult {
  if (!fs.existsSync(dbAbsPath)) {
    return {
      ok: false,
      code: "cae-kit-sqlite-unavailable",
      message: `SQLite database not found: ${dbAbsPath}`
    };
  }
  const db = new Database(dbAbsPath);
  try {
    prepareKitSqliteDatabase(db);
    return loadCaeRegistryFromSqliteDb(db, workspaceRoot, options);
  } finally {
    db.close();
  }
}

/**
 * Deactivate all versions, insert a new active version, and persist artifact + activation rows
 * from a validated in-memory registry (typically from `loadCaeRegistry` JSON seed).
 */
export function replaceActiveCaeRegistryFromLoaded(
  db: SqliteDatabase,
  input: {
    versionId: string;
    createdBy: string;
    note?: string | null;
    registry: CaeLoadedRegistry;
  }
): void {
  const run = db.transaction(() => {
    db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cae_registry_versions (version_id, created_at, created_by, is_active, note) VALUES (?, ?, ?, 1, ?)`
    ).run(input.versionId, now, input.createdBy, input.note ?? null);

    for (const row of input.registry.artifacts) {
      const ref = row.ref as { path?: string; fragment?: string };
      const meta: Record<string, unknown> = {};
      if (Array.isArray(row.tags)) meta.tags = row.tags;
      if (typeof ref?.fragment === "string") meta.fragment = ref.fragment;
      insertCaeRegistryArtifactRow(db, {
        versionId: input.versionId,
        artifactId: String(row.artifactId),
        artifactType: String(row.artifactType),
        path: String(ref?.path ?? ""),
        title: typeof row.title === "string" ? row.title : null,
        metadataJson: JSON.stringify(meta)
      });
    }

    for (const row of input.registry.activations) {
      insertCaeRegistryActivationRow(db, {
        versionId: input.versionId,
        activationId: String(row.activationId),
        family: String(row.family),
        priority: Number(row.priority) || 0,
        lifecycleState: String(row.lifecycleState),
        scopeJson: JSON.stringify(row.scope ?? {}),
        artifactRefsJson: JSON.stringify(row.artifactRefs ?? []),
        acknowledgementJson: row.acknowledgement ? JSON.stringify(row.acknowledgement) : null,
        metadataJson: row.flags ? JSON.stringify({ flags: row.flags }) : "{}"
      });
    }
  });
  run();
}
