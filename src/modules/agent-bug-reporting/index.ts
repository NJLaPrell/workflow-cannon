import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";

/**
 * Scaffold for agent-driven bug reporting (I010 / Phase 148).
 * No shipped run-command manifest rows yet — T100856 owns `file-bug-report`.
 * A non-manifest overview instruction keeps instructions/ non-orphan and surfaces the
 * module in `wk run --list-commands` without tripping AGENT-CLI-MAP / snippet gates.
 * R102: no direct sibling-module imports — peers via dependsOn / optionalPeers only.
 *
 * Note: `ModuleCapability` has no agent-bug-reporting variant yet (would require editing
 * src/contracts/module-contract.ts outside this task's owned paths); use improvement until then.
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
        "Agent bug-reporting scaffold: CAE-nudged reporters file evidence-backed improvement tasks via task-engine/subagents."
    },
    instructions: {
      directory: "src/modules/agent-bug-reporting/instructions",
      entries: [
        ...builtinInstructionEntriesForModule("agent-bug-reporting"),
        {
          name: "agent-bug-reporting-overview",
          file: "agent-bug-reporting-overview.md",
          description:
            "Module overview placeholder until file-bug-report (T100856) registers a shipped run command."
        }
      ]
    }
  },

  async onCommand(command) {
    if (command.name === "agent-bug-reporting-overview") {
      return {
        ok: true,
        code: "agent-bug-reporting-overview",
        message:
          "agent-bug-reporting module is registered; file-bug-report ships in a follow-on task",
        data: {
          responseSchemaVersion: 1,
          moduleId: "agent-bug-reporting",
          version: "0.1.0",
          dependsOn: ["task-engine", "subagents"],
          optionalPeers: ["skills", "context-activation", "approvals"],
          shippedManifestCommands: [],
          pendingCommands: ["file-bug-report"]
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
