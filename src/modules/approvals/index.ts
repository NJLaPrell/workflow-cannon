import type { WorkflowModule } from "../../contracts/module-contract.js";
import { resolveActorWithFallback } from "../../core/policy.js";
import { runReviewItem } from "./review-runtime.js";

export const approvalsModule: WorkflowModule = {
  registration: {
    id: "approvals",
    version: "0.5.0",
    contractVersion: "1",
    capabilities: ["approvals"],
    dependsOn: ["task-engine"],
    enabledByDefault: true,
    config: {
      path: "src/modules/approvals/config.md",
      format: "md",
      description: "Approvals module policy and queue configuration contract."
    },
    state: {
      path: "src/modules/approvals/state.md",
      format: "md",
      description: "Approvals module decision and queue state contract."
    },
    instructions: {
      directory: "src/modules/approvals/instructions",
      entries: [
        {
          name: "review-item",
          file: "review-item.md",
          description: "Review and record an approval decision."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    if (command.name !== "review-item") {
      return {
        ok: false,
        code: "unsupported-command",
        message: `Approvals module does not support '${command.name}'`
      };
    }

    const args = command.args ?? {};
    const actor =
      typeof args.actor === "string" && args.actor.trim().length > 0
        ? args.actor.trim()
        : ctx.resolvedActor ?? (await resolveActorWithFallback(ctx.workspacePath, args, process.env));
    const taskId = typeof args.taskId === "string" ? args.taskId : "";
    const decision = args.decision as "accept" | "decline" | "accept_edited" | undefined;
    if (decision !== "accept" && decision !== "decline" && decision !== "accept_edited") {
      return {
        ok: false,
        code: "invalid-args",
        message: "decision must be accept, decline, or accept_edited"
      };
    }

    const editedSummary = typeof args.editedSummary === "string" ? args.editedSummary : undefined;
    let policyTraceRef: { operationId: string; timestamp: string } | undefined;
    const ptr = args.policyTraceRef;
    if (ptr && typeof ptr === "object" && !Array.isArray(ptr)) {
      const o = ptr as Record<string, unknown>;
      if (typeof o.operationId === "string" && typeof o.timestamp === "string") {
        policyTraceRef = { operationId: o.operationId, timestamp: o.timestamp };
      }
    }
    let configMutationRef: { timestamp: string; key: string } | undefined;
    const cmr = args.configMutationRef;
    if (cmr && typeof cmr === "object" && !Array.isArray(cmr)) {
      const o = cmr as Record<string, unknown>;
      if (typeof o.timestamp === "string" && typeof o.key === "string") {
        configMutationRef = { timestamp: o.timestamp, key: o.key };
      }
    }

    const result = await runReviewItem(
      ctx,
      {
        taskId,
        decision,
        editedSummary,
        policyTraceRef,
        configMutationRef
      },
      actor
    );

    return {
      ok: result.ok,
      code: result.code,
      message: result.message,
      data:
        "idempotent" in result && result.idempotent
          ? { idempotent: true }
          : undefined
    };
  }
};
