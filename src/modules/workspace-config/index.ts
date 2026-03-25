import type { ConfigRegistryView, WorkflowModule } from "../../contracts/module-contract.js";
import {
  explainConfigPath,
  resolveWorkspaceConfigWithLayers
} from "../../core/workspace-kit-config.js";

async function handleExplainConfig(
  args: Record<string, unknown>,
  ctx: { workspacePath: string; registry: ConfigRegistryView }
): Promise<{
  ok: boolean;
  code: string;
  message?: string;
  data?: Record<string, unknown>;
}> {
  const pathArg = typeof args.path === "string" ? args.path.trim() : "";
  if (!pathArg) {
    return {
      ok: false,
      code: "invalid-config-path",
      message: "explain-config requires string 'path' (dot-separated, e.g. tasks.storeRelativePath)"
    };
  }

  const invocationConfig =
    typeof args.config === "object" && args.config !== null && !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : {};

  const { layers } = await resolveWorkspaceConfigWithLayers({
    workspacePath: ctx.workspacePath,
    registry: ctx.registry,
    invocationConfig
  });

  const explained = explainConfigPath(pathArg, layers);
  return {
    ok: true,
    code: "config-explained",
    data: explained as unknown as Record<string, unknown>
  };
}

export const workspaceConfigModule: WorkflowModule = {
  registration: {
    id: "workspace-config",
    version: "0.4.0",
    contractVersion: "1",
    capabilities: ["diagnostics"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/workspace-config/config.md",
      format: "md",
      description: "Workspace config registry and explain surface."
    },
    state: {
      path: "src/modules/workspace-config/state.md",
      format: "md",
      description: "Workspace config module runtime state (none)."
    },
    instructions: {
      directory: "src/modules/workspace-config/instructions",
      entries: [
        {
          name: "explain-config",
          file: "explain-config.md",
          description: "Agent-first JSON: effective config value and winning layer for a dotted path."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    if (command.name !== "explain-config") {
      return { ok: false, code: "unknown-command", message: "workspace-config only implements explain-config" };
    }
    const reg = ctx.moduleRegistry;
    if (!reg) {
      return {
        ok: false,
        code: "internal-error",
        message: "explain-config requires moduleRegistry on context (CLI wiring)"
      };
    }
    return handleExplainConfig(command.args ?? {}, {
      workspacePath: ctx.workspacePath,
      registry: reg
    });
  }
};
