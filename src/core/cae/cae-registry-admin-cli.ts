/**
 * CAE SQLite registry admin `wk run` command implementations (CAE_PLAN Epic 4 D1–D3).
 * Policy: `caeRegistryMutationGateError` (Epic 5) — not Tier A `policyApproval`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import {
  caeRegistryTablesReady,
  copyCaeRegistryVersionContents,
  deleteInactiveCaeRegistryVersion,
  getActiveCaeRegistryVersionId,
  getCaeRegistryCheckpointById,
  getCaeRegistryVersionMeta,
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  insertCaeRegistryMutationAudit,
  insertCaeRegistryVersion,
  listCaeRegistryCheckpointsForVersion,
  listCaeRegistryVersionsWithCounts,
  openKitSqliteReadWrite,
  retireCaeRegistryActivation,
  retireCaeRegistryArtifact,
  updateCaeRegistryActivationFields,
  updateCaeRegistryArtifactFields
} from "./cae-kit-sqlite.js";
import { caeRegistryMutationGateError } from "./cae-registry-mutation-gate.js";
import { loadCaeRegistryFromSqliteDb } from "./cae-registry-sqlite.js";
import {
  CAE_WORKSPACE_ARTIFACT_ID_PREFIX,
  CAE_WORKSPACE_ARTIFACT_ROOT,
  buildCaeWorkspaceArtifactArchiveRelativePath,
  buildCaeWorkspaceArtifactHardDeleteTombstoneRelativePath,
  buildCaeWorkspaceArtifactPath,
  classifyCaeArtifactIdNamespace,
  validateCaeWorkspaceArtifactId
} from "./workspace-artifact-conventions.js";
import {
  buildCaeReconcileDefaultsReport
} from "./cae-reconcile-defaults.js";
import {
  buildGuidancePackExport,
  dryRunGuidancePackImport,
  type GuidancePackV1
} from "./cae-guidance-pack.js";
import {
  loadCaeRegistry,
  validateSingleCaeActivationRecord,
  validateSingleCaeArtifactRecord,
  verifyCaeArtifactRefPathsExist,
  type CaeRegistryActivationRow,
  type CaeRegistryArtifactRow
} from "./cae-registry-load.js";
import {
  compareCaeRegistryVersions,
  type CaeRegistrySqliteActivationRow,
  type CaeRegistrySqliteArtifactRow
} from "./cae-registry-version-compare.js";

type SqliteDb = InstanceType<typeof Database>;

function requireSchemaV1(args: Record<string, unknown>): ModuleCommandResult | null {
  if (args.schemaVersion !== 1) {
    return { ok: false, code: "invalid-args", message: "schemaVersion must be 1" };
  }
  return null;
}

function requireActor(args: Record<string, unknown>): string | ModuleCommandResult {
  const actor = typeof args.actor === "string" ? args.actor.trim() : "";
  if (!actor) {
    return { ok: false, code: "invalid-args", message: "actor is required (non-empty string) for CAE registry mutations" };
  }
  return actor;
}

function resolveVersionId(
  db: SqliteDb,
  raw: unknown
): string | ModuleCommandResult {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const id = raw.trim();
    if (!getCaeRegistryVersionMeta(db, id)) {
      return { ok: false, code: "cae-registry-version-not-found", message: `Unknown versionId '${id}'` };
    }
    return id;
  }
  const active = getActiveCaeRegistryVersionId(db);
  if (!active) {
    return {
      ok: false,
      code: "cae-registry-sqlite-no-active-version",
      message: "No active CAE registry version (pass versionId explicitly)"
    };
  }
  return active;
}

function caeNonRetiredArtifactExists(db: SqliteDb, versionId: string, artifactId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ? AND retired_at IS NULL`
    )
    .get(versionId, artifactId);
  return Boolean(row);
}

function parseActivationArtifactRefs(raw: string): Array<{ artifactId: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { artifactId: string } => {
      return !!item && typeof item === "object" && !Array.isArray(item) && typeof (item as { artifactId?: unknown }).artifactId === "string";
    });
  } catch {
    return [];
  }
}

function parseActivationMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readPreviewEvidence(raw: unknown):
  | { ok: true; value: null }
  | {
      ok: true;
      value: {
        registryDigest: string | null;
        traceId: string | null;
        activationId: string | null;
        activationReadinessLevel: string | null;
        conflictStatus: string | null;
      };
    }
  | { ok: false; code: string; message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid-args", message: "previewEvidence must be a JSON object when provided" };
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return { ok: false, code: "invalid-args", message: "previewEvidence.schemaVersion must be 1" };
  }
  const draftImpact = record.draftImpact && typeof record.draftImpact === "object" && !Array.isArray(record.draftImpact)
    ? (record.draftImpact as Record<string, unknown>)
    : {};
  const readiness = record.enforcementReadiness && typeof record.enforcementReadiness === "object" && !Array.isArray(record.enforcementReadiness)
    ? (record.enforcementReadiness as Record<string, unknown>)
    : {};
  return {
    ok: true,
    value: {
      registryDigest: readOptionalNonEmptyString(record.registryContentHash) ?? readOptionalNonEmptyString(record.registryDigest),
      traceId: readOptionalNonEmptyString(record.traceId),
      activationId: readOptionalNonEmptyString(record.activationId),
      activationReadinessLevel:
        readOptionalNonEmptyString(readiness.activationReadinessLevel) ?? readOptionalNonEmptyString(draftImpact.activationReadinessLevel),
      conflictStatus: readOptionalNonEmptyString(readiness.conflictStatus)
    }
  };
}

function assertActivationRefsExist(
  db: SqliteDb,
  versionId: string,
  activation: CaeRegistryActivationRow
): ModuleCommandResult | null {
  const refs = activation.artifactRefs as Array<{ artifactId?: string }> | undefined;
  if (!refs?.length) return null;
  for (const r of refs) {
    const aid = typeof r.artifactId === "string" ? r.artifactId.trim() : "";
    if (!aid) continue;
    if (!caeNonRetiredArtifactExists(db, versionId, aid)) {
      return {
        ok: false,
        code: "cae-registry-schema-invalid",
        message: `activation references unknown or retired artifactId: ${aid}`
      };
    }
  }
  return null;
}

function postMutationRegistryCheck(
  db: SqliteDb,
  workspacePath: string,
  verifyArtifactPaths: boolean
): ModuleCommandResult | null {
  const loaded = loadCaeRegistryFromSqliteDb(db, workspacePath, { verifyArtifactPaths });
  if (!loaded.ok) {
    return { ok: false, code: loaded.code, message: loaded.message };
  }
  return null;
}

/** Skip full-registry reload when nothing is active (e.g. first inactive version header). */
function postMutationRegistryCheckIfActive(
  db: SqliteDb,
  workspacePath: string,
  verifyArtifactPaths: boolean
): ModuleCommandResult | null {
  if (!getActiveCaeRegistryVersionId(db)) return null;
  return postMutationRegistryCheck(db, workspacePath, verifyArtifactPaths);
}

function readOptionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function staleStateError(input: {
  expectedActiveVersionId: string | null;
  actualActiveVersionId: string | null;
  expectedRegistryDigest: string | null;
  actualRegistryDigest: string | null;
}): ModuleCommandResult {
  return {
    ok: false,
    code: "cae-stale-state",
    message: "CAE registry changed since this authoring state was loaded. Refresh and retry.",
    data: {
      schemaVersion: 1,
      staleState: {
        expectedActiveVersionId: input.expectedActiveVersionId,
        actualActiveVersionId: input.actualActiveVersionId,
        expectedRegistryDigest: input.expectedRegistryDigest,
        actualRegistryDigest: input.actualRegistryDigest,
        repair: {
          action: "refresh-authoring-state",
          message: "Refresh the CAE authoring summary or reopen the editor, then retry your mutation on the latest state."
        }
      }
    }
  };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function workspaceArtifactDefaultSlug(artifactId: string): string {
  return artifactId.startsWith(CAE_WORKSPACE_ARTIFACT_ID_PREFIX)
    ? artifactId.slice(CAE_WORKSPACE_ARTIFACT_ID_PREFIX.length)
    : artifactId;
}

function workspaceArtifactMarkdown(title: string, contentMarkdown: string | null): string {
  if (typeof contentMarkdown === "string") return contentMarkdown;
  return `# ${title}\n`;
}

function allocateUniqueRelativeMarkdownPath(workspaceRoot: string, preferredRelative: string): string {
  if (!existsSync(path.join(workspaceRoot, preferredRelative))) return preferredRelative;
  const base = preferredRelative.replace(/\.md$/i, "");
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}.md`;
    if (!existsSync(path.join(workspaceRoot, candidate))) return candidate;
  }
  return preferredRelative;
}

function workspaceSlugFromArtifactRow(relPath: string, metadataJson: string, artifactId: string): string {
  try {
    const parsed = JSON.parse(metadataJson || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const slug = (parsed as Record<string, unknown>).slug;
      const s = readOptionalNonEmptyString(slug);
      if (s) return s;
    }
  } catch {
    // fall through
  }
  const stem = path.basename(relPath, path.extname(relPath));
  return stem.length > 0 ? stem : workspaceArtifactDefaultSlug(artifactId);
}

function collectArtifactReferencingActivationIds(db: SqliteDb, versionId: string, artifactId: string): string[] {
  const rows = db
    .prepare(
      `SELECT activation_id, artifact_refs_json
       FROM cae_registry_activations
       WHERE version_id = ? AND retired_at IS NULL`
    )
    .all(versionId) as { activation_id: string; artifact_refs_json: string }[];

  const activationIds: string[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.artifact_refs_json) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    if (
      parsed.some(
        (entry) => entry && typeof entry === "object" && (entry as { artifactId?: string }).artifactId === artifactId
      )
    ) {
      activationIds.push(row.activation_id);
    }
  }
  return activationIds.sort();
}

function collectDraftActivationWarnings(activation: CaeRegistryActivationRow): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];
  const conditions =
    activation.scope && typeof activation.scope === "object" && Array.isArray((activation.scope as { conditions?: unknown[] }).conditions)
      ? ((activation.scope as { conditions: unknown[] }).conditions as Array<Record<string, unknown>>)
      : [];

  if (String(activation.family) === "policy") {
    warnings.push({
      code: "cae-draft-policy-family",
      message: "Policy-family draft activations can affect broad Guidance behavior; review before activation."
    });
  }

  for (const condition of conditions) {
    if (condition.kind === "always") {
      warnings.push({
        code: "cae-draft-broad-scope-always",
        message: "Always-on draft activations match every evaluation context."
      });
      continue;
    }
    if (condition.kind === "commandName" && condition.match === "prefix") {
      warnings.push({
        code: "cae-draft-broad-scope-command-prefix",
        message: "Command-prefix draft activations can match many commands; review scope before activation."
      });
    }
  }

  return warnings;
}

function checkCaeMutationStaleness(
  db: SqliteDb,
  workspacePath: string,
  args: Record<string, unknown>
): ModuleCommandResult | null {
  const expectedActiveVersionId = readOptionalNonEmptyString(args.expectedActiveVersionId);
  const expectedRegistryDigest = readOptionalNonEmptyString(args.expectedRegistryDigest);
  if (!expectedActiveVersionId && !expectedRegistryDigest) {
    return null;
  }

  const actualActiveVersionId = getActiveCaeRegistryVersionId(db);
  let actualRegistryDigest: string | null = null;
  if (expectedRegistryDigest && actualActiveVersionId) {
    const loaded = loadCaeRegistryFromSqliteDb(db, workspacePath, { verifyArtifactPaths: false });
    if (!loaded.ok) {
      return { ok: false, code: loaded.code, message: loaded.message };
    }
    actualRegistryDigest = loaded.value.registryDigest;
  }

  const activeVersionMismatch =
    expectedActiveVersionId !== null && expectedActiveVersionId !== actualActiveVersionId;
  const registryDigestMismatch =
    expectedRegistryDigest !== null && expectedRegistryDigest !== actualRegistryDigest;
  if (!activeVersionMismatch && !registryDigestMismatch) {
    return null;
  }

  return staleStateError({
    expectedActiveVersionId,
    actualActiveVersionId,
    expectedRegistryDigest,
    actualRegistryDigest
  });
}

/**
 * Handles CAE registry admin `cae-*` commands; returns `undefined` when `name` is not a registry admin command.
 */
export function tryHandleCaeRegistryAdminCommand(
  name: string,
  args: Record<string, unknown>,
  workspacePath: string,
  effective: Record<string, unknown>
): ModuleCommandResult | undefined {
  const adminCommands = new Set([
    "cae-create-artifact",
    "cae-create-workspace-artifact",
    "cae-duplicate-default-artifact",
    "cae-update-artifact",
    "cae-update-workspace-artifact",
    "cae-archive-retired-workspace-artifact-file",
    "cae-hard-delete-retired-workspace-artifact-file",
    "cae-retire-artifact",
    "cae-retire-workspace-artifact",
    "cae-create-activation",
    "cae-create-draft-activation",
    "cae-activate-draft-activation",
    "cae-update-activation",
    "cae-update-draft-activation",
    "cae-disable-activation",
    "cae-retire-activation",
    "cae-list-registry-versions",
    "cae-get-registry-version",
    "cae-compare-registry-versions",
    "cae-reconcile-defaults",
    "cae-export-guidance-pack",
    "cae-import-guidance-pack-dry-run",
    "cae-create-registry-version",
    "cae-clone-registry-version",
    "cae-activate-registry-version",
    "cae-activate-registry-checkpoint",
    "cae-delete-registry-version",
    "cae-rollback-registry-version"
  ]);
  if (!adminCommands.has(name)) {
    return undefined;
  }

  const bad = requireSchemaV1(args);
  if (bad) return bad;

  const readOnly =
    name === "cae-list-registry-versions" ||
    name === "cae-get-registry-version" ||
    name === "cae-compare-registry-versions" ||
    name === "cae-reconcile-defaults" ||
    name === "cae-export-guidance-pack" ||
    name === "cae-import-guidance-pack-dry-run";
  if (!readOnly) {
    const gate = caeRegistryMutationGateError(effective, args);
    if (gate) return gate;
  }

  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (!db) {
    return {
      ok: false,
      code: "cae-kit-sqlite-unavailable",
      message: "Planning SQLite database not found or not openable"
    };
  }

  try {
    if (!caeRegistryTablesReady(db)) {
      return {
        ok: false,
        code: "cae-registry-sqlite-not-ready",
        message: "Kit SQLite schema does not include CAE registry tables (upgrade workspace-kit)"
      };
    }

    if (name === "cae-list-registry-versions") {
      const rows = listCaeRegistryVersionsWithCounts(db);
      return {
        ok: true,
        code: "cae-list-registry-versions-ok",
        data: {
          schemaVersion: 1,
          versions: rows.map((r) => ({
            versionId: r.version_id,
            createdAt: r.created_at,
            createdBy: r.created_by,
            isActive: r.is_active === 1,
            note: r.note,
            artifactCount: r.artifact_count,
            activationCount: r.activation_count
          }))
        }
      };
    }

    if (name === "cae-get-registry-version") {
      const vidRaw = typeof args.versionId === "string" ? args.versionId.trim() : "";
      if (!vidRaw) {
        return { ok: false, code: "invalid-args", message: "versionId is required" };
      }
      const meta = getCaeRegistryVersionMeta(db, vidRaw);
      if (!meta) {
        return { ok: false, code: "cae-registry-version-not-found", message: `Unknown versionId '${vidRaw}'` };
      }
      const includeRows = args.includeRows === true;
      const includeCheckpoints = args.includeCheckpoints === true;
      const arts = includeRows ? db.prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ?`).all(vidRaw) : [];
      const acts = includeRows ? db.prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ?`).all(vidRaw) : [];
      const checkpoints = includeCheckpoints
        ? listCaeRegistryCheckpointsForVersion(db, vidRaw).map((c) => ({
            id: c.id,
            recordedAt: c.recorded_at,
            label: c.label,
            actor: c.actor,
            note: c.note,
            registryDigest: c.registry_digest,
            mutationIds: (() => {
              try {
                const parsed = JSON.parse(c.mutation_ids_json || "[]") as unknown;
                return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
              } catch {
                return [];
              }
            })()
          }))
        : undefined;
      return {
        ok: true,
        code: "cae-get-registry-version-ok",
        data: {
          schemaVersion: 1,
          version: {
            versionId: meta.version_id,
            createdAt: meta.created_at,
            createdBy: meta.created_by,
            isActive: meta.is_active === 1,
            note: meta.note
          },
          ...(includeRows ? { artifactRows: arts, activationRows: acts } : {}),
          ...(checkpoints !== undefined ? { checkpoints } : {})
        }
      };
    }

    if (name === "cae-compare-registry-versions") {
      const fromId = typeof args.fromVersionId === "string" ? args.fromVersionId.trim() : "";
      const toId = typeof args.toVersionId === "string" ? args.toVersionId.trim() : "";
      if (!fromId.length || !toId.length) {
        return { ok: false, code: "invalid-args", message: "fromVersionId and toVersionId are required" };
      }
      if (fromId === toId) {
        return { ok: false, code: "invalid-args", message: "fromVersionId and toVersionId must differ" };
      }
      if (!getCaeRegistryVersionMeta(db, fromId)) {
        return {
          ok: false,
          code: "cae-registry-version-not-found",
          message: `Unknown fromVersionId '${fromId}'`
        };
      }
      if (!getCaeRegistryVersionMeta(db, toId)) {
        return {
          ok: false,
          code: "cae-registry-version-not-found",
          message: `Unknown toVersionId '${toId}'`
        };
      }
      const fromArts = db
        .prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ?`)
        .all(fromId) as CaeRegistrySqliteArtifactRow[];
      const toArts = db
        .prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ?`)
        .all(toId) as CaeRegistrySqliteArtifactRow[];
      const fromActs = db
        .prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ?`)
        .all(fromId) as CaeRegistrySqliteActivationRow[];
      const toActs = db
        .prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ?`)
        .all(toId) as CaeRegistrySqliteActivationRow[];
      const data = compareCaeRegistryVersions({
        workspaceRoot: workspacePath,
        fromVersionId: fromId,
        toVersionId: toId,
        fromArtifacts: fromArts,
        toArtifacts: toArts,
        fromActivations: fromActs,
        toActivations: toActs,
        includeFileContentHashes: args.includeFileContentHashes === true
      });
      return {
        ok: true,
        code: "cae-compare-registry-versions-ok",
        data
      };
    }

    if (name === "cae-reconcile-defaults") {
      const pkg = loadCaeRegistry(workspacePath, { verifyArtifactPaths: false });
      if (!pkg.ok) {
        return { ok: false, code: pkg.code, message: pkg.message ?? "" };
      }
      const sqlite = loadCaeRegistryFromSqliteDb(db, workspacePath, { verifyArtifactPaths: false });
      if (!sqlite.ok) {
        return { ok: false, code: sqlite.code, message: sqlite.message ?? "" };
      }
      const data = buildCaeReconcileDefaultsReport(pkg.value, sqlite.value);
      return { ok: true, code: "cae-reconcile-defaults-ok", data };
    }

    if (name === "cae-export-guidance-pack") {
      const vid = getActiveCaeRegistryVersionId(db);
      if (!vid) {
        return { ok: false, code: "cae-registry-sqlite-no-active-version", message: "No active registry version" };
      }
      const arts = db
        .prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ? AND retired_at IS NULL`)
        .all(vid) as Record<string, unknown>[];
      const acts = db
        .prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ? AND retired_at IS NULL`)
        .all(vid) as Record<string, unknown>[];
      const pack = buildGuidancePackExport({
        workspaceRoot: workspacePath,
        versionId: vid,
        artifactRows: arts,
        activationRows: acts
      });
      return { ok: true, code: "cae-export-guidance-pack-ok", data: { schemaVersion: 1, pack } };
    }

    if (name === "cae-import-guidance-pack-dry-run") {
      const rel = typeof args.packRelativePath === "string" ? args.packRelativePath.trim() : "";
      if (!rel.length) {
        return { ok: false, code: "invalid-args", message: "packRelativePath is required" };
      }
      const abs = path.resolve(workspacePath, rel);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(abs, "utf8")) as unknown;
      } catch {
        return {
          ok: false,
          code: "cae-guidance-pack-read-error",
          message: `Unable to read or parse pack JSON at '${rel}'`
        };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, code: "invalid-args", message: "Pack file must be a JSON object" };
      }
      const obj = parsed as Record<string, unknown>;
      let packRaw: Record<string, unknown>;
      if (obj.pack && typeof obj.pack === "object" && !Array.isArray(obj.pack)) {
        packRaw = obj.pack as Record<string, unknown>;
      } else if (
        obj.data &&
        typeof obj.data === "object" &&
        !Array.isArray(obj.data)
      ) {
        const data = obj.data as Record<string, unknown>;
        if (data.pack && typeof data.pack === "object" && !Array.isArray(data.pack)) {
          packRaw = data.pack as Record<string, unknown>;
        } else {
          packRaw = obj;
        }
      } else {
        packRaw = obj;
      }
      if (packRaw.schemaVersion !== 1) {
        return { ok: false, code: "invalid-args", message: "pack.schemaVersion must be 1" };
      }
      const pack = packRaw as unknown as GuidancePackV1;
      if (!Array.isArray(pack.artifacts) || !Array.isArray(pack.activations)) {
        return { ok: false, code: "invalid-args", message: "pack.artifacts and pack.activations must be arrays" };
      }
      const vid = getActiveCaeRegistryVersionId(db);
      if (!vid) {
        return { ok: false, code: "cae-registry-sqlite-no-active-version", message: "No active registry version" };
      }
      const activeArts = db
        .prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ? AND retired_at IS NULL`)
        .all(vid) as Record<string, unknown>[];
      const activeActs = db
        .prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ? AND retired_at IS NULL`)
        .all(vid) as Record<string, unknown>[];
      const data = dryRunGuidancePackImport({
        pack,
        activeArtifactRows: activeArts,
        activeActivationRows: activeActs
      });
      return { ok: true, code: "cae-import-guidance-pack-dry-run-ok", data };
    }

    const actorRes = requireActor(args);
    if (typeof actorRes !== "string") return actorRes;
    const actor = actorRes;
    const stale = checkCaeMutationStaleness(db, workspacePath, args);
    if (stale) return stale;

    if (name === "cae-create-registry-version") {
      const versionIdRaw = typeof args.versionId === "string" ? args.versionId.trim() : "";
      const versionId =
        versionIdRaw.length > 0 ? versionIdRaw : `cae.reg.version.${Date.now()}`;
      if (getCaeRegistryVersionMeta(db, versionId)) {
        return { ok: false, code: "invalid-args", message: `versionId '${versionId}' already exists` };
      }
      const note = typeof args.note === "string" ? args.note : null;
      const setActive = args.setActive === true;
      const run = db.transaction(() => {
        insertCaeRegistryVersion(db, { versionId, createdBy: actor, note, setActive });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId,
          note,
          payload: { setActive }
        });
      });
      run();
      const check = setActive
        ? postMutationRegistryCheck(db, workspacePath, true)
        : postMutationRegistryCheckIfActive(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-create-registry-version-ok",
        data: { schemaVersion: 1, versionId, setActive }
      };
    }

    if (name === "cae-clone-registry-version") {
      const fromId = typeof args.fromVersionId === "string" ? args.fromVersionId.trim() : "";
      const toId = typeof args.toVersionId === "string" ? args.toVersionId.trim() : "";
      if (!fromId || !toId) {
        return { ok: false, code: "invalid-args", message: "fromVersionId and toVersionId are required strings" };
      }
      if (!getCaeRegistryVersionMeta(db, fromId)) {
        return { ok: false, code: "cae-registry-version-not-found", message: `Unknown fromVersionId '${fromId}'` };
      }
      if (getCaeRegistryVersionMeta(db, toId)) {
        return { ok: false, code: "invalid-args", message: `toVersionId '${toId}' already exists` };
      }
      const note = typeof args.note === "string" ? args.note : null;
      const setActive = args.setActive === true;
      const run = db.transaction(() => {
        insertCaeRegistryVersion(db, { versionId: toId, createdBy: actor, note, setActive });
        copyCaeRegistryVersionContents(db, fromId, toId);
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: toId,
          note,
          payload: { fromVersionId: fromId, setActive }
        });
      });
      run();
      const check = setActive
        ? postMutationRegistryCheck(db, workspacePath, true)
        : postMutationRegistryCheckIfActive(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-clone-registry-version-ok",
        data: { schemaVersion: 1, fromVersionId: fromId, toVersionId: toId, setActive }
      };
    }

    if (name === "cae-activate-registry-version") {
      const vid = typeof args.versionId === "string" ? args.versionId.trim() : "";
      if (!vid) {
        return { ok: false, code: "invalid-args", message: "versionId is required" };
      }
      const meta = getCaeRegistryVersionMeta(db, vid);
      if (!meta) {
        return { ok: false, code: "cae-registry-version-not-found", message: `Unknown versionId '${vid}'` };
      }
      const run = db.transaction(() => {
        db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
        db.prepare(`UPDATE cae_registry_versions SET is_active = 1 WHERE version_id = ?`).run(vid);
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: vid,
          note: typeof args.note === "string" ? args.note : null,
          payload: {}
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return { ok: true, code: "cae-activate-registry-version-ok", data: { schemaVersion: 1, versionId: vid } };
    }

    if (name === "cae-activate-registry-checkpoint") {
      const rawId = args.checkpointId;
      const cid =
        typeof rawId === "number" && Number.isInteger(rawId)
          ? rawId
          : typeof rawId === "string"
            ? parseInt(rawId.trim(), 10)
            : NaN;
      if (!Number.isFinite(cid) || cid <= 0) {
        return { ok: false, code: "invalid-args", message: "checkpointId must be a positive integer" };
      }
      const cp = getCaeRegistryCheckpointById(db, cid);
      if (!cp) {
        return {
          ok: false,
          code: "cae-registry-checkpoint-not-found",
          message: `Unknown checkpoint id ${cid}`
        };
      }
      const vid = String(cp.version_id || "").trim();
      if (!vid.length || !getCaeRegistryVersionMeta(db, vid)) {
        return {
          ok: false,
          code: "cae-registry-version-not-found",
          message: `Checkpoint ${cid} references a missing registry version`
        };
      }
      const verifyDigest = args.verifyCheckpointDigest !== false;
      if (verifyDigest) {
        const loaded = loadCaeRegistryFromSqliteDb(db, workspacePath, {
          verifyArtifactPaths: false,
          versionId: vid
        });
        if (!loaded.ok) {
          return { ok: false, code: loaded.code, message: loaded.message };
        }
        if (loaded.value.registryDigest !== cp.registry_digest) {
          return {
            ok: false,
            code: "cae-checkpoint-digest-mismatch",
            message:
              "Registry content for the checkpoint version no longer matches the recorded checkpoint digest (pass verifyCheckpointDigest:false to activate without this guard)"
          };
        }
      }
      const run = db.transaction(() => {
        db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
        db.prepare(`UPDATE cae_registry_versions SET is_active = 1 WHERE version_id = ?`).run(vid);
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: vid,
          note: typeof args.note === "string" ? args.note : null,
          payload: {
            checkpointId: cid,
            checkpointLabel: cp.label,
            verifyCheckpointDigest: verifyDigest
          }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-activate-registry-checkpoint-ok",
        data: { schemaVersion: 1, versionId: vid, checkpointId: cid }
      };
    }

    if (name === "cae-delete-registry-version") {
      const vid = typeof args.versionId === "string" ? args.versionId.trim() : "";
      if (!vid) {
        return { ok: false, code: "invalid-args", message: "versionId is required" };
      }
      const okDel = deleteInactiveCaeRegistryVersion(db, vid);
      if (!okDel) {
        return {
          ok: false,
          code: "cae-registry-version-delete-rejected",
          message: "Version is active or does not exist (activate another version before delete)"
        };
      }
      insertCaeRegistryMutationAudit(db, {
        actor,
        commandName: name,
        versionId: vid,
        note: typeof args.note === "string" ? args.note : null,
        payload: {}
      });
      return { ok: true, code: "cae-delete-registry-version-ok", data: { schemaVersion: 1, versionId: vid } };
    }

    if (name === "cae-rollback-registry-version") {
      const rowsAsc = [...listCaeRegistryVersionsWithCounts(db)].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      const activeIdx = rowsAsc.findIndex((r) => r.is_active === 1);
      if (activeIdx < 0) {
        return { ok: false, code: "cae-registry-sqlite-no-active-version", message: "No active registry version" };
      }
      if (activeIdx === 0) {
        return {
          ok: false,
          code: "cae-rollback-impossible",
          message: "No older registry version exists to roll back to"
        };
      }
      const prev = rowsAsc[activeIdx - 1];
      const run = db.transaction(() => {
        db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
        db.prepare(`UPDATE cae_registry_versions SET is_active = 1 WHERE version_id = ?`).run(prev.version_id);
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: prev.version_id,
          note: typeof args.note === "string" ? args.note : null,
          payload: { previousActive: rowsAsc[activeIdx].version_id }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-rollback-registry-version-ok",
        data: { schemaVersion: 1, activatedVersionId: prev.version_id }
      };
    }

    if (name === "cae-create-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const validated = validateSingleCaeArtifactRecord(args.artifact);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const art = validated.value;
      const artifactId = String(art.artifactId ?? "");
      const pathProbe = verifyCaeArtifactRefPathsExist(workspacePath, [art]);
      if (pathProbe && pathProbe.ok === false) return pathProbe;
      const ref = art.ref as { path?: string; fragment?: string };
      const meta: Record<string, unknown> = {};
      if (Array.isArray(art.tags)) meta.tags = art.tags;
      if (typeof ref?.fragment === "string") meta.fragment = ref.fragment;
      const run = db.transaction(() => {
        insertCaeRegistryArtifactRow(db, {
          versionId: v,
          artifactId,
          artifactType: String(art.artifactType),
          path: String(ref?.path ?? ""),
          title: typeof art.title === "string" ? art.title : null,
          description: typeof art.description === "string" ? art.description : null,
          metadataJson: JSON.stringify(meta)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId }
        });
      });
      try {
        run();
      } catch {
        return {
          ok: false,
          code: "cae-artifact-exists",
          message: `artifactId '${artifactId}' already exists for this version`
        };
      }
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return { ok: true, code: "cae-create-artifact-ok", data: { schemaVersion: 1, versionId: v, artifactId } };
    }

    if (name === "cae-create-workspace-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;

      const rawArtifactId = typeof args.artifactId === "string" ? args.artifactId : "";
      const validArtifactId = validateCaeWorkspaceArtifactId(rawArtifactId);
      if (!validArtifactId.ok) {
        return { ok: false, code: validArtifactId.code, message: validArtifactId.message };
      }

      const artifactType = readOptionalString(args.artifactType)?.trim() ?? "";
      const title = readOptionalString(args.title)?.trim() ?? "";
      if (!title) {
        return { ok: false, code: "invalid-args", message: "title is required" };
      }

      const rawSlug = readOptionalString(args.slug)?.trim() ?? workspaceArtifactDefaultSlug(validArtifactId.value);
      const builtPath = buildCaeWorkspaceArtifactPath(artifactType, rawSlug);
      if (!builtPath.ok) {
        return { ok: false, code: builtPath.code, message: builtPath.message };
      }

      const contentMarkdown = readOptionalString(args.contentMarkdown);
      if (args.contentMarkdown !== undefined && contentMarkdown === null) {
        return { ok: false, code: "invalid-args", message: "contentMarkdown must be a string when provided" };
      }

      const fragment = readOptionalString(args.fragment)?.trim() ?? null;
      if (args.fragment !== undefined && fragment === null) {
        return { ok: false, code: "invalid-args", message: "fragment must be a string when provided" };
      }

      let tags: string[] | undefined;
      if (args.tags !== undefined) {
        if (!Array.isArray(args.tags) || args.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
          return { ok: false, code: "invalid-args", message: "tags must be an array of non-empty strings when provided" };
        }
        tags = args.tags.map((tag) => tag.trim());
      }

      const artifact = {
        schemaVersion: 1,
        artifactId: validArtifactId.value,
        artifactType,
        ref: fragment ? { path: builtPath.value.path, fragment } : { path: builtPath.value.path },
        title,
        ...(tags ? { tags } : {})
      };
      const validated = validateSingleCaeArtifactRecord(artifact);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };

      const absoluteDirectory = path.join(workspacePath, builtPath.value.directory);
      const absolutePath = path.join(workspacePath, builtPath.value.path);
      const markdown = workspaceArtifactMarkdown(title, contentMarkdown);

      try {
        mkdirSync(absoluteDirectory, { recursive: true });
        writeFileSync(absolutePath, markdown, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return {
            ok: false,
            code: "cae-workspace-artifact-file-exists",
            message: `Workspace artifact file already exists at '${builtPath.value.path}'`
          };
        }
        throw error;
      }

      const pathProbe = verifyCaeArtifactRefPathsExist(workspacePath, [validated.value]);
      if (pathProbe && pathProbe.ok === false) {
        rmSync(absolutePath, { force: true });
        return pathProbe;
      }

      const ref = validated.value.ref as { path?: string; fragment?: string };
      const meta: Record<string, unknown> = {};
      if (Array.isArray(validated.value.tags)) meta.tags = validated.value.tags;
      if (typeof ref?.fragment === "string") meta.fragment = ref.fragment;

      let registryFailure: ModuleCommandResult | null = null;
      const run = db.transaction(() => {
        insertCaeRegistryArtifactRow(db, {
          versionId: v,
          artifactId: validArtifactId.value,
          artifactType: String(validated.value.artifactType),
          path: String(ref?.path ?? ""),
          title: typeof validated.value.title === "string" ? validated.value.title : null,
          description: typeof validated.value.description === "string" ? validated.value.description : null,
          metadataJson: JSON.stringify(meta)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId: validArtifactId.value, path: builtPath.value.path }
        });
        registryFailure = postMutationRegistryCheck(db, workspacePath, true);
        if (registryFailure) {
          throw new Error("cae-workspace-artifact-registry-check-failed");
        }
      });

      try {
        run();
      } catch {
        rmSync(absolutePath, { force: true });
        if (registryFailure) return registryFailure;
        return {
          ok: false,
          code: "cae-artifact-exists",
          message: `artifactId '${validArtifactId.value}' already exists for this version`
        };
      }

      return {
        ok: true,
        code: "cae-create-workspace-artifact-ok",
        data: { schemaVersion: 1, versionId: v, artifactId: validArtifactId.value, path: builtPath.value.path }
      };
    }

    if (name === "cae-duplicate-default-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;

      const sourceArtifactId = typeof args.sourceArtifactId === "string" ? args.sourceArtifactId.trim() : "";
      if (!sourceArtifactId) {
        return { ok: false, code: "invalid-args", message: "sourceArtifactId is required" };
      }
      if (classifyCaeArtifactIdNamespace(sourceArtifactId) !== "default") {
        return {
          ok: false,
          code: "cae-default-artifact-id-invalid",
          message: "Source artifact must be a default-owned CAE artifact id starting with 'cae.'"
        };
      }

      const rawArtifactId = typeof args.artifactId === "string" ? args.artifactId : "";
      const validArtifactId = validateCaeWorkspaceArtifactId(rawArtifactId);
      if (!validArtifactId.ok) {
        return { ok: false, code: validArtifactId.code, message: validArtifactId.message };
      }

      const source = db
        .prepare(
          `SELECT artifact_type, path, title, description, metadata_json, retired_at
           FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
        )
        .get(v, sourceArtifactId) as
        | {
            artifact_type: string;
            path: string;
            title: string | null;
            description: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!source || source.retired_at) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown or retired artifactId '${sourceArtifactId}' for version`
        };
      }

      const sourceAbsolutePath = path.join(workspacePath, source.path);
      let sourceMarkdown: string;
      try {
        sourceMarkdown = readFileSync(sourceAbsolutePath, "utf8");
      } catch {
        return {
          ok: false,
          code: "cae-artifact-path-missing",
          message: `Artifact ref.path does not exist: ${source.path}`
        };
      }

      let sourceMeta: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(source.metadata_json || "{}") as unknown;
        sourceMeta = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        sourceMeta = {};
      }

      const title = readOptionalNonEmptyString(args.title) ?? source.title ?? validArtifactId.value;
      const rawSlug = readOptionalNonEmptyString(args.slug) ?? workspaceArtifactDefaultSlug(validArtifactId.value);
      const builtPath = buildCaeWorkspaceArtifactPath(source.artifact_type, rawSlug);
      if (!builtPath.ok) {
        return { ok: false, code: builtPath.code, message: builtPath.message };
      }

      let tags: string[] | undefined;
      if (args.tags !== undefined) {
        if (!Array.isArray(args.tags) || args.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
          return { ok: false, code: "invalid-args", message: "tags must be an array of non-empty strings when provided" };
        }
        tags = args.tags.map((tag) => tag.trim());
      } else if (Array.isArray(sourceMeta.tags) && sourceMeta.tags.every((tag) => typeof tag === "string")) {
        tags = (sourceMeta.tags as string[]).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      }

      const fragment =
        readOptionalNonEmptyString(args.fragment) ??
        (typeof sourceMeta.fragment === "string" ? readOptionalNonEmptyString(sourceMeta.fragment) : null);

      const artifact = {
        schemaVersion: 1,
        artifactId: validArtifactId.value,
        artifactType: source.artifact_type,
        ref: fragment ? { path: builtPath.value.path, fragment } : { path: builtPath.value.path },
        title,
        ...(tags ? { tags } : {})
      };
      const validated = validateSingleCaeArtifactRecord(artifact);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };

      const absoluteDirectory = path.join(workspacePath, builtPath.value.directory);
      const absolutePath = path.join(workspacePath, builtPath.value.path);
      try {
        mkdirSync(absoluteDirectory, { recursive: true });
        writeFileSync(absolutePath, sourceMarkdown, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return {
            ok: false,
            code: "cae-workspace-artifact-file-exists",
            message: `Workspace artifact file already exists at '${builtPath.value.path}'`
          };
        }
        throw error;
      }

      const pathProbe = verifyCaeArtifactRefPathsExist(workspacePath, [validated.value]);
      if (pathProbe && pathProbe.ok === false) {
        rmSync(absolutePath, { force: true });
        return pathProbe;
      }

      const ref = validated.value.ref as { path?: string; fragment?: string };
      const meta: Record<string, unknown> = {
        sourceArtifactId,
        sourceContentHash: createHash("sha256").update(sourceMarkdown).digest("hex"),
        slug: builtPath.value.slug
      };
      if (Array.isArray(validated.value.tags)) meta.tags = validated.value.tags;
      if (typeof ref?.fragment === "string") meta.fragment = ref.fragment;

      let registryFailure: ModuleCommandResult | null = null;
      const run = db.transaction(() => {
        insertCaeRegistryArtifactRow(db, {
          versionId: v,
          artifactId: validArtifactId.value,
          artifactType: String(validated.value.artifactType),
          path: String(ref?.path ?? ""),
          title: typeof validated.value.title === "string" ? validated.value.title : null,
          description: source.description,
          metadataJson: JSON.stringify(meta)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: {
            artifactId: validArtifactId.value,
            path: builtPath.value.path,
            sourceArtifactId,
            sourceContentHash: meta.sourceContentHash
          }
        });
        registryFailure = postMutationRegistryCheck(db, workspacePath, true);
        if (registryFailure) {
          throw new Error("cae-duplicate-default-artifact-registry-check-failed");
        }
      });

      try {
        run();
      } catch {
        rmSync(absolutePath, { force: true });
        if (registryFailure) return registryFailure;
        return {
          ok: false,
          code: "cae-artifact-exists",
          message: `artifactId '${validArtifactId.value}' already exists for this version`
        };
      }

      return {
        ok: true,
        code: "cae-duplicate-default-artifact-ok",
        data: {
          schemaVersion: 1,
          versionId: v,
          artifactId: validArtifactId.value,
          path: builtPath.value.path,
          sourceArtifactId,
          sourceContentHash: meta.sourceContentHash
        }
      };
    }

    if (name === "cae-update-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      const cur = db
        .prepare(
          `SELECT artifact_id, artifact_type, path, title, description, metadata_json, retired_at FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
        )
        .get(v, artifactId) as
        | {
            artifact_type: string;
            path: string;
            title: string | null;
            description: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!cur || cur.retired_at) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown or retired artifactId '${artifactId}' for version`
        };
      }
      let metaObj: Record<string, unknown> = {};
      try {
        const p = JSON.parse(cur.metadata_json || "{}") as unknown;
        metaObj = p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
      } catch {
        metaObj = {};
      }
      const patchArt =
        args.artifact && typeof args.artifact === "object" && !Array.isArray(args.artifact)
          ? (args.artifact as Record<string, unknown>)
          : {};
      const nextType =
        typeof patchArt.artifactType === "string"
          ? patchArt.artifactType
          : typeof args.artifactType === "string"
            ? args.artifactType
            : cur.artifact_type;
      const nextPath =
        patchArt.ref && typeof patchArt.ref === "object" && patchArt.ref !== null && "path" in patchArt.ref
          ? String((patchArt.ref as { path?: string }).path ?? "")
          : typeof args.path === "string"
            ? args.path
            : cur.path;
      const nextTitle =
        typeof patchArt.title === "string" ? patchArt.title : cur.title ?? undefined;
      const nextDesc =
        typeof patchArt.description === "string"
          ? patchArt.description
          : cur.description ?? undefined;
      if (Array.isArray(patchArt.tags)) {
        metaObj.tags = patchArt.tags;
      }
      const fragFromPatch =
        patchArt.ref && typeof patchArt.ref === "object" && patchArt.ref !== null && "fragment" in patchArt.ref
          ? (patchArt.ref as { fragment?: string }).fragment
          : undefined;
      if (typeof fragFromPatch === "string") {
        metaObj.fragment = fragFromPatch;
      } else if (fragFromPatch === null) {
        delete metaObj.fragment;
      }
      const merged: CaeRegistryArtifactRow = {
        schemaVersion: 1,
        artifactId,
        artifactType: nextType,
        ref: { path: nextPath },
        ...(typeof nextTitle === "string" ? { title: nextTitle } : {}),
        ...(typeof nextDesc === "string" ? { description: nextDesc } : {}),
        ...(Array.isArray(metaObj.tags) ? { tags: metaObj.tags as unknown[] } : {})
      };
      if (typeof metaObj.fragment === "string") {
        (merged.ref as Record<string, unknown>).fragment = metaObj.fragment;
      }
      const validated = validateSingleCaeArtifactRecord(merged);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const pathProbe = verifyCaeArtifactRefPathsExist(workspacePath, [validated.value]);
      if (pathProbe && pathProbe.ok === false) return pathProbe;
      const ref = validated.value.ref as { path?: string; fragment?: string };
      const metaOut: Record<string, unknown> = {};
      if (Array.isArray(validated.value.tags)) metaOut.tags = validated.value.tags;
      if (typeof ref?.fragment === "string") metaOut.fragment = ref.fragment;
      const run = db.transaction(() => {
        updateCaeRegistryArtifactFields(db, v, artifactId, {
          artifactType: String(validated.value.artifactType),
          path: String(ref?.path ?? ""),
          title: typeof validated.value.title === "string" ? validated.value.title : null,
          description: typeof validated.value.description === "string" ? validated.value.description : null,
          metadataJson: JSON.stringify(metaOut)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return { ok: true, code: "cae-update-artifact-ok", data: { schemaVersion: 1, versionId: v, artifactId } };
    }

    if (name === "cae-update-workspace-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;

      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      if (classifyCaeArtifactIdNamespace(artifactId) !== "workspace") {
        return {
          ok: false,
          code: "cae-workspace-artifact-id-invalid",
          message: "Workspace artifact ids must start with 'workspace.' and follow the CAE registry id pattern"
        };
      }

      const cur = db
        .prepare(
          `SELECT artifact_id, artifact_type, path, title, description, metadata_json, retired_at
           FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
        )
        .get(v, artifactId) as
        | {
            artifact_type: string;
            path: string;
            title: string | null;
            description: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!cur || cur.retired_at) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown or retired artifactId '${artifactId}' for version`
        };
      }

      let metaObj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(cur.metadata_json || "{}") as unknown;
        metaObj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        metaObj = {};
      }

      const patchArt =
        args.artifact && typeof args.artifact === "object" && !Array.isArray(args.artifact)
          ? (args.artifact as Record<string, unknown>)
          : {};

      const nextType =
        typeof patchArt.artifactType === "string"
          ? patchArt.artifactType.trim()
          : typeof args.artifactType === "string"
            ? args.artifactType.trim()
            : cur.artifact_type;
      const nextTitle =
        typeof patchArt.title === "string"
          ? patchArt.title
          : typeof args.title === "string"
            ? args.title
            : cur.title ?? undefined;

      const rawSlug =
        readOptionalNonEmptyString(args.slug) ??
        (typeof metaObj.slug === "string" ? readOptionalNonEmptyString(metaObj.slug) : null) ??
        path.basename(cur.path, path.extname(cur.path));
      const builtPath = buildCaeWorkspaceArtifactPath(nextType, rawSlug);
      if (!builtPath.ok) {
        return { ok: false, code: builtPath.code, message: builtPath.message };
      }

      const contentMarkdown = readOptionalString(args.contentMarkdown);
      if (args.contentMarkdown !== undefined && contentMarkdown === null) {
        return { ok: false, code: "invalid-args", message: "contentMarkdown must be a string when provided" };
      }

      const tagsInput = patchArt.tags ?? args.tags;
      if (tagsInput !== undefined) {
        if (!Array.isArray(tagsInput) || tagsInput.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
          return { ok: false, code: "invalid-args", message: "tags must be an array of non-empty strings when provided" };
        }
        metaObj.tags = tagsInput.map((tag) => String(tag).trim());
      }

      const fragmentInput =
        patchArt.ref && typeof patchArt.ref === "object" && patchArt.ref !== null && "fragment" in patchArt.ref
          ? (patchArt.ref as { fragment?: string | null }).fragment
          : args.fragment;
      if (typeof fragmentInput === "string") {
        metaObj.fragment = fragmentInput.trim();
      } else if (fragmentInput === null) {
        delete metaObj.fragment;
      }
      metaObj.slug = builtPath.value.slug;

      const merged: CaeRegistryArtifactRow = {
        schemaVersion: 1,
        artifactId,
        artifactType: nextType,
        ref: { path: builtPath.value.path },
        ...(typeof nextTitle === "string" ? { title: nextTitle } : {}),
        ...(Array.isArray(metaObj.tags) ? { tags: metaObj.tags as unknown[] } : {})
      };
      if (typeof metaObj.fragment === "string" && metaObj.fragment.length > 0) {
        (merged.ref as Record<string, unknown>).fragment = metaObj.fragment;
      }

      const validated = validateSingleCaeArtifactRecord(merged);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };

      const currentAbsolutePath = path.join(workspacePath, cur.path);
      let currentMarkdown: string;
      try {
        currentMarkdown = readFileSync(currentAbsolutePath, "utf8");
      } catch {
        return {
          ok: false,
          code: "cae-workspace-artifact-file-missing",
          message: `Workspace artifact file is missing at '${cur.path}'`
        };
      }

      const nextAbsolutePath = path.join(workspacePath, builtPath.value.path);
      const nextMarkdown = contentMarkdown ?? currentMarkdown;
      const pathChanged = builtPath.value.path !== cur.path;

      try {
        mkdirSync(path.dirname(nextAbsolutePath), { recursive: true });
        if (pathChanged) {
          writeFileSync(nextAbsolutePath, nextMarkdown, { encoding: "utf8", flag: "wx" });
        } else {
          writeFileSync(nextAbsolutePath, nextMarkdown, { encoding: "utf8" });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return {
            ok: false,
            code: "cae-workspace-artifact-file-exists",
            message: `Workspace artifact file already exists at '${builtPath.value.path}'`
          };
        }
        throw error;
      }

      const pathProbe = verifyCaeArtifactRefPathsExist(workspacePath, [validated.value]);
      if (pathProbe && pathProbe.ok === false) {
        if (pathChanged) {
          rmSync(nextAbsolutePath, { force: true });
        } else {
          writeFileSync(currentAbsolutePath, currentMarkdown, { encoding: "utf8" });
        }
        return pathProbe;
      }

      const ref = validated.value.ref as { path?: string; fragment?: string };
      const metaOut: Record<string, unknown> = {};
      if (Array.isArray(validated.value.tags)) metaOut.tags = validated.value.tags;
      if (typeof ref?.fragment === "string") metaOut.fragment = ref.fragment;
      metaOut.slug = builtPath.value.slug;

      const impactedActivationIds = collectArtifactReferencingActivationIds(db, v, artifactId);
      const warnings = impactedActivationIds.length
        ? [
            {
              code: "cae-workspace-artifact-activation-impact",
              message: `Artifact '${artifactId}' is referenced by ${impactedActivationIds.length} activation(s).`
            }
          ]
        : [];

      let registryFailure: ModuleCommandResult | null = null;
      const run = db.transaction(() => {
        updateCaeRegistryArtifactFields(db, v, artifactId, {
          artifactType: String(validated.value.artifactType),
          path: String(ref?.path ?? ""),
          title: typeof validated.value.title === "string" ? validated.value.title : null,
          description: cur.description,
          metadataJson: JSON.stringify(metaOut)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId, path: builtPath.value.path, impactedActivationIds }
        });
        registryFailure = postMutationRegistryCheck(db, workspacePath, true);
        if (registryFailure) {
          throw new Error("cae-workspace-artifact-registry-check-failed");
        }
      });

      try {
        run();
      } catch {
        if (pathChanged) {
          rmSync(nextAbsolutePath, { force: true });
        }
        writeFileSync(currentAbsolutePath, currentMarkdown, { encoding: "utf8" });
        if (registryFailure) return registryFailure;
        throw new Error("cae-workspace-artifact-update-failed");
      }

      if (pathChanged) {
        rmSync(currentAbsolutePath, { force: true });
      }

      return {
        ok: true,
        code: "cae-update-workspace-artifact-ok",
        data: {
          schemaVersion: 1,
          versionId: v,
          artifactId,
          path: builtPath.value.path,
          impactedActivationIds,
          warnings
        }
      };
    }

    if (name === "cae-archive-retired-workspace-artifact-file") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      if (classifyCaeArtifactIdNamespace(artifactId) !== "workspace") {
        return {
          ok: false,
          code: "cae-workspace-artifact-id-invalid",
          message: "Workspace artifact ids must start with 'workspace.' and follow the CAE registry id pattern"
        };
      }

      const cur = db
        .prepare(
          `SELECT artifact_id, artifact_type, path, title, description, metadata_json, retired_at
           FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
        )
        .get(v, artifactId) as
        | {
            artifact_type: string;
            path: string;
            title: string | null;
            description: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!cur) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown artifactId '${artifactId}' for version`
        };
      }
      if (!cur.retired_at) {
        return {
          ok: false,
          code: "cae-archive-requires-retired-artifact",
          message: "archive is allowed only after cae-retire-workspace-artifact (row must be retired)"
        };
      }
      const rel = cur.path.trim();
      if (!rel.startsWith(`${CAE_WORKSPACE_ARTIFACT_ROOT}/`) || rel.includes("/_archive/")) {
        return {
          ok: false,
          code: "cae-archive-invalid-source-path",
          message: "Artifact path must be under workspace CAE artifacts and not already archived"
        };
      }
      const fromAbs = path.join(workspacePath, rel);
      if (!existsSync(fromAbs)) {
        return {
          ok: false,
          code: "cae-workspace-artifact-file-missing",
          message: `Workspace artifact file is missing at '${rel}'`
        };
      }

      const slug = workspaceSlugFromArtifactRow(rel, cur.metadata_json, artifactId);
      const archiveBase = buildCaeWorkspaceArtifactArchiveRelativePath(cur.artifact_type, slug);
      if (!archiveBase.ok) {
        return { ok: false, code: archiveBase.code, message: archiveBase.message };
      }
      const archiveRel = allocateUniqueRelativeMarkdownPath(workspacePath, archiveBase.value);
      const toAbs = path.join(workspacePath, archiveRel);
      mkdirSync(path.dirname(toAbs), { recursive: true });
      renameSync(fromAbs, toAbs);

      let metaObj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(cur.metadata_json || "{}") as unknown;
        metaObj =
          parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        metaObj = {};
      }
      metaObj.archivedAt = new Date().toISOString();
      metaObj.previousPath = rel;
      metaObj.slug = slug;

      let registryFailure: ModuleCommandResult | null = null;
      const run = db.transaction(() => {
        updateCaeRegistryArtifactFields(db, v, artifactId, {
          path: archiveRel,
          metadataJson: JSON.stringify(metaObj)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId, fromPath: rel, toPath: archiveRel }
        });
        registryFailure = postMutationRegistryCheck(db, workspacePath, true);
        if (registryFailure) {
          throw new Error("cae-archive-registry-check-failed");
        }
      });
      try {
        run();
      } catch {
        renameSync(toAbs, fromAbs);
        if (registryFailure) return registryFailure;
        throw new Error("cae-archive-workspace-artifact-file-failed");
      }

      return {
        ok: true,
        code: "cae-archive-retired-workspace-artifact-file-ok",
        data: { schemaVersion: 1, versionId: v, artifactId, path: archiveRel }
      };
    }

    if (name === "cae-hard-delete-retired-workspace-artifact-file") {
      if (args.confirmAdvancedHardDelete !== true) {
        return {
          ok: false,
          code: "cae-hard-delete-confirmation-required",
          message:
            "confirmAdvancedHardDelete must be true (this permanently removes backing markdown; a tombstone stub is written)"
        };
      }
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      if (classifyCaeArtifactIdNamespace(artifactId) !== "workspace") {
        return {
          ok: false,
          code: "cae-workspace-artifact-id-invalid",
          message: "Workspace artifact ids must start with 'workspace.' and follow the CAE registry id pattern"
        };
      }

      const cur = db
        .prepare(
          `SELECT artifact_id, artifact_type, path, title, description, metadata_json, retired_at
           FROM cae_registry_artifacts WHERE version_id = ? AND artifact_id = ?`
        )
        .get(v, artifactId) as
        | {
            artifact_type: string;
            path: string;
            title: string | null;
            description: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!cur) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown artifactId '${artifactId}' for version`
        };
      }
      if (!cur.retired_at) {
        return {
          ok: false,
          code: "cae-hard-delete-requires-retired-artifact",
          message: "Hard delete is allowed only for retired workspace artifact rows"
        };
      }
      const rel = cur.path.trim();
      if (!rel.startsWith(`${CAE_WORKSPACE_ARTIFACT_ROOT}/`)) {
        return {
          ok: false,
          code: "cae-hard-delete-invalid-source-path",
          message: "Artifact path must be under workspace CAE artifacts"
        };
      }
      if (rel.includes("/_tombstones/")) {
        return {
          ok: false,
          code: "cae-hard-delete-already-applied",
          message: "This artifact path is already a tombstone stub from a prior hard delete"
        };
      }

      let metaObj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(cur.metadata_json || "{}") as unknown;
        metaObj =
          parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        metaObj = {};
      }

      const fromAbs = path.join(workspacePath, rel);
      let previousContent: string | null = null;
      if (existsSync(fromAbs)) {
        previousContent = readFileSync(fromAbs, "utf8");
        unlinkSync(fromAbs);
      }

      const tombRel = allocateUniqueRelativeMarkdownPath(
        workspacePath,
        buildCaeWorkspaceArtifactHardDeleteTombstoneRelativePath(artifactId)
      );
      const tombAbs = path.join(workspacePath, tombRel);
      mkdirSync(path.dirname(tombAbs), { recursive: true });
      const stamp = new Date().toISOString();
      const tombBody = `# Hard-deleted workspace artifact

artifactId: \`${artifactId}\`
hardDeletedAt: \`${stamp}\`
previousPath: \`${rel}\`

This file replaces the removed markdown so registry validation keeps a repo-relative path.
`;
      writeFileSync(tombAbs, tombBody, { encoding: "utf8" });

      metaObj.hardDeletedAt = stamp;
      metaObj.previousPath = rel;
      const slug = workspaceSlugFromArtifactRow(rel, cur.metadata_json, artifactId);
      metaObj.slug = slug;

      let registryFailure: ModuleCommandResult | null = null;
      const run = db.transaction(() => {
        updateCaeRegistryArtifactFields(db, v, artifactId, {
          path: tombRel,
          metadataJson: JSON.stringify(metaObj)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { artifactId, previousPath: rel, tombstonePath: tombRel }
        });
        registryFailure = postMutationRegistryCheck(db, workspacePath, true);
        if (registryFailure) {
          throw new Error("cae-hard-delete-registry-check-failed");
        }
      });

      try {
        run();
      } catch {
        rmSync(tombAbs, { force: true });
        if (previousContent !== null) {
          mkdirSync(path.dirname(fromAbs), { recursive: true });
          writeFileSync(fromAbs, previousContent, { encoding: "utf8" });
        }
        if (registryFailure) return registryFailure;
        throw new Error("cae-hard-delete-workspace-artifact-file-failed");
      }

      return {
        ok: true,
        code: "cae-hard-delete-retired-workspace-artifact-file-ok",
        data: { schemaVersion: 1, versionId: v, artifactId, path: tombRel }
      };
    }

    if (name === "cae-retire-artifact" || name === "cae-retire-workspace-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      if (name === "cae-retire-workspace-artifact" && classifyCaeArtifactIdNamespace(artifactId) !== "workspace") {
        return {
          ok: false,
          code: "cae-workspace-artifact-id-invalid",
          message: "Workspace artifact ids must start with 'workspace.' and follow the CAE registry id pattern"
        };
      }
      const refs = db
        .prepare(
          `SELECT activation_id, artifact_refs_json FROM cae_registry_activations WHERE version_id = ? AND retired_at IS NULL`
        )
        .all(v) as { activation_id: string; artifact_refs_json: string }[];
      for (const r of refs) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(r.artifact_refs_json) as unknown;
        } catch {
          continue;
        }
        if (!Array.isArray(parsed)) continue;
        for (const ent of parsed) {
          if (ent && typeof ent === "object" && (ent as { artifactId?: string }).artifactId === artifactId) {
            return {
              ok: false,
              code: "cae-artifact-in-use",
              message: `artifactId '${artifactId}' is referenced by activation '${r.activation_id}'`
            };
          }
        }
      }
      const okRet = retireCaeRegistryArtifact(db, v, artifactId);
      if (!okRet) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown or already retired artifactId '${artifactId}'`
        };
      }
      insertCaeRegistryMutationAudit(db, {
        actor,
        commandName: name,
        versionId: v,
        note: typeof args.note === "string" ? args.note : null,
        payload: { artifactId }
      });
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: name === "cae-retire-workspace-artifact" ? "cae-retire-workspace-artifact-ok" : "cae-retire-artifact-ok",
        data: { schemaVersion: 1, versionId: v, artifactId }
      };
    }

    if (name === "cae-create-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const validated = validateSingleCaeActivationRecord(args.activation);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const act = validated.value;
      const activationId = String(act.activationId ?? "");
      const refErr = assertActivationRefsExist(db, v, act);
      if (refErr) return refErr;
      const run = db.transaction(() => {
        insertCaeRegistryActivationRow(db, {
          versionId: v,
          activationId,
          family: String(act.family),
          priority: Number(act.priority) || 0,
          lifecycleState: String(act.lifecycleState),
          scopeJson: JSON.stringify(act.scope ?? {}),
          artifactRefsJson: JSON.stringify(act.artifactRefs ?? []),
          acknowledgementJson: act.acknowledgement ? JSON.stringify(act.acknowledgement) : null,
          metadataJson: act.flags ? JSON.stringify({ flags: act.flags }) : "{}"
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { activationId }
        });
      });
      try {
        run();
      } catch {
        return {
          ok: false,
          code: "cae-activation-exists",
          message: `activationId '${activationId}' already exists for this version`
        };
      }
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return { ok: true, code: "cae-create-activation-ok", data: { schemaVersion: 1, versionId: v, activationId } };
    }

    if (name === "cae-create-draft-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const input =
        args.activation && typeof args.activation === "object" && !Array.isArray(args.activation)
          ? { ...(args.activation as Record<string, unknown>) }
          : null;
      if (!input) {
        return { ok: false, code: "invalid-args", message: "activation is required" };
      }
      if (input.lifecycleState !== undefined && input.lifecycleState !== "draft") {
        return { ok: false, code: "invalid-args", message: "Draft activation commands only accept lifecycleState 'draft'" };
      }
      input.lifecycleState = "draft";
      const validated = validateSingleCaeActivationRecord(input);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const act = validated.value;
      const activationId = String(act.activationId ?? "");
      const refErr = assertActivationRefsExist(db, v, act);
      if (refErr) return refErr;
      const warnings = collectDraftActivationWarnings(act);
      const run = db.transaction(() => {
        insertCaeRegistryActivationRow(db, {
          versionId: v,
          activationId,
          family: String(act.family),
          priority: Number(act.priority) || 0,
          lifecycleState: "draft",
          scopeJson: JSON.stringify(act.scope ?? {}),
          artifactRefsJson: JSON.stringify(act.artifactRefs ?? []),
          acknowledgementJson: act.acknowledgement ? JSON.stringify(act.acknowledgement) : null,
          metadataJson: act.flags ? JSON.stringify({ flags: act.flags }) : "{}"
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { activationId }
        });
      });
      try {
        run();
      } catch {
        return {
          ok: false,
          code: "cae-activation-exists",
          message: `activationId '${activationId}' already exists for this version`
        };
      }
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-create-draft-activation-ok",
        data: { schemaVersion: 1, versionId: v, activationId, warnings }
      };
    }

    if (name === "cae-update-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const actRow = db
        .prepare(
          `SELECT activation_id, family, priority, lifecycle_state, scope_json, artifact_refs_json, acknowledgement_json, metadata_json, retired_at
           FROM cae_registry_activations WHERE version_id = ? AND activation_id = ?`
        )
        .get(v, activationId) as
        | {
            family: string;
            priority: number;
            lifecycle_state: string;
            scope_json: string;
            artifact_refs_json: string;
            acknowledgement_json: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!actRow || actRow.retired_at) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or retired activationId '${activationId}'`
        };
      }
      const patch =
        args.activation && typeof args.activation === "object" && !Array.isArray(args.activation)
          ? (args.activation as Record<string, unknown>)
          : {};
      let scope: unknown;
      let refs: unknown;
      let ack: unknown;
      try {
        scope = patch.scope !== undefined ? patch.scope : JSON.parse(actRow.scope_json);
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored scope_json is corrupt" };
      }
      try {
        refs =
          patch.artifactRefs !== undefined ? patch.artifactRefs : JSON.parse(actRow.artifact_refs_json);
      } catch {
        return {
          ok: false,
          code: "cae-registry-sqlite-invalid-json",
          message: "stored artifact_refs_json is corrupt"
        };
      }
      try {
        ack =
          patch.acknowledgement !== undefined
            ? patch.acknowledgement
            : actRow.acknowledgement_json
              ? JSON.parse(actRow.acknowledgement_json)
              : undefined;
      } catch {
        return {
          ok: false,
          code: "cae-registry-sqlite-invalid-json",
          message: "stored acknowledgement_json is corrupt"
        };
      }
      let flags: Record<string, unknown> | undefined;
      if (patch.flags !== undefined) {
        flags = patch.flags as Record<string, unknown>;
      } else {
        try {
          const m = JSON.parse(actRow.metadata_json || "{}") as Record<string, unknown>;
          if (m.flags && typeof m.flags === "object" && !Array.isArray(m.flags)) {
            flags = m.flags as Record<string, unknown>;
          }
        } catch {
          flags = undefined;
        }
      }
      const merged: CaeRegistryActivationRow = {
        schemaVersion: 1,
        activationId,
        family: typeof patch.family === "string" ? patch.family : actRow.family,
        lifecycleState:
          typeof patch.lifecycleState === "string" ? patch.lifecycleState : actRow.lifecycle_state,
        priority:
          typeof patch.priority === "number"
            ? patch.priority
            : typeof patch.priority === "string"
              ? Number(patch.priority)
              : actRow.priority,
        scope,
        artifactRefs: refs,
        acknowledgement: ack as Record<string, unknown> | undefined,
        flags
      };
      const validated = validateSingleCaeActivationRecord(merged);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const refErr = assertActivationRefsExist(db, v, validated.value);
      if (refErr) return refErr;
      const run = db.transaction(() => {
        updateCaeRegistryActivationFields(db, v, activationId, {
          family: String(validated.value.family),
          priority: Number(validated.value.priority) || 0,
          lifecycleState: String(validated.value.lifecycleState),
          scopeJson: JSON.stringify(validated.value.scope ?? {}),
          artifactRefsJson: JSON.stringify(validated.value.artifactRefs ?? []),
          acknowledgementJson: validated.value.acknowledgement
            ? JSON.stringify(validated.value.acknowledgement)
            : null,
          metadataJson: validated.value.flags ? JSON.stringify({ flags: validated.value.flags }) : "{}"
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { activationId }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return { ok: true, code: "cae-update-activation-ok", data: { schemaVersion: 1, versionId: v, activationId } };
    }

    if (name === "cae-update-draft-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const actRow = db
        .prepare(
          `SELECT activation_id, family, priority, lifecycle_state, scope_json, artifact_refs_json, acknowledgement_json, metadata_json, retired_at
           FROM cae_registry_activations WHERE version_id = ? AND activation_id = ?`
        )
        .get(v, activationId) as
        | {
            family: string;
            priority: number;
            lifecycle_state: string;
            scope_json: string;
            artifact_refs_json: string;
            acknowledgement_json: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!actRow || actRow.retired_at) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or retired activationId '${activationId}'`
        };
      }
      if (actRow.lifecycle_state !== "draft") {
        return {
          ok: false,
          code: "cae-activation-not-draft",
          message: `activationId '${activationId}' is not in draft lifecycle state`
        };
      }
      const patch =
        args.activation && typeof args.activation === "object" && !Array.isArray(args.activation)
          ? ({ ...(args.activation as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      if (patch.lifecycleState !== undefined && patch.lifecycleState !== "draft") {
        return { ok: false, code: "invalid-args", message: "Draft activation commands only accept lifecycleState 'draft'" };
      }
      let scope: unknown;
      let refs: unknown;
      let ack: unknown;
      try {
        scope = patch.scope !== undefined ? patch.scope : JSON.parse(actRow.scope_json);
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored scope_json is corrupt" };
      }
      try {
        refs = patch.artifactRefs !== undefined ? patch.artifactRefs : JSON.parse(actRow.artifact_refs_json);
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored artifact_refs_json is corrupt" };
      }
      try {
        ack =
          patch.acknowledgement !== undefined
            ? patch.acknowledgement
            : actRow.acknowledgement_json
              ? JSON.parse(actRow.acknowledgement_json)
              : undefined;
      } catch {
        return {
          ok: false,
          code: "cae-registry-sqlite-invalid-json",
          message: "stored acknowledgement_json is corrupt"
        };
      }
      let flags: Record<string, unknown> | undefined;
      if (patch.flags !== undefined) {
        flags = patch.flags as Record<string, unknown>;
      } else {
        try {
          const m = JSON.parse(actRow.metadata_json || "{}") as Record<string, unknown>;
          if (m.flags && typeof m.flags === "object" && !Array.isArray(m.flags)) {
            flags = m.flags as Record<string, unknown>;
          }
        } catch {
          flags = undefined;
        }
      }
      const merged: CaeRegistryActivationRow = {
        schemaVersion: 1,
        activationId,
        family: typeof patch.family === "string" ? patch.family : actRow.family,
        lifecycleState: "draft",
        priority:
          typeof patch.priority === "number"
            ? patch.priority
            : typeof patch.priority === "string"
              ? Number(patch.priority)
              : actRow.priority,
        scope,
        artifactRefs: refs,
        acknowledgement: ack as Record<string, unknown> | undefined,
        flags
      };
      const validated = validateSingleCaeActivationRecord(merged);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const refErr = assertActivationRefsExist(db, v, validated.value);
      if (refErr) return refErr;
      const warnings = collectDraftActivationWarnings(validated.value);
      const run = db.transaction(() => {
        updateCaeRegistryActivationFields(db, v, activationId, {
          family: String(validated.value.family),
          priority: Number(validated.value.priority) || 0,
          lifecycleState: "draft",
          scopeJson: JSON.stringify(validated.value.scope ?? {}),
          artifactRefsJson: JSON.stringify(validated.value.artifactRefs ?? []),
          acknowledgementJson: validated.value.acknowledgement
            ? JSON.stringify(validated.value.acknowledgement)
            : null,
          metadataJson: validated.value.flags ? JSON.stringify({ flags: validated.value.flags }) : "{}"
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { activationId }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-update-draft-activation-ok",
        data: { schemaVersion: 1, versionId: v, activationId, warnings }
      };
    }

    if (name === "cae-activate-draft-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const actRow = db
        .prepare(
          `SELECT activation_id, family, priority, lifecycle_state, scope_json, artifact_refs_json, acknowledgement_json, metadata_json, retired_at
           FROM cae_registry_activations WHERE version_id = ? AND activation_id = ?`
        )
        .get(v, activationId) as
        | {
            family: string;
            priority: number;
            lifecycle_state: string;
            scope_json: string;
            artifact_refs_json: string;
            acknowledgement_json: string | null;
            metadata_json: string;
            retired_at: string | null;
          }
        | undefined;
      if (!actRow || actRow.retired_at) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or retired activationId '${activationId}'`
        };
      }
      if (actRow.lifecycle_state !== "draft") {
        return {
          ok: false,
          code: "cae-activation-not-draft",
          message: `activationId '${activationId}' is not in draft lifecycle state`
        };
      }

      let scope: unknown;
      let refs: unknown;
      let ack: unknown;
      try {
        scope = JSON.parse(actRow.scope_json);
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored scope_json is corrupt" };
      }
      try {
        refs = JSON.parse(actRow.artifact_refs_json);
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored artifact_refs_json is corrupt" };
      }
      try {
        ack = actRow.acknowledgement_json ? JSON.parse(actRow.acknowledgement_json) : undefined;
      } catch {
        return { ok: false, code: "cae-registry-sqlite-invalid-json", message: "stored acknowledgement_json is corrupt" };
      }

      const storedMetadata = parseActivationMetadata(actRow.metadata_json);
      const flags = storedMetadata.flags && typeof storedMetadata.flags === "object" && !Array.isArray(storedMetadata.flags)
        ? (storedMetadata.flags as Record<string, unknown>)
        : undefined;
      const activeActivation: CaeRegistryActivationRow = {
        schemaVersion: 1,
        activationId,
        family: actRow.family,
        lifecycleState: "active",
        priority: actRow.priority,
        scope,
        artifactRefs: refs,
        acknowledgement: ack as Record<string, unknown> | undefined,
        flags
      };
      const validated = validateSingleCaeActivationRecord(activeActivation);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message };
      const refErr = assertActivationRefsExist(db, v, validated.value);
      if (refErr) return refErr;

      const warnings = collectDraftActivationWarnings({ ...validated.value, lifecycleState: "draft" });
      const requiresPreviewEvidence = warnings.length > 0;
      const previewEvidence = readPreviewEvidence(args.previewEvidence);
      if (!previewEvidence.ok) return { ok: false, code: previewEvidence.code, message: previewEvidence.message };
      if (requiresPreviewEvidence && !previewEvidence.value) {
        return {
          ok: false,
          code: "cae-preview-evidence-required",
          message: "Broad or policy-family draft activations require fresh cae-guidance-preview evidence before activation.",
          data: { schemaVersion: 1, activationId, warnings }
        };
      }
      if (previewEvidence.value?.activationId && previewEvidence.value.activationId !== activationId) {
        return {
          ok: false,
          code: "cae-preview-evidence-activation-mismatch",
          message: `previewEvidence.activationId '${previewEvidence.value.activationId}' does not match activationId '${activationId}'`
        };
      }
      if (requiresPreviewEvidence && !previewEvidence.value?.registryDigest) {
        return {
          ok: false,
          code: "cae-preview-evidence-missing-registry-digest",
          message: "previewEvidence.registryContentHash is required for broad or policy-family draft activation."
        };
      }
      if (previewEvidence.value?.registryDigest) {
        const loaded = loadCaeRegistryFromSqliteDb(db, workspacePath, { verifyArtifactPaths: false });
        if (!loaded.ok) return { ok: false, code: loaded.code, message: loaded.message };
        if (previewEvidence.value.registryDigest !== loaded.value.registryDigest) {
          return staleStateError({
            expectedActiveVersionId: null,
            actualActiveVersionId: getActiveCaeRegistryVersionId(db),
            expectedRegistryDigest: previewEvidence.value.registryDigest,
            actualRegistryDigest: loaded.value.registryDigest
          });
        }
      }

      const activatedAt = new Date().toISOString();
      const publishMetadata = {
        activatedAt,
        actor,
        previewEvidenceRequired: requiresPreviewEvidence,
        previewEvidence: previewEvidence.value
          ? {
              registryDigest: previewEvidence.value.registryDigest,
              traceId: previewEvidence.value.traceId,
              activationReadinessLevel: previewEvidence.value.activationReadinessLevel,
              conflictStatus: previewEvidence.value.conflictStatus
            }
          : null,
        warningCodes: warnings.map((warning) => warning.code)
      };
      const nextMetadata = { ...storedMetadata, publish: publishMetadata };
      const artifactRefs = Array.isArray(validated.value.artifactRefs)
        ? validated.value.artifactRefs.map((ref) => ({ artifactId: String((ref as { artifactId?: unknown }).artifactId ?? "") }))
        : [];
      const run = db.transaction(() => {
        updateCaeRegistryActivationFields(db, v, activationId, {
          family: String(validated.value.family),
          priority: Number(validated.value.priority) || 0,
          lifecycleState: "active",
          scopeJson: JSON.stringify(validated.value.scope ?? {}),
          artifactRefsJson: JSON.stringify(validated.value.artifactRefs ?? []),
          acknowledgementJson: validated.value.acknowledgement ? JSON.stringify(validated.value.acknowledgement) : null,
          metadataJson: JSON.stringify(nextMetadata)
        });
        insertCaeRegistryMutationAudit(db, {
          actor,
          commandName: name,
          versionId: v,
          note: typeof args.note === "string" ? args.note : null,
          payload: { activationId, lifecycleState: "active", requiresPreviewEvidence, previewEvidence: publishMetadata.previewEvidence }
        });
      });
      run();
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-activate-draft-activation-ok",
        data: {
          schemaVersion: 1,
          versionId: v,
          activationId,
          lifecycleState: "active",
          artifactRefs,
          warnings,
          previewEvidenceRequired: requiresPreviewEvidence,
          publish: publishMetadata
        }
      };
    }

    if (name === "cae-disable-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const live = db
        .prepare(
          `SELECT artifact_refs_json FROM cae_registry_activations WHERE version_id = ? AND activation_id = ? AND retired_at IS NULL`
        )
        .get(v, activationId) as { artifact_refs_json: string } | undefined;
      if (!live) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or retired activationId '${activationId}'`
        };
      }
      const artifactRefs = parseActivationArtifactRefs(live.artifact_refs_json);
      const okUp = updateCaeRegistryActivationFields(db, v, activationId, { lifecycleState: "disabled" });
      if (!okUp) {
        return { ok: false, code: "cae-activation-not-found", message: `Unknown activationId '${activationId}'` };
      }
      insertCaeRegistryMutationAudit(db, {
        actor,
        commandName: name,
        versionId: v,
        note: typeof args.note === "string" ? args.note : null,
        payload: { activationId }
      });
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-disable-activation-ok",
        data: { schemaVersion: 1, versionId: v, activationId, lifecycleState: "disabled", artifactRefs }
      };
    }

    if (name === "cae-retire-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const live = db
        .prepare(
          `SELECT artifact_refs_json FROM cae_registry_activations WHERE version_id = ? AND activation_id = ? AND retired_at IS NULL`
        )
        .get(v, activationId) as { artifact_refs_json: string } | undefined;
      const artifactRefs = live ? parseActivationArtifactRefs(live.artifact_refs_json) : [];
      const okRet = retireCaeRegistryActivation(db, v, activationId);
      if (!okRet) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or already retired activationId '${activationId}'`
        };
      }
      insertCaeRegistryMutationAudit(db, {
        actor,
        commandName: name,
        versionId: v,
        note: typeof args.note === "string" ? args.note : null,
        payload: { activationId }
      });
      const check = postMutationRegistryCheck(db, workspacePath, true);
      if (check) return check;
      return {
        ok: true,
        code: "cae-retire-activation-ok",
        data: { schemaVersion: 1, versionId: v, activationId, lifecycleState: "retired", artifactRefs }
      };
    }

    return {
      ok: false,
      code: "internal-error",
      message: `Unhandled CAE registry admin command '${name}'`
    };
  } finally {
    db.close();
  }
}
