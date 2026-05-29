import type { CanonicalStateEventV1 } from "./canonical-state-events.js";
import { isPlanningStateEvent, isTaskStateEvent } from "./canonical-state-events.js";
import { applyTaskStateEvent, createEmptyTaskStateProjection, replayTaskStateEvents } from "./event-applier.js";
import type { TaskStateEventV1 } from "./event-payloads.js";
import {
  applyPlanningStateEvent,
  createEmptyPlanningStateProjection,
  type PlanningSyncApplyOptions,
  replayPlanningStateEvents
} from "./planning-event-applier.js";
import type { PlanningStateEventV1 } from "./planning-event-payloads.js";
import type { PlanningStateProjectionV1 } from "./planning-projection-types.js";
import type { TaskStateProjectionV1 } from "./projection-types.js";

export type CanonicalReplayResultV1 = {
  taskProjection: TaskStateProjectionV1;
  planningProjection: PlanningStateProjectionV1;
  lastEventSequence: number;
};

function sortBySequence(events: CanonicalStateEventV1[]): CanonicalStateEventV1[] {
  return [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

export function replayCanonicalStateEvents(
  events: CanonicalStateEventV1[],
  options?: PlanningSyncApplyOptions
): {
  ok: true;
  result: CanonicalReplayResultV1;
} | {
  ok: false;
  code: string;
  message: string;
  eventId?: string;
} {
  const ordered = sortBySequence(events);
  let taskProjection = createEmptyTaskStateProjection();
  let planningProjection = createEmptyPlanningStateProjection();
  let lastSequence = 0;

  for (const event of ordered) {
    lastSequence = Math.max(lastSequence, event.sequence);
    if (isTaskStateEvent(event)) {
      const applied = applyTaskStateEvent(taskProjection, event as TaskStateEventV1);
      if (!applied.ok) {
        return {
          ok: false,
          code: applied.error.code,
          message: applied.error.message,
          eventId: applied.error.eventId
        };
      }
      taskProjection = applied.projection;
    } else if (isPlanningStateEvent(event)) {
      const applied = applyPlanningStateEvent(planningProjection, event as PlanningStateEventV1, options);
      if (!applied.ok) {
        return {
          ok: false,
          code: applied.error.code,
          message: applied.error.message,
          eventId: applied.error.eventId
        };
      }
      planningProjection = applied.projection;
    }
  }

  return {
    ok: true,
    result: {
      taskProjection,
      planningProjection,
      lastEventSequence: lastSequence
    }
  };
}

/** Convenience: replay task-only subset (existing callers). */
export function replayTaskEventsFromCanonical(events: CanonicalStateEventV1[]) {
  const taskEvents = events.filter(isTaskStateEvent) as TaskStateEventV1[];
  return replayTaskStateEvents(taskEvents);
}

/** Convenience: replay planning-only subset. */
export function replayPlanningEventsFromCanonical(
  events: CanonicalStateEventV1[],
  options?: PlanningSyncApplyOptions
) {
  const planningEvents = events.filter(isPlanningStateEvent) as PlanningStateEventV1[];
  return replayPlanningStateEvents(planningEvents, options);
}
