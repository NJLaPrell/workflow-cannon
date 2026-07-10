import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { runFileBugReportCommand } from "./file-bug-report.js";
import { runSeedWcBugReporterCommand } from "./seed-wc-bug-reporter.js";
import {
  WC_BUG_REPORTER_ALLOWED_COMMANDS,
  WC_BUG_REPORTER_PREFERRED_MODEL,
  WC_BUG_REPORTER_SUBAGENT_ID
} from "./subagent-seed/wc-bug-reporter-seed.js";
import { listBugReporterHostAdapters } from "./adapters/index.js";

/**
 * Agent-driven bug reporting (I010 / Phase 148).
 * Ships `file-bug-report` (Tier C, proposed-only) + `seed-wc-bug-reporter`.
 * Host spawn adapters live under `./adapters` (Cursor + CLI implemented; stubs documented).
 */
export const agentBugReportingModule: WorkflowModule = {
  registration: {
    id: "agent-bug-reporting",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["improvement"],
    dependsOn: ["task-engine", "subagents"],
    optionalPeers: ["skills", "context-activation", "approvals"],
    enabledByDefault: true,
    config: {
      path: "src/modules/agent-bug-reporting/config.md",
      format: "md",
      description:
        "Agent bug-reporting: file-bug-report, wc-bug-reporter seed, and host-agnostic spawn adapters."
    },
    instructions: {
      directory: "src/modules/agent-bug-reporting/instructions",
      entries: [
        ...builtinInstructionEntriesForModule("agent-bug-reporting"),
        {
          name: "agent-bug-reporting-overview",
          file: "agent-bug-reporting-overview.md",
          description:
            "Module overview for agent-bug-reporting (file-bug-report, seed, spawn adapters)."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    if (command.name === "file-bug-report") {
      return runFileBugReportCommand(ctx, command.args ?? {});
    }

    if (command.name === "seed-wc-bug-reporter") {
      return runSeedWcBugReporterCommand(ctx, command.args ?? {});
    }

    if (command.name === "agent-bug-reporting-overview") {
      const hosts = listBugReporterHostAdapters().map((a) => ({
        hostId: a.hostId,
        maturity: a.maturity
      }));
      return {
        ok: true,
        code: "agent-bug-reporting-overview",
        message:
          "agent-bug-reporting module is registered; use file-bug-report / seed-wc-bug-reporter; spawn via adapters",
        data: {
          responseSchemaVersion: 1,
          moduleId: "agent-bug-reporting",
          version: "0.1.0",
          dependsOn: ["task-engine", "subagents"],
          optionalPeers: ["skills", "context-activation", "approvals"],
          shippedManifestCommands: ["file-bug-report", "seed-wc-bug-reporter"],
          pendingCommands: [],
          wcBugReporter: {
            subagentId: WC_BUG_REPORTER_SUBAGENT_ID,
            preferredModel: WC_BUG_REPORTER_PREFERRED_MODEL,
            allowedCommands: [...WC_BUG_REPORTER_ALLOWED_COMMANDS]
          },
          hostAdapters: hosts
        }
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `agent-bug-reporting does not implement ${command.name}`
    };
  }
};

export {
  WC_BUG_REPORTER_SEED,
  WC_BUG_REPORTER_SUBAGENT_ID,
  WC_BUG_REPORTER_PREFERRED_MODEL,
  buildWcBugReporterRegisterArgs,
  buildSeedWcBugReporterPayload
} from "./subagent-seed/wc-bug-reporter-seed.js";
export {
  resolveBugReporterSpawnPlan,
  listBugReporterHostAdapters,
  getBugReporterHostAdapter,
  buildCliFilingPlan,
  buildCursorSpawnPlan
} from "./adapters/index.js";
