import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { readProjectConfigDocument, writeProjectConfigDocument } from "../../core/workspace-kit-config.js";
import { inferTaskPhaseKey, parseKitPhaseNumberFromYaml, resolveCanonicalPhase } from "./phase-resolution.js";
import { TaskEngineError } from "./transitions.js";
import { digestPayload, readIdempotencyValue } from "./mutation-utils.js";
import type { TaskEntity, TaskStatus } from "./types.js";
import {
  findWorkspaceStatusEventByClientMutationId,
  formatWorkspaceStatusDbExportYaml,
  kitWorkspaceStatusPublicToSnapshot,
  listWorkspaceStatusEvents,
  openSqliteDualForWorkspaceStatus,
  patchWorkspaceStatus,
  readKitWorkspaceStatusRow,
  workspaceStatusTableAvailable,
  writeWorkspaceStatusDbExport,
  WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
  type WorkspaceStatusUpdatePatch
} from "./persistence/workspace-status-store.js";

const PHASE_TEXT_MAX = 120;
type SqliteDb = InstanceType<typeof DatabaseCtor>;

function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined) {
    return undefined;
  }
  if (!Array.isArray(v)) {
    return undefined;
  }
  return v.map((x) => String(x));
}

function readNullableString(
  args: Record<string, unknown>,
  key: string
): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  if (!Object.hasOwn(args, key)) {
    return { ok: true, value: undefined };
  }
  const raw = args[key];
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: `${key} must be a string or null when provided` };
  }
  const value = raw.trim();
  if (value.length === 0 || value.length > PHASE_TEXT_MAX || /[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    return { ok: false, message: `${key} must be a non-empty single-line string up to ${PHASE_TEXT_MAX} chars` };
  }
  return { ok: true, value };
}

function readRequiredPhase(args: Record<string, unknown>): { ok: true; value: string; phaseKey: string } | { ok: false; message: string } {
  const parsed = readNullableString(args, "currentKitPhase");
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value === undefined || parsed.value === null) {
    return { ok: false, message: "set-current-phase requires currentKitPhase (non-empty string)" };
  }
  const phaseKey = parseKitPhaseNumberFromYaml(parsed.value);
  if (!phaseKey) {
    return { ok: false, message: "currentKitPhase must begin with a positive phase number (for example \"72\")" };
  }
  return { ok: true, value: parsed.value, phaseKey };
}

function projectConfigPhaseHint(doc: Record<string, unknown>): { currentPhaseNumber: number | null; currentPhaseLabel: string | null } {
  const kit = doc.kit;
  const kitObj = kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : {};
  const currentPhaseNumber =
    typeof kitObj.currentPhaseNumber === "number" && Number.isFinite(kitObj.currentPhaseNumber)
      ? Math.floor(kitObj.currentPhaseNumber)
      : null;
  const currentPhaseLabel =
    typeof kitObj.currentPhaseLabel === "string" && kitObj.currentPhaseLabel.trim().length > 0
      ? kitObj.currentPhaseLabel.trim()
      : null;
  return { currentPhaseNumber, currentPhaseLabel };
}

function emptyStatusCounts(): Record<TaskStatus, number> {
  return {
    research: 0,
    proposed: 0,
    ready: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0
  };
}

function phaseTaskCounts(tasks: TaskEntity[], phaseKey: string | null): Record<TaskStatus, number> | null {
  if (!phaseKey) {
    return null;
  }
  const counts = emptyStatusCounts();
  for (const task of tasks) {
    if (inferTaskPhaseKey(task) !== phaseKey) {
      continue;
    }
    counts[task.status] += 1;
  }
  return counts;
}

function readWorkspaceStatusExportRevision(exportAbs: string): number | null {
  try {
    const body = fs.readFileSync(exportAbs, "utf8");
    const match = body.match(/^# workspace_revision: ([0-9]+)$/m);
    if (!match) return null;
    const revision = Number(match[1]);
    return Number.isInteger(revision) && revision >= 0 ? revision : null;
  } catch {
    return null;
  }
}

function workspaceStatusExportStatus(
  ctx: ModuleLifecycleContext,
  workspaceStatus: NonNullable<ReturnType<typeof readKitWorkspaceStatusRow>> | null
): Record<string, unknown> {
  const fileRelativePath = WORKSPACE_STATUS_DB_EXPORT_RELATIVE;
  const exportAbs = path.join(ctx.workspacePath, fileRelativePath);
  const exists = fs.existsSync(exportAbs);
  if (!workspaceStatus) {
    return {
      fileRelativePath,
      exists,
      stale: null,
      reason: "workspace-status-unavailable"
    };
  }
  if (!exists) {
    return {
      fileRelativePath,
      exists: false,
      stale: true,
      reason: "missing"
    };
  }
  const exportWorkspaceRevision = readWorkspaceStatusExportRevision(exportAbs);
  if (exportWorkspaceRevision === null) {
    return {
      fileRelativePath,
      exists: true,
      stale: true,
      reason: "missing-workspace-revision-marker",
      workspaceRevision: workspaceStatus.workspaceRevision
    };
  }
  const exportStat = fs.statSync(exportAbs);
  const stale = exportWorkspaceRevision < workspaceStatus.workspaceRevision;
  return {
    fileRelativePath,
    exists: true,
    stale,
    reason: stale ? "older-than-workspace-status-revision" : "fresh",
    exportWorkspaceRevision,
    workspaceRevision: workspaceStatus.workspaceRevision,
    exportMtime: exportStat.mtime.toISOString()
  };
}

function patchProjectConfigPhaseHint(
  doc: Record<string, unknown>,
  phaseNumber: number,
  currentPhaseLabel: string | null | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...doc };
  const kit =
    doc.kit && typeof doc.kit === "object" && !Array.isArray(doc.kit) ? { ...(doc.kit as Record<string, unknown>) } : {};
  kit.currentPhaseNumber = phaseNumber;
  if (currentPhaseLabel === null) {
    delete kit.currentPhaseLabel;
  } else {
    kit.currentPhaseLabel = currentPhaseLabel ?? `Phase ${phaseNumber}`;
  }
  next.kit = kit;
  return next;
}

function plannedWorkspaceStatusAfter(
  before: NonNullable<ReturnType<typeof readKitWorkspaceStatusRow>>,
  patch: WorkspaceStatusUpdatePatch
): NonNullable<ReturnType<typeof readKitWorkspaceStatusRow>> {
  const now = new Date().toISOString();
  return {
    workspaceRevision: before.workspaceRevision + 1,
    currentKitPhase: Object.hasOwn(patch, "currentKitPhase") ? patch.currentKitPhase! : before.currentKitPhase,
    nextKitPhase: Object.hasOwn(patch, "nextKitPhase") ? patch.nextKitPhase! : before.nextKitPhase,
    activeFocus: Object.hasOwn(patch, "activeFocus") ? patch.activeFocus! : before.activeFocus,
    lastUpdated: Object.hasOwn(patch, "lastUpdated") ? patch.lastUpdated! : before.lastUpdated,
    blockers: patch.blockers ?? before.blockers,
    pendingDecisions: patch.pendingDecisions ?? before.pendingDecisions,
    nextAgentActions: patch.nextAgentActions ?? before.nextAgentActions,
    updatedAt: now
  };
}

function phaseRolloverPresentation(args: {
  dryRun: boolean;
  replayed?: boolean;
  beforeRevision?: number;
  afterRevision?: number;
  workspaceStatusBefore: NonNullable<ReturnType<typeof readKitWorkspaceStatusRow>>;
  workspaceStatusAfter: NonNullable<ReturnType<typeof readKitWorkspaceStatusRow>>;
  configHintBefore: ReturnType<typeof projectConfigPhaseHint>;
  configHintAfter: ReturnType<typeof projectConfigPhaseHint>;
  canonicalPhase: ReturnType<typeof resolveCanonicalPhase>;
  exportStatus: Record<string, unknown>;
  suggestedFollowUpCommand: string | null;
  taskCounts?: Record<TaskStatus, number> | null;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "phase_rollover_v1",
    dryRun: args.dryRun,
    replayed: args.replayed === true,
    beforePhase: {
      currentKitPhase: args.workspaceStatusBefore.currentKitPhase,
      nextKitPhase: args.workspaceStatusBefore.nextKitPhase,
      activeFocus: args.workspaceStatusBefore.activeFocus
    },
    afterPhase: {
      currentKitPhase: args.workspaceStatusAfter.currentKitPhase,
      nextKitPhase: args.workspaceStatusAfter.nextKitPhase,
      activeFocus: args.workspaceStatusAfter.activeFocus
    },
    workspaceRevisionBefore: args.beforeRevision ?? args.workspaceStatusBefore.workspaceRevision,
    workspaceRevisionAfter: args.afterRevision ?? args.workspaceStatusAfter.workspaceRevision,
    configHintBefore: args.configHintBefore,
    configHintAfter: args.configHintAfter,
    configHintStatus: {
      canonicalPhaseKey: args.canonicalPhase.canonicalPhaseKey,
      configMatchesWorkspaceStatus: args.canonicalPhase.configMatchesWorkspaceStatus
    },
    exportStatus: args.exportStatus,
    suggestedFollowUpCommand: args.suggestedFollowUpCommand,
    taskCounts: args.taskCounts ?? null,
    agentRenderHint:
      "Use this stable phase_rollover_v1 projection for summaries; raw workspaceStatus/config/export fields remain the source of truth."
  };
}

export async function runGetWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  _args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const uv = readKitSqliteUserVersion(dual.dbPath);
    const row = readKitWorkspaceStatusRow(db);
    if (!workspaceStatusTableAvailable(db) || row === null) {
      return {
        ok: true,
        code: "workspace-status-unavailable",
        message: "kit_workspace_status not present (SQLite user_version < 10 or missing row)",
        data: { kitSqliteUserVersion: uv, workspaceStatus: null }
      };
    }
    return {
      ok: true,
      code: "workspace-status-read",
      message: "Read kit workspace status row",
      data: { kitSqliteUserVersion: uv, workspaceStatus: row }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to read workspace status: ${(e as Error).message}`
    };
  }
}

export async function runPhaseStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  state?: { tasks?: TaskEntity[]; db?: SqliteDb; dbPath?: string }
): Promise<ModuleCommandResult> {
  const includeTaskCounts = args.includeTaskCounts === true;
  const includeDriftDetails = args.includeDriftDetails === true;

  try {
    let db = state?.db;
    if (!db) {
      const dual = openSqliteDualForWorkspaceStatus(ctx);
      db = dual.getDatabase();
    }
    const workspaceStatus = readKitWorkspaceStatusRow(db);
    const workspaceSnapshot = workspaceStatus ? kitWorkspaceStatusPublicToSnapshot(workspaceStatus) : null;
    const configHint = projectConfigPhaseHint(ctx.effectiveConfig ?? {});
    const canonicalPhase = resolveCanonicalPhase({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus: workspaceSnapshot
    });
    const exportStatus = workspaceStatusExportStatus(ctx, workspaceStatus);
    const remediationSuggestions: string[] = [];
    const driftDetails: string[] = [];

    if (canonicalPhase.configMatchesWorkspaceStatus === false) {
      const msg = `kit.currentPhaseNumber (${canonicalPhase.configPhaseKey}) differs from kit_workspace_status (${canonicalPhase.workspaceStatusPhaseKey})`;
      driftDetails.push(msg);
      remediationSuggestions.push("pnpm exec wk run set-current-phase '{\"currentKitPhase\":\"<phase>\",\"expectedWorkspaceRevision\":<revision>}'");
    }
    if (exportStatus.stale === true) {
      driftDetails.push(`${WORKSPACE_STATUS_DB_EXPORT_RELATIVE} is ${exportStatus.reason}`);
      remediationSuggestions.push("pnpm exec wk run export-workspace-status '{}'");
    }

    const data: Record<string, unknown> = {
      schemaVersion: 1,
      workspaceStatus,
      canonicalPhase,
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null,
      configHint,
      exportStatus,
      remediationSuggestions
    };
    if (includeTaskCounts) {
      const tasks = state?.tasks ?? [];
      data.taskCounts = {
        currentPhaseKey: canonicalPhase.canonicalPhaseKey,
        currentPhase: phaseTaskCounts(tasks, canonicalPhase.canonicalPhaseKey),
        nextPhaseKey: parseKitPhaseNumberFromYaml(workspaceStatus?.nextKitPhase ?? null),
        nextPhase: phaseTaskCounts(tasks, parseKitPhaseNumberFromYaml(workspaceStatus?.nextKitPhase ?? null))
      };
    }
    if (includeDriftDetails) {
      data.driftDetails = driftDetails;
    }

    return {
      ok: true,
      code: "phase-status-read",
      message:
        canonicalPhase.canonicalPhaseKey === null
          ? "No canonical workspace phase configured"
          : `Current phase ${canonicalPhase.canonicalPhaseKey} (${canonicalPhase.source})`,
      data
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to read phase status: ${(e as Error).message}`
    };
  }
}

export async function runUpdateWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const revRaw = args.expectedWorkspaceRevision;
  if (typeof revRaw !== "number" || !Number.isInteger(revRaw) || revRaw < 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "update-workspace-status requires expectedWorkspaceRevision (non-negative integer)"
    };
  }
  const patch: WorkspaceStatusUpdatePatch = {};
  if (Object.hasOwn(args, "currentKitPhase")) {
    const v = args.currentKitPhase;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase must be string or null" };
    }
    patch.currentKitPhase = v as string | null;
  }
  if (Object.hasOwn(args, "nextKitPhase")) {
    const v = args.nextKitPhase;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "nextKitPhase must be string or null" };
    }
    patch.nextKitPhase = v as string | null;
  }
  if (Object.hasOwn(args, "activeFocus")) {
    const v = args.activeFocus;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "activeFocus must be string or null" };
    }
    patch.activeFocus = v as string | null;
  }
  if (Object.hasOwn(args, "lastUpdated")) {
    const v = args.lastUpdated;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "lastUpdated must be string or null" };
    }
    patch.lastUpdated = v as string | null;
  }
  const b = asStringArray(args.blockers);
  if (args.blockers !== undefined && b === undefined) {
    return { ok: false, code: "invalid-task-schema", message: "blockers must be an array of strings when provided" };
  }
  if (b) {
    patch.blockers = b;
  }
  const pd = asStringArray(args.pendingDecisions);
  if (args.pendingDecisions !== undefined && pd === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "pendingDecisions must be an array of strings when provided"
    };
  }
  if (pd) {
    patch.pendingDecisions = pd;
  }
  const na = asStringArray(args.nextAgentActions);
  if (args.nextAgentActions !== undefined && na === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "nextAgentActions must be an array of strings when provided"
    };
  }
  if (na) {
    patch.nextAgentActions = na;
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "update-workspace-status requires at least one mutable field besides expectedWorkspaceRevision"
    };
  }

  const actor = typeof args.actor === "string" ? args.actor : null;
  const command = typeof args.command === "string" ? args.command : "update-workspace-status";

  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const before = readKitWorkspaceStatusRow(db);
    const { beforeRevision, afterRevision } = patchWorkspaceStatus(db, {
      expectedWorkspaceRevision: revRaw,
      patch,
      actor,
      command
    });
    const after = readKitWorkspaceStatusRow(db);
    return {
      ok: true,
      code: "workspace-status-updated",
      message: "Updated kit workspace status",
      data: {
        beforeRevision,
        afterRevision,
        workspaceStatusBefore: before,
        workspaceStatusAfter: after
      }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to update workspace status: ${(e as Error).message}`
    };
  }
}

export async function runSetCurrentPhase(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const requiredPhase = readRequiredPhase(args);
  if (!requiredPhase.ok) {
    return { ok: false, code: "invalid-task-schema", message: requiredPhase.message };
  }

  const nextKitPhase = readNullableString(args, "nextKitPhase");
  if (!nextKitPhase.ok) {
    return { ok: false, code: "invalid-task-schema", message: nextKitPhase.message };
  }
  const activeFocus = readNullableString(args, "activeFocus");
  if (!activeFocus.ok) {
    return { ok: false, code: "invalid-task-schema", message: activeFocus.message };
  }
  const blockers = asStringArray(args.blockers);
  if (args.blockers !== undefined && blockers === undefined) {
    return { ok: false, code: "invalid-task-schema", message: "blockers must be an array of strings when provided" };
  }
  const pendingDecisions = asStringArray(args.pendingDecisions);
  if (args.pendingDecisions !== undefined && pendingDecisions === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "pendingDecisions must be an array of strings when provided"
    };
  }
  const nextAgentActions = asStringArray(args.nextAgentActions);
  if (args.nextAgentActions !== undefined && nextAgentActions === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "nextAgentActions must be an array of strings when provided"
    };
  }
  const currentPhaseLabel = readNullableString(args, "currentPhaseLabel");
  if (!currentPhaseLabel.ok) {
    return { ok: false, code: "invalid-task-schema", message: currentPhaseLabel.message };
  }

  const expectedRaw = args.expectedWorkspaceRevision;
  const expectedWorkspaceRevision =
    typeof expectedRaw === "number" && Number.isInteger(expectedRaw) && expectedRaw >= 0 ? expectedRaw : undefined;
  const clientMutationId = readIdempotencyValue(args);
  if (!dryRun && expectedWorkspaceRevision === undefined && !clientMutationId) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "set-current-phase requires expectedWorkspaceRevision (non-negative integer) for live writes"
    };
  }

  const phaseNumber = Number(requiredPhase.phaseKey);
  const actor = typeof args.actor === "string" ? args.actor : ctx.resolvedActor ?? null;
  const explicitLastUpdated = Object.hasOwn(args, "lastUpdated");
  const lastUpdated = typeof args.lastUpdated === "string" && args.lastUpdated.trim() ? args.lastUpdated.trim() : new Date().toISOString();
  const patch: WorkspaceStatusUpdatePatch = {
    currentKitPhase: requiredPhase.value,
    lastUpdated
  };
  if (nextKitPhase.value !== undefined) {
    patch.nextKitPhase = nextKitPhase.value;
  }
  if (activeFocus.value !== undefined) {
    patch.activeFocus = activeFocus.value;
  }
  if (blockers !== undefined) {
    patch.blockers = blockers;
  }
  if (pendingDecisions !== undefined) {
    patch.pendingDecisions = pendingDecisions;
  }
  if (nextAgentActions !== undefined) {
    patch.nextAgentActions = nextAgentActions;
  }

  const payloadDigest = digestPayload({
    command: "set-current-phase",
    currentKitPhase: patch.currentKitPhase,
    nextKitPhase: Object.hasOwn(patch, "nextKitPhase") ? patch.nextKitPhase : undefined,
    activeFocus: Object.hasOwn(patch, "activeFocus") ? patch.activeFocus : undefined,
    blockers: patch.blockers,
    pendingDecisions: patch.pendingDecisions,
    nextAgentActions: patch.nextAgentActions,
    currentPhaseLabel: currentPhaseLabel.value,
    lastUpdated: explicitLastUpdated ? lastUpdated : undefined
  });

  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const before = readKitWorkspaceStatusRow(db);
    if (!workspaceStatusTableAvailable(db) || before === null) {
      return {
        ok: false,
        code: "workspace-status-unavailable",
        message: "kit_workspace_status not available for set-current-phase"
      };
    }

    const configBefore = await readProjectConfigDocument(ctx.workspacePath);
    const configHintBefore = projectConfigPhaseHint(configBefore);
    const configAfter = patchProjectConfigPhaseHint(configBefore, phaseNumber, currentPhaseLabel.value);
    const configHintAfter = projectConfigPhaseHint(configAfter);
    const plannedAfter = plannedWorkspaceStatusAfter(before, patch);
    const canonicalAfter = resolveCanonicalPhase({
      effectiveConfig: { ...(ctx.effectiveConfig ?? {}), kit: configAfter.kit },
      workspaceStatus: kitWorkspaceStatusPublicToSnapshot(plannedAfter)
    });
    const exportYamlBody = formatWorkspaceStatusDbExportYaml(plannedAfter);

    if (dryRun) {
      const exportStatus = {
        dryRun: true,
        fileRelativePath: WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
        yamlBody: exportYamlBody
      };
      return {
        ok: true,
        code: "set-current-phase-dry-run",
        message: "Dry run — no workspace status, config, or export writes",
        data: {
          dryRun: true,
          workspaceStatusBefore: before,
          workspaceStatusAfter: plannedAfter,
          configHintBefore,
          configHintAfter,
          canonicalPhase: canonicalAfter,
          exportStatus,
          suggestedFollowUpCommand: null,
          presentation: {
            phaseRollover: phaseRolloverPresentation({
              dryRun: true,
              workspaceStatusBefore: before,
              workspaceStatusAfter: plannedAfter,
              configHintBefore,
              configHintAfter,
              canonicalPhase: canonicalAfter,
              exportStatus,
              suggestedFollowUpCommand: null
            })
          }
        } as Record<string, unknown>
      };
    }

    let replayed = false;
    let beforeRevision = before.workspaceRevision;
    let afterRevision = before.workspaceRevision;
    if (clientMutationId) {
      const prior = findWorkspaceStatusEventByClientMutationId(db, "set-current-phase", clientMutationId);
      if (prior) {
        if (prior.payloadDigest !== payloadDigest) {
          return {
            ok: false,
            code: "idempotency-key-conflict",
            message: `clientMutationId '${clientMutationId}' was already used for a different set-current-phase payload`
          };
        }
        replayed = true;
        beforeRevision = prior.revisionBefore;
        afterRevision = prior.revisionAfter;
      }
    }

    if (!replayed) {
      if (expectedWorkspaceRevision === undefined) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "set-current-phase requires expectedWorkspaceRevision (non-negative integer) for live writes"
        };
      }
      const patched = patchWorkspaceStatus(db, {
        expectedWorkspaceRevision,
        patch,
        actor,
        command: "set-current-phase",
        eventKind: "set_current_phase",
        details: { clientMutationId, payloadDigest }
      });
      beforeRevision = patched.beforeRevision;
      afterRevision = patched.afterRevision;
    }

    await writeProjectConfigDocument(ctx.workspacePath, configAfter);
    const after = readKitWorkspaceStatusRow(db);
    if (!after) {
      return { ok: false, code: "storage-read-error", message: "set-current-phase updated but could not re-read workspace status" };
    }
    const writtenExport = writeWorkspaceStatusDbExport(ctx, formatWorkspaceStatusDbExportYaml(after));
    const canonicalVerified = resolveCanonicalPhase({
      effectiveConfig: { ...(ctx.effectiveConfig ?? {}), kit: configAfter.kit },
      workspaceStatus: kitWorkspaceStatusPublicToSnapshot(after)
    });
    const suggestedFollowUpCommand =
      canonicalVerified.configMatchesWorkspaceStatus === false
        ? `workspace-kit config set kit.currentPhaseNumber ${phaseNumber} --json`
        : null;
    const exportStatus = {
      dryRun: false,
      written: true,
      fileRelativePath: writtenExport,
      workspaceRevision: after.workspaceRevision
    };

    return {
      ok: true,
      code: replayed ? "set-current-phase-idempotent-replay" : "set-current-phase-updated",
      message: replayed
        ? `Idempotent set-current-phase replay for phase ${requiredPhase.phaseKey}`
        : `Set current phase to ${requiredPhase.value}`,
      data: {
        dryRun: false,
        replayed,
        beforeRevision,
        afterRevision,
        workspaceStatusBefore: before,
        workspaceStatusAfter: after,
        configHintBefore,
        configHintAfter: projectConfigPhaseHint(configAfter),
        canonicalPhase: canonicalVerified,
        exportStatus,
        suggestedFollowUpCommand,
        presentation: {
          phaseRollover: phaseRolloverPresentation({
            dryRun: false,
            replayed,
            beforeRevision,
            afterRevision,
            workspaceStatusBefore: before,
            workspaceStatusAfter: after,
            configHintBefore,
            configHintAfter: projectConfigPhaseHint(configAfter),
            canonicalPhase: canonicalVerified,
            exportStatus,
            suggestedFollowUpCommand
          })
        }
      } as Record<string, unknown>
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to set current phase: ${(e as Error).message}`
    };
  }
}

export async function runExportWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const row = readKitWorkspaceStatusRow(db);
    if (!workspaceStatusTableAvailable(db) || row === null) {
      return {
        ok: false,
        code: "workspace-status-unavailable",
        message: "kit_workspace_status not available for export"
      };
    }
    const yamlBody = formatWorkspaceStatusDbExportYaml(row);
    if (dryRun) {
      return {
        ok: true,
        code: "workspace-status-export-dry-run",
        message: "Dry run — no file write",
        data: {
          dryRun: true,
          fileRelativePath: WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
          yamlBody
        }
      };
    }
    const written = writeWorkspaceStatusDbExport(ctx, yamlBody);
    return {
      ok: true,
      code: "workspace-status-exported",
      message: `Wrote non-authoritative export to ${written}`,
      data: {
        dryRun: false,
        fileRelativePath: written,
        workspaceRevision: row.workspaceRevision
      }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to export workspace status: ${(e as Error).message}`
    };
  }
}

export async function runWorkspaceStatusHistory(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  let limit = 50;
  if (args.limit !== undefined) {
    if (typeof args.limit !== "number" || !Number.isInteger(args.limit)) {
      return { ok: false, code: "invalid-task-schema", message: "limit must be an integer when provided" };
    }
    limit = args.limit;
  }
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const events = listWorkspaceStatusEvents(db, limit);
    return {
      ok: true,
      code: "workspace-status-history",
      message: "Listed workspace status events",
      data: { events, limit }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to list workspace status history: ${(e as Error).message}`
    };
  }
}
