import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { openPlanningStores } from "../../../core/planning/index.js";
import type { ModuleStateRow } from "../../../core/state/unified-state-db.js";
import { UnifiedStateDb } from "../../../core/state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { draftPlanningModuleStateUpdatedEvent } from "./planning-event-draft.js";
import { commitCanonicalPlanningEvents } from "./planning-canonical-mutation-hook.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import type { TaskStore } from "./store.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";
import { isModuleStatePlanningSyncAllowed } from "../task-state-events/module-state-planning-sync-allowlist.js";

export { MODULE_STATE_PLANNING_SYNC_ALLOWLIST } from "../task-state-events/module-state-planning-sync-allowlist.js";

export function computeNextModuleStateRevision(current: ModuleStateRow | null): {
  expectedStateSchemaVersion: number;
  nextStateSchemaVersion: number;
} {
  const expectedStateSchemaVersion = current?.stateSchemaVersion ?? 0;
  return {
    expectedStateSchemaVersion,
    nextStateSchemaVersion: expectedStateSchemaVersion + 1
  };
}

export async function publishModuleStatePlanningEventIfAllowed(input: {
  ctx: ModuleLifecycleContext;
  moduleId: string;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
  updatedAt: string;
  expectedStateSchemaVersion?: number;
  removed?: boolean;
  commandName: string;
  clientMutationId?: string;
  policyApproval?: { confirmed: boolean; rationale: string };
  store?: TaskStore;
  planning?: OpenedPlanningStores;
}): Promise<ModuleCommandResult | null> {
  if (!isModuleStatePlanningSyncAllowed(input.moduleId)) {
    return null;
  }
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }

  const planning = input.planning ?? (await openPlanningStores(input.ctx));
  const store = input.store ?? planning.taskStore;

  const event = draftPlanningModuleStateUpdatedEvent({
    moduleId: input.moduleId,
    stateSchemaVersion: input.stateSchemaVersion,
    state: input.state,
    updatedAt: input.updatedAt,
    expectedStateSchemaVersion: input.expectedStateSchemaVersion,
    removed: input.removed,
    ctx: {
      commandName: input.commandName,
      moduleId: input.moduleId,
      clientMutationId: input.clientMutationId,
      actorId: "workspace-kit"
    }
  });

  const canonical = await commitCanonicalPlanningEvents({
    ctx: input.ctx,
    store,
    planning,
    events: [event],
    policyApproval: input.policyApproval
  });
  if (canonical && !canonical.ok) {
    return canonical;
  }
  await store.load();
  return null;
}

/** Read current row, bump revision when git-sync allowlisted, persist SQLite, publish when canonical authority. */
export async function persistAllowlistedModuleStateWithPlanningSync(args: {
  workspacePath: string;
  effectiveConfig?: Record<string, unknown>;
  moduleId: string;
  state: Record<string, unknown>;
  updatedAt?: string;
  removed?: boolean;
  commandName: string;
  clientMutationId?: string;
  policyApproval?: { confirmed: boolean; rationale: string };
  /** Document schema version for non-git-sync saves (ignored when revision bump applies). */
  documentSchemaVersion?: number;
}): Promise<ModuleCommandResult | null> {
  const ctx = {
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig
  } as ModuleLifecycleContext;
  const rel = planningSqliteDatabaseRelativePath(ctx);
  const db = new UnifiedStateDb(args.workspacePath, rel);
  const current = db.getModuleState(args.moduleId);
  const updatedAt = args.updatedAt ?? new Date().toISOString();
  const gitSync = isModuleStatePlanningSyncAllowed(args.moduleId) && isGitTaskStateCanonicalAuthority(ctx);

  if (args.removed) {
    if (!current) {
      return null;
    }
    const { expectedStateSchemaVersion } = computeNextModuleStateRevision(current);
    db.deleteModuleState(args.moduleId);
    if (!gitSync) {
      return null;
    }
    return publishModuleStatePlanningEventIfAllowed({
      ctx,
      moduleId: args.moduleId,
      stateSchemaVersion: current.stateSchemaVersion,
      state: current.state,
      updatedAt,
      expectedStateSchemaVersion,
      removed: true,
      commandName: args.commandName,
      clientMutationId: args.clientMutationId,
      policyApproval: args.policyApproval
    });
  }

  if (gitSync) {
    const { expectedStateSchemaVersion, nextStateSchemaVersion } = computeNextModuleStateRevision(current);
    db.setModuleState(args.moduleId, nextStateSchemaVersion, args.state);
    return publishModuleStatePlanningEventIfAllowed({
      ctx,
      moduleId: args.moduleId,
      stateSchemaVersion: nextStateSchemaVersion,
      state: args.state,
      updatedAt,
      expectedStateSchemaVersion,
      commandName: args.commandName,
      clientMutationId: args.clientMutationId,
      policyApproval: args.policyApproval
    });
  }

  const schemaVersion = args.documentSchemaVersion ?? current?.stateSchemaVersion ?? 1;
  db.setModuleState(args.moduleId, schemaVersion, args.state);
  return null;
}
