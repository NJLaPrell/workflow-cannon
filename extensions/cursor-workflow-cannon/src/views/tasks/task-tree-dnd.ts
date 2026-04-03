/**
 * Pure helpers for Tasks tree drag/drop → workspace-kit commands.
 * Keep aligned with `src/modules/task-engine/transitions.ts` ALLOWED_TRANSITIONS.
 */

import { effectiveTaskType, type WkNode } from "./build-task-tree.js";

/** Mime type for Workflow Cannon task tree DnD (extension-local contract). */
export const TASKS_TREE_DND_MIME = "application/vnd.code.tree.workflowcannon.tasks+json";

/** Same edges as task-engine `ALLOWED_TRANSITIONS` (action verbs). */
const EDGE_TO_ACTION: Record<string, string> = {
  "proposed->ready": "accept",
  "proposed->cancelled": "reject",
  "ready->proposed": "demote",
  "ready->in_progress": "start",
  "ready->blocked": "block",
  "ready->cancelled": "cancel",
  "in_progress->completed": "complete",
  "in_progress->cancelled": "decline",
  "in_progress->blocked": "block",
  "in_progress->ready": "pause",
  "blocked->ready": "unblock",
  "blocked->cancelled": "cancel"
};

export type TaskDragPayload = {
  taskId: string;
  status: string;
};

export function transitionActionForTargetStatus(fromStatus: string, toStatus: string): string | null {
  return EDGE_TO_ACTION[`${fromStatus}->${toStatus}`] ?? null;
}

export function isTaskDragSource(node: WkNode): node is WkNode & { kind: "task" } {
  if (node.kind !== "task") {
    return false;
  }
  if (!/^T\d+$/.test(node.task.id)) {
    return false;
  }
  if (effectiveTaskType(node.task) === "wishlist_intake") {
    return false;
  }
  return true;
}

export function describeDropTarget(target: WkNode | undefined):
  | { kind: "phase"; phaseKey: string | null; parentSegment: string }
  | { kind: "status"; status: string }
  | { kind: "invalid"; reason: string } {
  if (!target) {
    return { kind: "invalid", reason: "No drop target" };
  }
  if (target.kind === "phase-bucket") {
    return {
      kind: "phase",
      phaseKey: target.phaseKey,
      parentSegment: target.parentSegment
    };
  }
  if (target.kind === "group") {
    return { kind: "status", status: target.status };
  }
  return { kind: "invalid", reason: "Drop only on a status group or phase folder" };
}

export function phaseMutationAllowed(parentSegment: string): boolean {
  if (parentSegment === "completed" || parentSegment === "cancelled") {
    return false;
  }
  return true;
}
