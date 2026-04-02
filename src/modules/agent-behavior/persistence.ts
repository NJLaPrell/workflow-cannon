import fs from "node:fs";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import type { BehaviorWorkspaceStateV1 } from "./types.js";

const MODULE_ID = "agent-behavior";
const STATE_SCHEMA = 1;
const JSON_REL = path.join(".workspace-kit", "agent-behavior", "state.json");

export function behaviorSqliteRelativePath(
  effectiveConfig: Record<string, unknown> | undefined
): string {
  return planningSqliteDatabaseRelativePath({
    workspacePath: "",
    effectiveConfig
  } as ModuleLifecycleContext);
}

function jsonPath(workspacePath: string): string {
  return path.join(workspacePath, JSON_REL);
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
  const fp = jsonPath(ctx.workspacePath);
  try {
    const raw = JSON.parse(await fs.promises.readFile(fp, "utf8")) as unknown;
    return parseState(raw);
  } catch {
    return emptyState();
  }
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
}
