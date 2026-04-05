import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
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
import { readOptionalExpectedPlanningGeneration } from "../task-engine/mutation-utils.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../core/cli-remediation.js";

function pickExpectedPlanningGeneration(args: Record<string, unknown>): { expectedPlanningGeneration?: number } {
  const g = readOptionalExpectedPlanningGeneration(args);
  return g !== undefined ? { expectedPlanningGeneration: g } : {};
}

export { buildImprovementTaskPayload } from "./improvement-task-payload.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.9.1",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["improvement"],
    dependsOn: ["task-engine", "planning"],
    optionalPeers: ["documentation"],
    enabledByDefault: true,
    config: {
      path: "src/modules/improvement/config.md",
      format: "md",
      description: "Improvement module configuration contract."
    },
    instructions: {
      directory: "src/modules/improvement/instructions",
      entries: builtinInstructionEntriesForModule("improvement")
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
        const dryRun = args.dryRun === true;
        const transcriptsRoot = typeof args.transcriptsRoot === "string" ? args.transcriptsRoot : undefined;
        const fromTag = typeof args.fromTag === "string" ? args.fromTag : undefined;
        const toTag = typeof args.toTag === "string" ? args.toTag : undefined;
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: transcriptsRoot
        };
        try {
          if (dryRun) {
            const result = await runGenerateRecommendations(ctx, {
              transcriptsRoot,
              fromTag,
              toTag,
              dryRun: true,
              ...pickExpectedPlanningGeneration(args as Record<string, unknown>)
            });
            return {
              ok: true,
              code: "recommendations-rehearsal",
              message: `Dry run: ${result.simulatedCreates?.length ?? 0} would-create improvement task id(s); ${result.skipped} duplicate(s) skipped; ${result.candidates} candidate(s)`,
              data: {
                dryRun: true,
                syncSkipped: true,
                ...(result as unknown as Record<string, unknown>)
              } as Record<string, unknown>
            };
          }
          const state = await loadImprovementState(ctx.workspacePath, ctx.effectiveConfig as Record<string, unknown> | undefined);
          const sync = await runSyncTranscripts(ctx, syncArgs, state);
          state.lastSyncRunAt = new Date().toISOString();
          await saveImprovementState(ctx.workspacePath, state, ctx.effectiveConfig as Record<string, unknown> | undefined);
          const result = await runGenerateRecommendations(ctx, {
            transcriptsRoot: sync.archivePath,
            fromTag,
            toTag,
            ...pickExpectedPlanningGeneration(args as Record<string, unknown>)
          });
          return {
            ok: true,
            code: "recommendations-generated",
            message: `After sync (${sync.copied} copied): created ${result.created.length} improvement task(s); skipped ${result.skipped} duplicate(s)`,
            data: { sync, ...(result as unknown as Record<string, unknown>) } as Record<string, unknown>
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            ok: false,
            code: "generate-failed",
            message: msg,
            remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.generateRecommendations }
          };
        }
      },
      "sync-transcripts": async () => {
        const syncArgs: TranscriptSyncArgs = {
          sourcePath: typeof args.sourcePath === "string" ? args.sourcePath : undefined,
          archivePath: typeof args.archivePath === "string" ? args.archivePath : undefined
        };
        try {
          const state = await loadImprovementState(ctx.workspacePath, ctx.effectiveConfig as Record<string, unknown> | undefined);
          const sync = await runSyncTranscripts(ctx, syncArgs, state);
          state.lastSyncRunAt = new Date().toISOString();
          await saveImprovementState(ctx.workspacePath, state, ctx.effectiveConfig as Record<string, unknown> | undefined);
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
          const state = await loadImprovementState(ctx.workspacePath, ctx.effectiveConfig as Record<string, unknown> | undefined);
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
              transcriptsRoot: sync.archivePath,
              ...pickExpectedPlanningGeneration(args as Record<string, unknown>)
            });
            state.lastIngestRunAt = now.toISOString();
          }
          await saveImprovementState(ctx.workspacePath, state, ctx.effectiveConfig as Record<string, unknown> | undefined);
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
        const state = await loadImprovementState(ctx.workspacePath, ctx.effectiveConfig as Record<string, unknown> | undefined);
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
