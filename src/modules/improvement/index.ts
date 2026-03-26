import type { WorkflowModule } from "../../contracts/module-contract.js";
import { queryLineageChain } from "../../core/lineage-store.js";
import { runGenerateRecommendations } from "./generate-recommendations-runtime.js";
import {
  resolveCadenceDecision,
  runSyncTranscripts,
  type TranscriptSyncArgs
} from "./transcript-sync-runtime.js";
import { loadImprovementState, saveImprovementState } from "./improvement-state.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.7.0",
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
        },
        {
          name: "sync-transcripts",
          file: "sync-transcripts.md",
          description: "Sync local transcript JSONL files into the archive."
        },
        {
          name: "ingest-transcripts",
          file: "ingest-transcripts.md",
          description: "Run transcript sync and recommendation generation in one flow."
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

    if (command.name === "sync-transcripts") {
      const syncArgs: TranscriptSyncArgs = {
        sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
        archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
      };
      try {
        const sync = await runSyncTranscripts(ctx, syncArgs);
        const state = await loadImprovementState(ctx.workspacePath);
        state.lastSyncRunAt = new Date().toISOString();
        await saveImprovementState(ctx.workspacePath, state);
        return {
          ok: true,
          code: "transcripts-synced",
          message: `Copied ${sync.copied} transcript file(s); skipped ${sync.skippedExisting} existing`,
          data: sync as unknown as Record<string, unknown>
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, code: "sync-failed", message: msg };
      }
    }

    if (command.name === "ingest-transcripts") {
      const syncArgs: TranscriptSyncArgs = {
        sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
        archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
      };
      const now = new Date();
      try {
        const sync = await runSyncTranscripts(ctx, syncArgs);
        const state = await loadImprovementState(ctx.workspacePath);
        const improvement =
          ctx.effectiveConfig?.improvement && typeof ctx.effectiveConfig.improvement === "object"
            ? (ctx.effectiveConfig.improvement as Record<string, unknown>)
            : {};
        const cadence =
          improvement.cadence && typeof improvement.cadence === "object"
            ? (improvement.cadence as Record<string, unknown>)
            : {};
        const minIntervalMinutes =
          typeof cadence.minIntervalMinutes === "number" && Number.isFinite(cadence.minIntervalMinutes)
            ? Math.max(1, Math.floor(cadence.minIntervalMinutes))
            : 15;
        const skipIfNoNewTranscripts =
          typeof cadence.skipIfNoNewTranscripts === "boolean"
            ? cadence.skipIfNoNewTranscripts
            : true;
        const cadenceDecision = resolveCadenceDecision(
          now,
          state.lastIngestRunAt,
          minIntervalMinutes,
          sync.copied,
          skipIfNoNewTranscripts
        );
        state.lastSyncRunAt = now.toISOString();
        const generate =
          cadenceDecision.shouldRunGenerate || args.forceGenerate === true || args.runGenerate === true;
        let recommendations: { created: string[]; skipped: number; candidates: number } | null = null;
        if (generate) {
          recommendations = await runGenerateRecommendations(ctx, {
            transcriptsRoot: sync.archivePath
          });
          state.lastIngestRunAt = now.toISOString();
        }
        await saveImprovementState(ctx.workspacePath, state);
        const status = generate ? "generated" : "skipped";
        return {
          ok: true,
          code: "transcripts-ingested",
          message: `Ingest ${status}; sync copied ${sync.copied} file(s)`,
          data: {
            sync,
            cadence: {
              minIntervalMinutes,
              skipIfNoNewTranscripts,
              decision: cadenceDecision.reason
            },
            generatedRecommendations: recommendations
          } as Record<string, unknown>
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, code: "ingest-failed", message: msg };
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
