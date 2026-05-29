import crypto from "node:crypto";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { isPlanningStateEventKind } from "../task-state-events/planning-event-payloads.js";
import { readTaskStateEventLogJsonl } from "../task-state-events/task-state-event-log-io.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { isGitRepository, resolveTaskStateGitRef } from "../task-state-git/git-io.js";
import { readPhaseCatalogRows } from "./phase-catalog-store.js";
import {
  draftPlanningPhaseCatalogUpsertedEvent,
  draftPlanningWorkspaceStatusUpdatedEvent
} from "./planning-event-draft.js";
import { commitCanonicalPlanningEvents } from "./planning-canonical-mutation-hook.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";
import { readKitWorkspaceStatusRow } from "./workspace-status-store.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";

function planningTailExists(rawEvents: unknown[]): boolean {
  return rawEvents.some((line) => {
    if (typeof line !== "object" || line === null || !("kind" in line)) {
      return false;
    }
    return isPlanningStateEventKind(String((line as { kind: unknown }).kind));
  });
}

export async function runPlanningStateMigrateBaseline(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const overwriteExisting = args.overwriteExisting === true;

  if (!isGitRepository(ctx.workspacePath)) {
    return { ok: false, code: "not-a-git-repo", message: "planning-state-migrate-baseline requires a git workspace" };
  }
  if (!isGitTaskStateCanonicalAuthority(ctx)) {
    return {
      ok: false,
      code: "task-state-not-canonical-authority",
      message: "planning-state-migrate-baseline requires tasks.canonicalAuthority git-event-log"
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const db = planning.sqliteDual.getDatabase();
  const catalogRows = readPhaseCatalogRows(db);
  const ws = readKitWorkspaceStatusRow(db);
  if (!ws) {
    return { ok: false, code: "workspace-status-unavailable", message: "kit_workspace_status row missing" };
  }

  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify({ catalogRows, ws }))
    .digest("hex");

  const rawEvents = readTaskStateEventLogJsonl(ctx.workspacePath);
  const hasPlanningTail = planningTailExists(rawEvents);
  if (hasPlanningTail && !overwriteExisting) {
    return {
      ok: false,
      code: "planning-baseline-conflict",
      message: "Remote/local canonical log already contains planning.* events; pass overwriteExisting:true to replace",
      data: {
        schemaVersion: 1,
        dryRun,
        catalogRowCount: catalogRows.length,
        workspaceRevision: ws.workspaceRevision,
        digest,
        hasPlanningTail
      }
    };
  }

  const preview = {
    schemaVersion: 1,
    dryRun,
    catalogRowCount: catalogRows.length,
    workspaceRevision: ws.workspaceRevision,
    digest,
    hasPlanningTail,
    overwriteExisting
  };

  if (dryRun) {
    return {
      ok: true,
      code: "planning-state-migrate-baseline-dry-run",
      message: "Dry run: would publish genesis planning events from local SQLite",
      data: preview
    };
  }

  const ctxDraft = { commandName: "planning-state-migrate-baseline", moduleId: "task-engine" };
  const genesisBefore = {
    workspaceRevision: 0,
    currentKitPhase: null,
    nextKitPhase: null,
    activeFocus: null,
    lastUpdated: null,
    blockers: [] as string[],
    pendingDecisions: [] as string[],
    nextAgentActions: [] as string[],
    updatedAt: ws.updatedAt
  };
  const events = [
    ...catalogRows.map((row) =>
      draftPlanningPhaseCatalogUpsertedEvent({
        phaseKey: row.phaseKey,
        shortDescription: row.shortDescription,
        updatedAt: row.updatedAt,
        ctx: ctxDraft
      })
    ),
    draftPlanningWorkspaceStatusUpdatedEvent({
      patch: {
        currentKitPhase: ws.currentKitPhase,
        nextKitPhase: ws.nextKitPhase,
        activeFocus: ws.activeFocus,
        lastUpdated: ws.lastUpdated,
        blockers: ws.blockers,
        pendingDecisions: ws.pendingDecisions,
        nextAgentActions: ws.nextAgentActions
      },
      before: genesisBefore,
      after: ws,
      ctx: { ...ctxDraft, clientMutationId: "planning-baseline-workspace-status-v1" }
    })
  ];

  const resolved = resolveTaskStateGitRef(ctx.workspacePath, TASK_STATE_GIT_BRANCH);
  if ("missing" in resolved) {
    return {
      ok: false,
      code: "task-state-branch-missing",
      message: "Run task-state-init before planning-state-migrate-baseline",
      data: preview
    };
  }

  const canonical = await commitCanonicalPlanningEvents({
    ctx,
    store: planning.taskStore,
    planning,
    events,
    policyApproval: args.policyApproval as { confirmed: boolean; rationale: string } | undefined
  });
  if (canonical && !canonical.ok) {
    return { ...canonical, data: { ...(canonical.data as Record<string, unknown>), ...preview } };
  }

  return {
    ok: true,
    code: "planning-state-migrate-baseline-complete",
    message: `Published ${events.length} genesis planning event(s)`,
    data: { ...preview, publishedCount: events.length }
  };
}
