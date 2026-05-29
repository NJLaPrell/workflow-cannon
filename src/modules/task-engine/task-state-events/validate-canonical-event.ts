import type { CanonicalStateEventV1 } from "./canonical-state-events.js";
import { isPlanningStateEvent } from "./canonical-state-events.js";
import { validateTaskStateEvent } from "./validate-event.js";
import { validatePlanningStateEvent } from "./validate-planning-event.js";

export function validateCanonicalStateEvent(
  input: unknown
): { ok: true; data: CanonicalStateEventV1 } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null || !("kind" in input)) {
    return { ok: false, errors: ["event must be an object with kind"] };
  }
  const kind = (input as { kind: unknown }).kind;
  if (typeof kind !== "string") {
    return { ok: false, errors: ["kind must be a string"] };
  }
  if (kind.startsWith("planning.")) {
    const result = validatePlanningStateEvent(input);
    if (!result.ok) {
      return result;
    }
    return { ok: true, data: result.data };
  }
  const result = validateTaskStateEvent(input);
  if (!result.ok) {
    return result;
  }
  return { ok: true, data: result.data };
}

export function isCanonicalStateEvent(input: unknown): input is CanonicalStateEventV1 {
  return validateCanonicalStateEvent(input).ok;
}

export function assertPlanningEvent(event: CanonicalStateEventV1) {
  if (!isPlanningStateEvent(event)) {
    throw new Error(`expected planning event, got ${event.kind}`);
  }
  return event;
}
