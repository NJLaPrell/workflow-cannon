/**
 * CAE SQLite registry admin `wk run` command implementations (CAE_PLAN Epic 4 D1–D3).
 * Policy: `caeRegistryMutationGateError` (Epic 5) — not Tier A `policyApproval`.
 */

import Database from "better-sqlite3";

import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import {
  caeRegistryTablesReady,
  copyCaeRegistryVersionContents,
  deleteInactiveCaeRegistryVersion,
  getActiveCaeRegistryVersionId,
  getCaeRegistryVersionMeta,
  insertCaeRegistryActivationRow,
  insertCaeRegistryArtifactRow,
  insertCaeRegistryMutationAudit,
  insertCaeRegistryVersion,
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
  validateSingleCaeActivationRecord,
  validateSingleCaeArtifactRecord,
  verifyCaeArtifactRefPathsExist,
  type CaeRegistryActivationRow,
  type CaeRegistryArtifactRow
} from "./cae-registry-load.js";

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
    "cae-update-artifact",
    "cae-retire-artifact",
    "cae-create-activation",
    "cae-update-activation",
    "cae-disable-activation",
    "cae-retire-activation",
    "cae-list-registry-versions",
    "cae-get-registry-version",
    "cae-create-registry-version",
    "cae-clone-registry-version",
    "cae-activate-registry-version",
    "cae-delete-registry-version",
    "cae-rollback-registry-version"
  ]);
  if (!adminCommands.has(name)) {
    return undefined;
  }

  const bad = requireSchemaV1(args);
  if (bad) return bad;

  const readOnly = name === "cae-list-registry-versions" || name === "cae-get-registry-version";
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
      const arts = includeRows ? db.prepare(`SELECT * FROM cae_registry_artifacts WHERE version_id = ?`).all(vidRaw) : [];
      const acts = includeRows ? db.prepare(`SELECT * FROM cae_registry_activations WHERE version_id = ?`).all(vidRaw) : [];
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
          ...(includeRows ? { artifactRows: arts, activationRows: acts } : {})
        }
      };
    }

    const actorRes = requireActor(args);
    if (typeof actorRes !== "string") return actorRes;
    const actor = actorRes;

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

    if (name === "cae-retire-artifact") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
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
      return { ok: true, code: "cae-retire-artifact-ok", data: { schemaVersion: 1, versionId: v, artifactId } };
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

    if (name === "cae-disable-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const live = db
        .prepare(
          `SELECT 1 FROM cae_registry_activations WHERE version_id = ? AND activation_id = ? AND retired_at IS NULL`
        )
        .get(v, activationId);
      if (!live) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown or retired activationId '${activationId}'`
        };
      }
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
      return { ok: true, code: "cae-disable-activation-ok", data: { schemaVersion: 1, versionId: v, activationId } };
    }

    if (name === "cae-retire-activation") {
      const v = resolveVersionId(db, args.versionId);
      if (typeof v !== "string") return v;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
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
      return { ok: true, code: "cae-retire-activation-ok", data: { schemaVersion: 1, versionId: v, activationId } };
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
