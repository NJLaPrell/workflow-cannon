import type { ConfigRegistryView, WorkflowModule } from "../../contracts/module-contract.js";
import {
  explainConfigPath,
  normalizeConfigForExport,
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

async function handleResolveConfig(
  args: Record<string, unknown>,
  ctx: { workspacePath: string; registry: ConfigRegistryView }
): Promise<{
  ok: boolean;
  code: string;
  message?: string;
  data?: Record<string, unknown>;
}> {
  const invocationConfig =
    typeof args.config === "object" && args.config !== null && !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : {};

  const { effective, layers } = await resolveWorkspaceConfigWithLayers({
    workspacePath: ctx.workspacePath,
    registry: ctx.registry,
    invocationConfig
  });

  return {
    ok: true,
    code: "config-resolved",
    data: {
      effective: normalizeConfigForExport(effective) as Record<string, unknown>,
      layers: layers.map((l) => ({ id: l.id }))
    }
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
        },
        {
          name: "resolve-config",
          file: "resolve-config.md",
          description: "Agent-first JSON: full effective config (sorted) and merge layer ids."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    const reg = ctx.moduleRegistry;
    if (!reg) {
      return {
        ok: false,
        code: "internal-error",
        message: "workspace-config requires moduleRegistry on context (CLI wiring)"
      };
    }
    const baseCtx = { workspacePath: ctx.workspacePath, registry: reg };

    if (command.name === "explain-config") {
      return handleExplainConfig(command.args ?? {}, baseCtx);
    }
    if (command.name === "resolve-config") {
      return handleResolveConfig(command.args ?? {}, baseCtx);
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `workspace-config: unknown command '${command.name}'`
    };
  }
};
