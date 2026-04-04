import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";

import type { ConfigRegistryView, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  catalogEntryForTier,
  RPG_PARTY_CATALOG,
  RPG_PARTY_PROFILE_SET_ID,
  resolveAgentGuidanceFromEffectiveConfig
} from "../../core/agent-guidance-catalog.js";
import { CONFIG_FACET_IDS, listKeysForConfigFacet } from "../../core/config-facets.js";
import {
  explainConfigPath,
  normalizeConfigForExport,
  readProjectConfigDocument,
  resolveWorkspaceConfigWithLayers,
  writeProjectConfigDocument
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

async function handleResolveAgentGuidance(
  args: Record<string, unknown>,
  ctx: { workspacePath: string; registry: ConfigRegistryView }
): Promise<{ ok: boolean; code: string; message?: string; data?: Record<string, unknown> }> {
  const invocationConfig =
    typeof args.config === "object" && args.config !== null && !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : {};

  const { effective } = await resolveWorkspaceConfigWithLayers({
    workspacePath: ctx.workspacePath,
    registry: ctx.registry,
    invocationConfig
  });

  const resolved = resolveAgentGuidanceFromEffectiveConfig(effective as Record<string, unknown>);
  return {
    ok: true,
    code: "agent-guidance-resolved",
    data: resolved as unknown as Record<string, unknown>
  };
}

async function promptTierInteractive(): Promise<number | undefined> {
  const rl = createInterface({ input: processStdin, output: processStdout });
  try {
    processStdout.write("Choose agent guidance tier (1–5):\n");
    for (const e of RPG_PARTY_CATALOG) {
      processStdout.write(`  ${e.tier}. ${e.label} — ${e.description}\n`);
    }
    const line = (await rl.question("Enter tier number: ")).trim();
    const n = Number(line);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return undefined;
    }
    return n;
  } finally {
    rl.close();
  }
}

async function handleSetAgentGuidance(
  args: Record<string, unknown>,
  ctx: { workspacePath: string; registry: ConfigRegistryView }
): Promise<{ ok: boolean; code: string; message?: string; data?: Record<string, unknown> }> {
  let tier: number | undefined = typeof args.tier === "number" ? args.tier : undefined;
  if (args.interactive === true) {
    tier = await promptTierInteractive();
  }
  if (tier === undefined || !Number.isInteger(tier) || tier < 1 || tier > 5) {
    return {
      ok: false,
      code: "invalid-args",
      message: "set-agent-guidance requires integer tier 1–5, or interactive:true with valid stdin choice"
    };
  }

  const entry = catalogEntryForTier(tier);
  if (!entry) {
    return { ok: false, code: "invalid-args", message: `Unknown tier ${tier}` };
  }

  const doc = await readProjectConfigDocument(ctx.workspacePath);
  const next: Record<string, unknown> = { ...doc };
  const kitBase =
    doc.kit && typeof doc.kit === "object" && doc.kit !== null && !Array.isArray(doc.kit)
      ? { ...(doc.kit as Record<string, unknown>) }
      : {};
  kitBase.agentGuidance = {
    profileSetId: RPG_PARTY_PROFILE_SET_ID,
    tier: entry.tier,
    displayLabel: entry.label
  };
  next.kit = kitBase;

  await writeProjectConfigDocument(ctx.workspacePath, next);

  return {
    ok: true,
    code: "agent-guidance-set",
    message: `Persisted kit.agentGuidance tier ${entry.tier} (${entry.label})`,
    data: {
      profileSetId: RPG_PARTY_PROFILE_SET_ID,
      tier: entry.tier,
      displayLabel: entry.label
    }
  };
}

export const workspaceConfigModule: WorkflowModule = {
  registration: {
    id: "workspace-config",
    version: "0.7.0",
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
      "resolve-config": () => handleResolveConfig(command.args ?? {}, baseCtx),
      "resolve-agent-guidance": () => handleResolveAgentGuidance(command.args ?? {}, baseCtx),
      "set-agent-guidance": () => handleSetAgentGuidance(command.args ?? {}, baseCtx)
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
