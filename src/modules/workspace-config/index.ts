import type { ConfigRegistryView, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
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
    stateSchema: 1,
    capabilities: ["diagnostics"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/workspace-config/config.md",
      format: "md",
      description: "Workspace config registry and explain surface."
    },
    instructions: {
      directory: "src/modules/workspace-config/instructions",
      entries: builtinInstructionEntriesForModule("workspace-config")
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
    const handlers: Record<string, () => Promise<{ ok: boolean; code: string; message?: string; data?: Record<string, unknown> }>> = {
      "explain-config": () => handleExplainConfig(command.args ?? {}, baseCtx),
      "resolve-config": () => handleResolveConfig(command.args ?? {}, baseCtx)
    };
    const handler = handlers[command.name];
    if (handler) return handler();

    return {
      ok: false,
      code: "unknown-command",
      message: `workspace-config: unknown command '${command.name}'`
    };
  }
};
