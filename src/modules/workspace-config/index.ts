import type { ConfigRegistryView, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { CONFIG_FACET_IDS, listKeysForConfigFacet } from "../../core/config-facets.js";
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
  const facetRaw = typeof args.facet === "string" ? args.facet.trim() : "";

  if (pathArg && facetRaw) {
    return {
      ok: false,
      code: "invalid-config-path",
      message: "explain-config: pass either 'path' or 'facet', not both"
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

  if (facetRaw) {
    const keys = listKeysForConfigFacet(facetRaw);
    if (!keys || keys.length === 0) {
      return {
        ok: false,
        code: "invalid-config-facet",
        message: `explain-config: unknown or empty facet '${facetRaw}'. Use one of: ${CONFIG_FACET_IDS.join(", ")}`
      };
    }
    const entries = keys.map((keyPath) => ({
      path: keyPath,
      ...(explainConfigPath(keyPath, layers) as Record<string, unknown>)
    }));
    return {
      ok: true,
      code: "config-explained",
      data: {
        facet: facetRaw,
        facetKeys: keys,
        entries,
        count: entries.length
      }
    };
  }

  if (!pathArg) {
    return {
      ok: false,
      code: "invalid-config-path",
      message:
        "explain-config requires string 'path' (e.g. tasks.storeRelativePath) or string 'facet' (e.g. tasks, planning)"
    };
  }

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
