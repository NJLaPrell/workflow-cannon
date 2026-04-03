import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import type { WkNode } from "./build-task-tree.js";
import {
  TASKS_TREE_DND_MIME,
  describeDropTarget,
  isTaskDragSource,
  phaseMutationAllowed,
  transitionActionForTargetStatus,
  type TaskDragPayload
} from "./task-tree-dnd.js";

async function promptPolicyRationale(context: string): Promise<string | undefined> {
  return (
    (await vscode.window.showInputBox({
      prompt: `Policy rationale (${context})`,
      placeHolder: "Shown in policy trace / approval"
    })) ?? undefined
  );
}

export class TasksTreeDragController implements vscode.TreeDragAndDropController<WkNode> {
  readonly dragMimeTypes = [TASKS_TREE_DND_MIME];
  readonly dropMimeTypes = [TASKS_TREE_DND_MIME];

  constructor(
    private readonly client: CommandClient,
    private readonly onKitStateChanged: () => void
  ) {}

  async handleDrag(
    source: readonly WkNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (source.length !== 1 || !isTaskDragSource(source[0]!)) {
      return;
    }
    const t = source[0]!.task;
    const payload: TaskDragPayload = { taskId: t.id, status: t.status };
    dataTransfer.set(TASKS_TREE_DND_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  async handleDrop(
    target: WkNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const raw = await dataTransfer.get(TASKS_TREE_DND_MIME)?.asString();
    if (!raw) {
      return;
    }
    let payload: TaskDragPayload;
    try {
      payload = JSON.parse(raw) as TaskDragPayload;
    } catch {
      void vscode.window.showErrorMessage("Task drag payload was not valid JSON.");
      return;
    }
    if (!payload.taskId || !payload.status) {
      void vscode.window.showErrorMessage("Task drag payload missing taskId/status.");
      return;
    }

    const drop = describeDropTarget(target);
    if (drop.kind === "invalid") {
      void vscode.window.showWarningMessage(drop.reason);
      return;
    }

    if (drop.kind === "phase") {
      if (!phaseMutationAllowed(drop.parentSegment)) {
        void vscode.window.showWarningMessage("Cannot change phase for tasks under completed/cancelled.");
        return;
      }
      const ok = await vscode.window.showWarningMessage(
        drop.phaseKey === null
          ? `Clear phase fields on ${payload.taskId}?`
          : `Assign phase key '${drop.phaseKey}' to ${payload.taskId}?`,
        { modal: true },
        "Apply"
      );
      if (ok !== "Apply") {
        return;
      }
      if (drop.phaseKey === null) {
        const r = await this.client.run("clear-task-phase", {
          taskId: payload.taskId
        });
        if (!r.ok) {
          void vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
        } else {
          this.onKitStateChanged();
        }
        return;
      }
      const r = await this.client.run("assign-task-phase", {
        taskId: payload.taskId,
        phaseKey: drop.phaseKey
      });
      if (!r.ok) {
        void vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      } else {
        this.onKitStateChanged();
      }
      return;
    }

    if (drop.status === payload.status) {
      void vscode.window.showInformationMessage(`${payload.taskId} is already in status '${drop.status}'.`);
      return;
    }
    const action = transitionActionForTargetStatus(payload.status, drop.status);
    if (!action) {
      void vscode.window.showWarningMessage(
        `No allowed transition from '${payload.status}' to '${drop.status}' for ${payload.taskId}.`
      );
      return;
    }

    const ok = await vscode.window.showWarningMessage(
      `Apply transition '${action}' on ${payload.taskId} (→ ${drop.status})?`,
      { modal: true },
      "Apply"
    );
    if (ok !== "Apply") {
      return;
    }
    const rationale = (await promptPolicyRationale(`run-transition ${action}`)) ?? "vscode-extension-dnd";
    const r = await this.client.run("run-transition", {
      taskId: payload.taskId,
      action,
      policyApproval: { confirmed: true, rationale }
    });
    if (!r.ok) {
      void vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
    } else {
      this.onKitStateChanged();
    }
  }
}
