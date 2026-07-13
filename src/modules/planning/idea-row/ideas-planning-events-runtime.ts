import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { PlanningStateEventV1 } from "../../task-engine/task-state-events/planning-event-payloads.js";
import { commitCanonicalPlanningEvents } from "../../task-engine/persistence/planning-canonical-mutation-hook.js";
import type { OpenedPlanningStores } from "../../task-engine/persistence/planning-open.js";
import type { TaskStore } from "../../task-engine/persistence/store.js";
import { isGitTaskStateCanonicalAuthority } from "../../task-engine/persistence/task-state-canonical-authority.js";

export async function publishIdeasPlanningEvents(input: {
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  events: PlanningStateEventV1[];
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }
  const canonical = await commitCanonicalPlanningEvents({
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    events: input.events,
    policyApproval: input.policyApproval
  });
  if (canonical && !canonical.ok) {
    return canonical;
  }
  if (canonical !== null) {
    await input.store.load();
  }
  return null;
}
