import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { runFileBugReportCommand } from "./file-bug-report.js";

/**
 * Agent-driven bug reporting (I010 / Phase 148).
 * Ships `file-bug-report` (Tier C, proposed-only). R102 note: create path is reached
 * via dependsOn task-engine helpers (same pattern as improvement/ideas), not a new store.
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
        "Agent bug-reporting: Tier C file-bug-report files evidence-backed proposed improvements via task-engine."
    },
    instructions: {
      directory: "src/modules/agent-bug-reporting/instructions",
      entries: [
        ...builtinInstructionEntriesForModule("agent-bug-reporting"),
        {
          name: "agent-bug-reporting-overview",
          file: "agent-bug-reporting-overview.md",
          description:
            "Module overview for agent-bug-reporting (file-bug-report is the shipped run command)."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    if (command.name === "file-bug-report") {
      return runFileBugReportCommand(ctx, command.args ?? {});
    }

    if (command.name === "agent-bug-reporting-overview") {
      return {
        ok: true,
        code: "agent-bug-reporting-overview",
        message: "agent-bug-reporting module is registered; use file-bug-report to file proposed improvements",
        data: {
          responseSchemaVersion: 1,
          moduleId: "agent-bug-reporting",
          version: "0.1.0",
          dependsOn: ["task-engine", "subagents"],
          optionalPeers: ["skills", "context-activation", "approvals"],
          shippedManifestCommands: ["file-bug-report"],
          pendingCommands: []
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
