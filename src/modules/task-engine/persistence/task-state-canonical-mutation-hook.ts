import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskEntity } from "../types.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import type { TaskStore } from "./store.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";
import { commitCanonicalTaskStateEvents } from "./task-state-canonical-commit.js";
import { draftCreatedEvent, draftUpdatedEvent } from "./task-state-event-draft.js";

export async function finalizeCanonicalCreateTask(input: {
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  task: TaskEntity;
  commandName: string;
  clientMutationId?: string;
  actor?: string;
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }
  const event = draftCreatedEvent(input.task, {
    commandName: input.commandName,
    moduleId: "task-engine",
    actorId: input.actor,
    clientMutationId: input.clientMutationId,
    phaseKey: input.task.phaseKey
  });
  return commitCanonicalTaskStateEvents({
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    events: [event],
    policyApproval: input.policyApproval
  });
}

export async function finalizeCanonicalUpdateTask(input: {
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  task: TaskEntity;
  changedFields: string[];
  commandName: string;
  clientMutationId?: string;
  actor?: string;
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }
  const event = draftUpdatedEvent(
    input.task.id,
    input.changedFields,
    input.store,
    {
      commandName: input.commandName,
      moduleId: "task-engine",
      actorId: input.actor,
      clientMutationId: input.clientMutationId,
      phaseKey: input.task.phaseKey
    },
    {
      title: input.task.title,
      type: input.task.type,
      status: input.task.status,
      priority: input.task.priority,
      phase: input.task.phase,
      phaseKey: input.task.phaseKey,
      summary: input.task.summary,
      metadata: input.task.metadata
    }
  );
  return commitCanonicalTaskStateEvents({
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    events: [event],
    policyApproval: input.policyApproval
  });
}
