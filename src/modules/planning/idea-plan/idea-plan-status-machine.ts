import {
  type IdeaPlanStatus,
  isIdeaPlanStatusTransitionAllowed,
  normalizeIdeaPlanStatus,
  parseIdeaPlanStatus
} from "./idea-plan-types.js";

export const IDEA_PLAN_STATUS_TRANSITION_ERROR_CODE = "idea-plan-status-transition-disallowed" as const;

export type IdeaPlanStatusTransitionErrorCode = typeof IDEA_PLAN_STATUS_TRANSITION_ERROR_CODE;

export class IdeaPlanStatusTransitionError extends Error {
  readonly code = IDEA_PLAN_STATUS_TRANSITION_ERROR_CODE;
  readonly from: IdeaPlanStatus;
  readonly to: IdeaPlanStatus;

  constructor(from: IdeaPlanStatus, to: IdeaPlanStatus) {
    super(`IdeaPlan status transition ${from} → ${to} is not allowed`);
    this.name = "IdeaPlanStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertIdeaPlanStatusTransitionAllowed(
  from: IdeaPlanStatus | string,
  to: IdeaPlanStatus | string
): void {
  const fromCanonical = typeof from === "string" ? normalizeIdeaPlanStatus(from) : from;
  const toCanonical = typeof to === "string" ? normalizeIdeaPlanStatus(to) : to;

  if (!fromCanonical) {
    throw new Error(`Unknown IdeaPlan status: ${String(from)}`);
  }
  if (!toCanonical) {
    throw new Error(`Unknown IdeaPlan status: ${String(to)}`);
  }
  if (!isIdeaPlanStatusTransitionAllowed(fromCanonical, toCanonical)) {
    throw new IdeaPlanStatusTransitionError(fromCanonical, toCanonical);
  }
}

export function enforceIdeaPlanStatusTransition(
  from: IdeaPlanStatus | string,
  to: IdeaPlanStatus | string
): IdeaPlanStatus {
  assertIdeaPlanStatusTransitionAllowed(from, to);
  const toCanonical = typeof to === "string" ? normalizeIdeaPlanStatus(to) : to;
  return toCanonical!;
}

export { parseIdeaPlanStatus };
