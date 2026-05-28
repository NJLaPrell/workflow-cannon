import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskEntity } from "../types.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import type { TaskStore } from "./store.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";
import { commitCanonicalTaskStateEvents } from "./task-state-canonical-commit.js";
import {
  draftCreatedTaskEvents,
  draftUpdatedEvent,
  taskUpdatedValuesForChangedFields
} from "./task-state-event-draft.js";

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
  const events = draftCreatedTaskEvents(input.task, {
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
    events,
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
  const values = taskUpdatedValuesForChangedFields(input.task, input.changedFields);
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
    values,
    input.ctx.workspacePath
  );
  return commitCanonicalTaskStateEvents({
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    events: [event],
    policyApproval: input.policyApproval
  });
}
