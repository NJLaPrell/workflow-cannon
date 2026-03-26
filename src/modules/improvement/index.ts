import type { WorkflowModule } from "../../contracts/module-contract.js";
import { queryLineageChain } from "../../core/lineage-store.js";
import { runGenerateRecommendations } from "./generate-recommendations-runtime.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.5.0",
    contractVersion: "1",
    capabilities: ["improvement"],
    dependsOn: ["task-engine", "planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/improvement/config.md",
      format: "md",
      description: "Improvement module configuration contract."
    },
    state: {
      path: "src/modules/improvement/state.md",
      format: "md",
      description: "Improvement module recommendation state contract."
    },
    instructions: {
      directory: "src/modules/improvement/instructions",
      entries: [
        {
          name: "generate-recommendations",
          file: "generate-recommendations.md",
          description: "Produce evidence-backed workflow recommendations."
        },
        {
          name: "query-lineage",
          file: "query-lineage.md",
          description: "Reconstruct lineage chain for a recommendation task id."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};

    if (command.name === "generate-recommendations") {
      const transcriptsRoot =
        typeof args.transcriptsRoot === "string" ? args.transcriptsRoot : undefined;
      const fromTag = typeof args.fromTag === "string" ? args.fromTag : undefined;
      const toTag = typeof args.toTag === "string" ? args.toTag : undefined;

      try {
        const result = await runGenerateRecommendations(ctx, { transcriptsRoot, fromTag, toTag });
        return {
          ok: true,
          code: "recommendations-generated",
          message: `Created ${result.created.length} improvement task(s); skipped ${result.skipped} duplicate(s)`,
          data: result as unknown as Record<string, unknown>
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, code: "generate-failed", message: msg };
      }
    }

    if (command.name === "query-lineage") {
      const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
      if (!taskId) {
        return { ok: false, code: "invalid-args", message: "query-lineage requires taskId" };
      }
      const chain = await queryLineageChain(ctx.workspacePath, taskId);
      return {
        ok: true,
        code: "lineage-queried",
        message: `${chain.events.length} lineage event(s) for ${taskId}`,
        data: chain as unknown as Record<string, unknown>
      };
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Improvement module does not support '${command.name}'`
    };
  }
};
