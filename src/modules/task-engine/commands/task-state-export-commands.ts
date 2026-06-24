import * as fs from "node:fs";
import * as path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskEntity, TaskMutationEvidence, TransitionEvidence } from "../types.js";
import type { TaskStore } from "../persistence/store.js";
import { digestTaskStateCanonicalJson } from "../task-state-git/integrity.js";
import {
  DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE,
  readTaskStateEventLogJsonl,
  resolveTaskStateEventLogPath
} from "../task-state-events/task-state-event-log-io.js";
import { stableStringify } from "../mutation-utils.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";

type SnapshotDoc = {
  schemaVersion: 1;
  projectionKind: "task-store-document";
  tasks: TaskEntity[];
  transitions: TransitionEvidence[];
  mutations: TaskMutationEvidence[];
};

function sortTasks(tasks: TaskEntity[]): TaskEntity[] {
  return [...tasks].sort((a, b) => a.id.localeCompare(b.id));
}

function sortTransitions(rows: TransitionEvidence[]): TransitionEvidence[] {
  return [...rows].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.transitionId.localeCompare(b.transitionId)
  );
}

function sortMutations(rows: TaskMutationEvidence[]): TaskMutationEvidence[] {
  return [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.mutationId.localeCompare(b.mutationId));
}

function isTaskStateEvent(value: unknown): value is TaskStateEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return typeof rec.sequence === "number" && Number.isFinite(rec.sequence) && typeof rec.eventId === "string";
}

export function runExportTaskStateArtifactsCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  store: TaskStore
): ModuleCommandResult {
  const outputDirArg = typeof args.outputDir === "string" && args.outputDir.trim() ? args.outputDir.trim() : ".workspace-kit/state-export";
  const outputAbs = path.resolve(ctx.workspacePath, outputDirArg);
  const snapshotPath = path.join(outputAbs, "task-state-snapshot.sorted.json");
  const eventsPath = path.join(outputAbs, "task-state-events.append-only.jsonl");
  const eventsRelativePath =
    typeof args.eventsRelativePath === "string" && args.eventsRelativePath.trim()
      ? args.eventsRelativePath.trim()
      : DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE;

  const snapshot: SnapshotDoc = {
    schemaVersion: 1,
    projectionKind: "task-store-document",
    tasks: sortTasks(store.getAllTasks()),
    transitions: sortTransitions(store.getTransitionLog()),
    mutations: sortMutations(store.getMutationLog())
  };
  const snapshotCanonical = stableStringify(snapshot);
  const snapshotDigest = digestTaskStateCanonicalJson(snapshot);

  const rawEvents = readTaskStateEventLogJsonl(ctx.workspacePath, eventsRelativePath);
  const typedEvents = rawEvents.filter(isTaskStateEvent);
  const orderedEvents = [...typedEvents].sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
  const eventRows = orderedEvents.map((event) => JSON.stringify(event));
  const eventsDigest = digestTaskStateCanonicalJson(orderedEvents);
  const dryRun = args.dryRun === true;
  const eventLogPath = resolveTaskStateEventLogPath(ctx.workspacePath, eventsRelativePath);

  if (!dryRun) {
    fs.mkdirSync(outputAbs, { recursive: true });
    fs.writeFileSync(snapshotPath, `${snapshotCanonical}\n`, "utf8");
    fs.writeFileSync(eventsPath, eventRows.length > 0 ? `${eventRows.join("\n")}\n` : "", "utf8");
  }

  return {
    ok: true,
    code: dryRun ? "task-state-artifacts-export-dry-run" : "task-state-artifacts-exported",
    message: dryRun
      ? "Dry run: calculated deterministic task-state export artifacts"
      : `Wrote deterministic task-state artifacts to ${path.relative(ctx.workspacePath, outputAbs)}`,
    data: {
      schemaVersion: 1,
      dryRun,
      outputDir: outputDirArg,
      snapshotPath: path.relative(ctx.workspacePath, snapshotPath),
      eventsPath: path.relative(ctx.workspacePath, eventsPath),
      sourceEventLogPath: path.relative(ctx.workspacePath, eventLogPath),
      taskCount: snapshot.tasks.length,
      transitionCount: snapshot.transitions.length,
      mutationCount: snapshot.mutations.length,
      eventCount: orderedEvents.length,
      snapshotDigest,
      eventsDigest
    }
  };
}

