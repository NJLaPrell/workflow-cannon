import type { WorkflowModule } from "../../contracts/module-contract.js";
import { queryLineageChain } from "../../core/lineage-store.js";
import { resolveSessionId } from "../../core/session-policy.js";
import {
  getMaxRecommendationCandidatesPerRun,
  runGenerateRecommendations
} from "./generate-recommendations-runtime.js";
import {
  resolveCadenceDecision,
  resolveImprovementTranscriptConfig,
  runSyncTranscripts,
  type TranscriptSyncArgs
} from "./transcript-sync-runtime.js";
import { loadImprovementState, saveImprovementState } from "./improvement-state.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.8.0",
    contractVersion: "1",
    stateSchema: 1,
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
        },
        {
          name: "transcript-automation-status",
          file: "transcript-automation-status.md",
          description: "Emit stable JSON status for transcript sync, ingest, and retry queue."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const handlers: Record<string, () => Promise<{
      ok: boolean;
      code: string;
      message?: string;
      data?: Record<string, unknown>;
    }>> = {
      "generate-recommendations": async () => {
        const transcriptsRoot = typeof args.transcriptsRoot === "string" ? args.transcriptsRoot : undefined;
        const fromTag = typeof args.fromTag === "string" ? args.fromTag : undefined;
        const toTag = typeof args.toTag === "string" ? args.toTag : undefined;
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: transcriptsRoot
        };
        try {
          const state = await loadImprovementState(ctx.workspacePath);
          const sync = await runSyncTranscripts(ctx, syncArgs, state);
          state.lastSyncRunAt = new Date().toISOString();
          await saveImprovementState(ctx.workspacePath, state);
          const result = await runGenerateRecommendations(ctx, {
            transcriptsRoot: sync.archivePath,
            fromTag,
            toTag
          });
          return {
            ok: true,
            code: "recommendations-generated",
            message: `After sync (${sync.copied} copied): created ${result.created.length} improvement task(s); skipped ${result.skipped} duplicate(s)`,
            data: { sync, ...(result as unknown as Record<string, unknown>) } as Record<string, unknown>
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, code: "generate-failed", message: msg };
        }
      },
      "sync-transcripts": async () => {
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
        };
        try {
          const state = await loadImprovementState(ctx.workspacePath);
          const sync = await runSyncTranscripts(ctx, syncArgs, state);
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
      },
      "ingest-transcripts": async () => {
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
        };
        const now = new Date();
        try {
          const state = await loadImprovementState(ctx.workspacePath);
          const sync = await runSyncTranscripts(ctx, syncArgs, state);
          const cfg = resolveImprovementTranscriptConfig(ctx, syncArgs);
          const cadenceDecision = resolveCadenceDecision(
            now,
            state.lastIngestRunAt,
            cfg.minIntervalMinutes,
            sync.copied,
            cfg.skipIfNoNewTranscripts
          );
          state.lastSyncRunAt = now.toISOString();
          const generate =
            cadenceDecision.shouldRunGenerate || args.forceGenerate === true || args.runGenerate === true;
          let recommendations: Awaited<ReturnType<typeof runGenerateRecommendations>> | null = null;
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
                minIntervalMinutes: cfg.minIntervalMinutes,
                skipIfNoNewTranscripts: cfg.skipIfNoNewTranscripts,
                decision: cadenceDecision.reason
              },
              generatedRecommendations: recommendations
            } as Record<string, unknown>
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, code: "ingest-failed", message: msg };
        }
      },
      "transcript-automation-status": async () => {
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
        };
        const state = await loadImprovementState(ctx.workspacePath);
        const cfg = resolveImprovementTranscriptConfig(ctx, syncArgs);
        return {
          ok: true,
          code: "transcript-automation-status",
          message: "Transcript automation status",
          data: {
            schemaVersion: 1,
            lastSyncRunAt: state.lastSyncRunAt,
            lastIngestRunAt: state.lastIngestRunAt,
            cadence: {
              minIntervalMinutes: cfg.minIntervalMinutes,
              skipIfNoNewTranscripts: cfg.skipIfNoNewTranscripts,
              maxRecommendationCandidatesPerRun: getMaxRecommendationCandidatesPerRun(ctx)
            },
            transcripts: {
              sourcePath: cfg.sourcePath || null,
              archivePath: cfg.archivePath,
              discoveryPaths: cfg.discoveryPaths,
              budgets: {
                maxFilesPerSync: cfg.maxFilesPerSync,
                maxBytesPerFile: cfg.maxBytesPerFile,
                maxTotalScanBytes: cfg.maxTotalScanBytes
              }
            },
            retryQueue: {
              pending: state.transcriptRetryQueue?.length ?? 0,
              entries: state.transcriptRetryQueue ?? []
            },
            policySession: {
              sessionId: resolveSessionId(process.env)
            }
          }
        };
      },
      "query-lineage": async () => {
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
    };
    const handler = handlers[command.name];
    if (handler) return handler();

    return {
      ok: false,
      code: "unsupported-command",
      message: `Improvement module does not support '${command.name}'`
    };
  }
};
