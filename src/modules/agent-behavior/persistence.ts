import fs from "node:fs";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { validateModuleScopedConfigDocument } from "../../core/config-metadata.js";
import { readModuleScopedConfigDocument } from "../../core/module-scoped-config.js";
import {
  archiveSidecarFile,
  persistModuleStateRow,
  readSidecarJsonFile
} from "../../core/state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { writeModuleScopedConfigDocument } from "../../core/workspace-kit-config.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import type { BehaviorWorkspaceStateV1 } from "./types.js";

const MODULE_ID = "agent-behavior";
const STATE_SCHEMA = 1;
export const AGENT_BEHAVIOR_STATE_SIDECAR_REL = path.join(".workspace-kit", "agent-behavior", "state.json");

export function behaviorSqliteRelativePath(
  effectiveConfig: Record<string, unknown> | undefined
): string {
  return planningSqliteDatabaseRelativePath({
    workspacePath: "",
    effectiveConfig
  } as ModuleLifecycleContext);
}


function emptyState(): BehaviorWorkspaceStateV1 {
  return { schemaVersion: 1, activeProfileId: null, customProfiles: {} };
}

function parseState(raw: unknown): BehaviorWorkspaceStateV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyState();
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return emptyState();
  }
  const custom = o.customProfiles;
  const customProfiles: BehaviorWorkspaceStateV1["customProfiles"] = {};
  if (custom && typeof custom === "object" && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom)) {
      if (typeof k === "string" && k.startsWith("custom:")) {
        customProfiles[k] = v as BehaviorWorkspaceStateV1["customProfiles"][string];
      }
    }
  }
  const active =
    typeof o.activeProfileId === "string" && o.activeProfileId.length > 0
      ? o.activeProfileId
      : null;
  return { schemaVersion: 1, activeProfileId: active, customProfiles };
}

function stateFromMergedAgentBehaviorConfig(cfg: Record<string, unknown> | undefined): BehaviorWorkspaceStateV1 | null {
  const ab = cfg?.agentBehavior;
  if (!ab || typeof ab !== "object" || Array.isArray(ab)) {
    return null;
  }
  const o = ab as Record<string, unknown>;
  const active =
    typeof o.activeProfileId === "string" && o.activeProfileId.trim().length > 0
      ? o.activeProfileId.trim()
      : null;
  const custom = o.customProfiles;
  const customProfiles: BehaviorWorkspaceStateV1["customProfiles"] = {};
  if (custom && typeof custom === "object" && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom)) {
      if (typeof k === "string" && k.startsWith("custom:")) {
        customProfiles[k] = v as BehaviorWorkspaceStateV1["customProfiles"][string];
      }
    }
  }
  return { schemaVersion: 1, activeProfileId: active, customProfiles };
}

export async function loadBehaviorWorkspaceState(
  ctx: ModuleLifecycleContext
): Promise<BehaviorWorkspaceStateV1> {
  const cfg = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const rel = behaviorSqliteRelativePath(cfg);
  const db = new UnifiedStateDb(ctx.workspacePath, rel);
  const row = db.getModuleState(MODULE_ID);
  if (row?.state) {
    return parseState(row.state);
  }
  const sidecar = await readSidecarJsonFile(ctx.workspacePath, AGENT_BEHAVIOR_STATE_SIDECAR_REL);
  if (sidecar.ok) {
    const parsed = parseState(sidecar.value);
    persistModuleStateRow({
      workspacePath: ctx.workspacePath,
      databaseRelativePath: rel,
      moduleId: MODULE_ID,
      stateSchemaVersion: STATE_SCHEMA,
      state: parsed as unknown as Record<string, unknown>
    });
    await archiveSidecarFile(ctx.workspacePath, AGENT_BEHAVIOR_STATE_SIDECAR_REL);
    return parsed;
  }
  if ("corrupt" in sidecar && sidecar.corrupt) {
    await archiveSidecarFile(ctx.workspacePath, AGENT_BEHAVIOR_STATE_SIDECAR_REL);
    return emptyState();
  }
  const fromConfig = stateFromMergedAgentBehaviorConfig(cfg);
  return fromConfig ?? emptyState();
}

export async function saveBehaviorWorkspaceState(
  ctx: ModuleLifecycleContext,
  state: BehaviorWorkspaceStateV1
): Promise<void> {
  const cfg = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const body: BehaviorWorkspaceStateV1 = {
    schemaVersion: 1,
    activeProfileId: state.activeProfileId,
    customProfiles: { ...state.customProfiles }
  };
  const rel = behaviorSqliteRelativePath(cfg);
  const db = new UnifiedStateDb(ctx.workspacePath, rel);
  db.setModuleState(MODULE_ID, STATE_SCHEMA, body as unknown as Record<string, unknown>);

  const disk = await readModuleScopedConfigDocument(ctx.workspacePath, MODULE_ID);
  const next: Record<string, unknown> = { ...disk };
  if (typeof next.schemaVersion !== "number") {
    next.schemaVersion = 1;
  }
  next.agentBehavior = {
    activeProfileId: state.activeProfileId ?? "",
    customProfiles: state.customProfiles
  };
  validateModuleScopedConfigDocument(MODULE_ID, next, "agent-behavior config.json");
  await writeModuleScopedConfigDocument(ctx.workspacePath, MODULE_ID, next);
}
