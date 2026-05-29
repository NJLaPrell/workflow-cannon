import type { TaskStateEventV1 } from "./event-payloads.js";
import type { PlanningStateEventV1 } from "./planning-event-payloads.js";
import { isPlanningStateEventKind } from "./planning-event-payloads.js";

export type CanonicalStateEventV1 = TaskStateEventV1 | PlanningStateEventV1;

export function isPlanningStateEvent(event: CanonicalStateEventV1): event is PlanningStateEventV1 {
  return isPlanningStateEventKind(event.kind);
}

export function isTaskStateEvent(event: CanonicalStateEventV1): event is TaskStateEventV1 {
  return event.kind.startsWith("task.");
}

export function canonicalEventKind(event: CanonicalStateEventV1): string {
  return event.kind;
}
