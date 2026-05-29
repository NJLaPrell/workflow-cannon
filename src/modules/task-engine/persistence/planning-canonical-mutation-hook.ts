import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { PlanningStateEventV1 } from "../task-state-events/planning-event-payloads.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import type { TaskStore } from "./store.js";
import { filterPlanningEventsByEnabledDomains } from "./planning-canonical-sync-domains.js";
import { commitCanonicalTaskStateEvents } from "./task-state-canonical-commit.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";

export async function commitCanonicalPlanningEvents(input: {
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  events: PlanningStateEventV1[];
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }
  const events = filterPlanningEventsByEnabledDomains(input.ctx, input.events);
  if (events.length === 0) {
    return null;
  }
  return commitCanonicalTaskStateEvents({
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    events: [],
    planningEvents: events,
    policyApproval: input.policyApproval
  });
}
