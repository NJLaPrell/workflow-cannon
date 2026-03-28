import fs from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import path from "node:path";
import { ModuleRegistry } from "./module-registry.js";
import {
  pickModuleContractWorkspacePath,
  resolveRegistryAndConfig
} from "./module-registry-resolve.js";
import {
  appendPolicyTrace,
  parsePolicyApprovalFromEnv,
  resolveActorWithFallback
} from "./policy.js";
import {
  appendConfigMutation,
  summarizeForEvidence
} from "./config-mutations.js";
import {
  assertWritableKey,
  getConfigKeyMetadata,
  listConfigMetadata,
  validatePersistedConfigDocument,
  validateValueForMetadata
} from "./config-metadata.js";
import {
  explainConfigPath,
  getAtPath,
  getProjectConfigPath,
  getUserConfigFilePath,
  resolveWorkspaceConfigWithLayers,
  stableStringifyConfig
} from "./workspace-kit-config.js";
import { defaultRegistryModules } from "../modules/index.js";

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION_FAILURE = 1;
const EXIT_USAGE_ERROR = 2;
const EXIT_INTERNAL_ERROR = 3;

function cloneCfg(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

function setDeep(
  root: Record<string, unknown>,
  dotted: string,
  value: unknown
): Record<string, unknown> {
  const out = cloneCfg(root);
  const parts = dotted.split(".").filter(Boolean);
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === undefined || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

function unsetDeep(root: Record<string, unknown>, dotted: string): Record<string, unknown> {
  const out = cloneCfg(root);
  const parts = dotted.split(".").filter(Boolean);
  if (parts.length === 0) return out;
  const parents: Record<string, unknown>[] = [out];
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === undefined || typeof next !== "object" || Array.isArray(next)) {
      return out;
    }
    cur = next as Record<string, unknown>;
    parents.push(cur);
  }
  const leaf = parts[parts.length - 1];
  delete cur[leaf];
  // Prune empty objects bottom-up
  for (let i = parents.length - 1; i >= 1; i--) {
    const childKey = parts[i - 1];
    const parent = parents[i - 1];
    const child = parent[childKey];
    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      Object.keys(child as object).length === 0
    ) {
      delete parent[childKey];
    }
  }
  return out;
}

async function readJsonFileOrEmpty(fp: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`invalid JSON object: ${fp}`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {};
    }
    throw e;
  }
}

async function writeConfigFileAtomic(fp: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, stableStringifyConfig(data), "utf8");
  await fs.rename(tmp, fp);
}

function buildRegistry(workspacePath: string): ModuleRegistry {
  return new ModuleRegistry(defaultRegistryModules, {
    workspacePath: pickModuleContractWorkspacePath(workspacePath)
  });
}

export type ConfigCliIo = {
  writeLine: (s: string) => void;
  writeError: (s: string) => void;
};

function parseConfigArgs(argv: string[]): { json: boolean; parts: string[] } {
  const json = argv.includes("--json");
  const parts = argv.filter((a) => a !== "--json");
  return { json, parts };
}

async function requireConfigApproval(
  cwd: string,
  commandLabel: string,
  writeError: (s: string) => void
): Promise<{ rationale: string } | null> {
  const approval = parsePolicyApprovalFromEnv(process.env);
  if (!approval) {
    writeError(
      `${commandLabel} (cli.config-mutate) requires WORKSPACE_KIT_POLICY_APPROVAL with JSON {"confirmed":true,"rationale":"..."}. See docs/maintainers/POLICY-APPROVAL.md.`
    );
    await appendPolicyTrace(cwd, {
      timestamp: new Date().toISOString(),
      operationId: "cli.config-mutate",
      command: commandLabel,
      actor: await resolveActorWithFallback(cwd, {}, process.env),
      allowed: false,
      message: "missing WORKSPACE_KIT_POLICY_APPROVAL"
    });
    return null;
  }
  return approval;
}

export async function generateConfigReferenceDocs(workspacePath: string): Promise<void> {
  const meta = listConfigMetadata({ exposure: "maintainer" });
  const aiPath = path.join(workspacePath, ".ai", "CONFIG.md");
  const humanPath = path.join(workspacePath, "docs", "maintainers", "CONFIG.md");
  const lines = (audience: "ai" | "human"): string[] => {
    const out: string[] = [
      `# Config reference (${audience})`,
      "",
      "Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.",
      "",
      "| Key | Type | Default | Scope | Module | Exposure | Sensitive | Approval |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |"
    ];
    for (const m of meta) {
      out.push(
        `| ${m.key} | ${m.type} | ${JSON.stringify(m.default)} | ${m.domainScope} | ${m.owningModule} | ${m.exposure} | ${m.sensitive} | ${m.requiresApproval} |`
      );
      out.push("");
      out.push(`**Description:** ${m.description}`);
      out.push("");
    }
    return out;
  };
  await fs.mkdir(path.dirname(aiPath), { recursive: true });
  await fs.mkdir(path.dirname(humanPath), { recursive: true });
  await fs.writeFile(aiPath, lines("ai").join("\n") + "\n", "utf8");
  await fs.writeFile(humanPath, lines("human").join("\n") + "\n", "utf8");
}

export async function runWorkspaceConfigCli(
  cwd: string,
  argv: string[],
  io: ConfigCliIo
): Promise<number> {
  const { writeLine, writeError } = io;
  const { json, parts } = parseConfigArgs(argv);
  const sub = parts[0];
  const tail = parts.slice(1);
  if (!sub) {
    writeError(
      "Usage: workspace-kit config <list|get|set|unset|explain|validate|resolve|generate-docs|edit> [--json] ..."
    );
    return EXIT_USAGE_ERROR;
  }

  let registry: ModuleRegistry;
  try {
    if (sub === "list") {
      registry = buildRegistry(cwd);
    } else {
      const resolved = await resolveRegistryAndConfig(cwd, defaultRegistryModules);
      registry = resolved.registry;
    }
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e));
    return EXIT_INTERNAL_ERROR;
  }

  const emit = (obj: Record<string, unknown>) => {
    writeLine(JSON.stringify(obj, null, json ? 2 : undefined));
  };

  try {
    if (sub === "list") {
      const all = tail.includes("--all");
      const exposure = all ? "maintainer" : "public";
      const rows = listConfigMetadata({ exposure });
      if (json) {
        emit({ ok: true, code: "config-list", data: { keys: rows } });
      } else {
        writeLine("Known config keys:");
        for (const r of rows) {
          writeLine(`  ${r.key} (${r.type}) — ${r.description}`);
        }
      }
      return EXIT_SUCCESS;
    }

    if (sub === "get") {
      const key = tail[0];
      if (!key) {
        writeError("config get <key>");
        return EXIT_USAGE_ERROR;
      }
      const { effective } = await resolveWorkspaceConfigWithLayers({
        workspacePath: cwd,
        registry
      });
      const val = getAtPath(effective as Record<string, unknown>, key);
      if (json) {
        emit({ ok: true, code: "config-get", data: { key, value: val } });
      } else {
        writeLine(String(JSON.stringify({ key, value: val }, null, 2)));
      }
      return EXIT_SUCCESS;
    }

    if (sub === "resolve") {
      const { effective } = await resolveWorkspaceConfigWithLayers({
        workspacePath: cwd,
        registry
      });
      writeLine(stableStringifyConfig(effective).trimEnd());
      return EXIT_SUCCESS;
    }

    if (sub === "validate") {
      const projectPath = getProjectConfigPath(cwd);
      const userPath = getUserConfigFilePath();
      const p = await readJsonFileOrEmpty(projectPath);
      const u = await readJsonFileOrEmpty(userPath);
      validatePersistedConfigDocument(p, ".workspace-kit/config.json");
      validatePersistedConfigDocument(u, "user config");
      await resolveWorkspaceConfigWithLayers({ workspacePath: cwd, registry });
      if (json) {
        emit({ ok: true, code: "config-validated", data: { projectPath, userPath } });
      } else {
        writeLine("Config validate passed (project + user + merged resolution).");
      }
      return EXIT_SUCCESS;
    }

    if (sub === "explain") {
      const key = tail[0];
      if (!key) {
        writeError("config explain <key>");
        return EXIT_USAGE_ERROR;
      }
      const { layers } = await resolveWorkspaceConfigWithLayers({
        workspacePath: cwd,
        registry
      });
      const explained = explainConfigPath(key, layers);
      const meta = getConfigKeyMetadata(key);
      const data = {
        ...explained,
        metadata: meta ?? null
      };
      if (json) {
        emit({ ok: true, code: "config-explained", data });
      } else {
        writeLine(JSON.stringify(data, null, 2));
      }
      return EXIT_SUCCESS;
    }

    if (sub === "generate-docs") {
      await generateConfigReferenceDocs(cwd);
      if (json) {
        emit({ ok: true, code: "config-docs-generated", data: { ai: ".ai/CONFIG.md", human: "docs/maintainers/CONFIG.md" } });
      } else {
        writeLine("Wrote .ai/CONFIG.md and docs/maintainers/CONFIG.md");
      }
      return EXIT_SUCCESS;
    }

    if (sub === "set") {
      let scope: "project" | "user" = "project";
      const args = [...tail];
      if (args[0] === "--scope" && args[1]) {
        scope = args[1] as "project" | "user";
        if (scope !== "project" && scope !== "user") {
          writeError("--scope must be project or user");
          return EXIT_USAGE_ERROR;
        }
        args.splice(0, 2);
      }
      const key = args[0];
      const jsonLiteral = args[1];
      if (!key || jsonLiteral === undefined) {
        writeError('config set [--scope project|user] <key> <jsonValue> e.g. \'".workspace-kit/tasks/state.json"\'');
        return EXIT_USAGE_ERROR;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonLiteral);
      } catch {
        writeError("config set: jsonValue must be valid JSON");
        return EXIT_USAGE_ERROR;
      }

      const meta = assertWritableKey(key);
      if (!meta.writableLayers.includes(scope)) {
        writeError(`config set: key '${key}' cannot be written to layer '${scope}'`);
        return EXIT_VALIDATION_FAILURE;
      }
      validateValueForMetadata(meta, parsed);

      if (meta.requiresApproval || meta.sensitive) {
        const approval = await requireConfigApproval(cwd, `config set ${key}`, writeError);
        if (!approval) return EXIT_VALIDATION_FAILURE;
      }

      const fp = scope === "project" ? getProjectConfigPath(cwd) : getUserConfigFilePath();
      const before = await readJsonFileOrEmpty(fp);
      validatePersistedConfigDocument(before, scope === "project" ? ".workspace-kit/config.json" : "user config");
      const prevVal = getAtPath(before, key);
      const next = setDeep(before, key, parsed);
      validatePersistedConfigDocument(next, scope === "project" ? ".workspace-kit/config.json" : "user config");

      const actor = await resolveActorWithFallback(cwd, {}, process.env);
      try {
        await writeConfigFileAtomic(fp, next);
        await appendConfigMutation(cwd, {
          timestamp: new Date().toISOString(),
          actor,
          key,
          layer: scope,
          operation: "set",
          ok: true,
          previousSummary: summarizeForEvidence(key, meta.sensitive, prevVal),
          nextSummary: summarizeForEvidence(key, meta.sensitive, parsed)
        });
        if (meta.requiresApproval || meta.sensitive) {
          const appr = parsePolicyApprovalFromEnv(process.env)!;
          await appendPolicyTrace(cwd, {
            timestamp: new Date().toISOString(),
            operationId: "cli.config-mutate",
            command: `config set ${key}`,
            actor,
            allowed: true,
            rationale: appr.rationale,
            commandOk: true
          });
        }
        if (json) {
          emit({ ok: true, code: "config-set", data: { key, scope } });
        } else {
          writeLine(`Set ${key} on ${scope} layer.`);
        }
        return EXIT_SUCCESS;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await appendConfigMutation(cwd, {
          timestamp: new Date().toISOString(),
          actor,
          key,
          layer: scope,
          operation: "set",
          ok: false,
          code: "config-set-failed",
          message: msg
        });
        writeError(msg);
        return EXIT_VALIDATION_FAILURE;
      }
    }

    if (sub === "unset") {
      let scope: "project" | "user" = "project";
      const args = [...tail];
      if (args[0] === "--scope" && args[1]) {
        scope = args[1] as "project" | "user";
        args.splice(0, 2);
      }
      const key = args[0];
      if (!key) {
        writeError("config unset [--scope project|user] <key>");
        return EXIT_USAGE_ERROR;
      }
      const meta = assertWritableKey(key);
      if (!meta.writableLayers.includes(scope)) {
        writeError(`config unset: key '${key}' not in layer '${scope}'`);
        return EXIT_VALIDATION_FAILURE;
      }
      if (meta.requiresApproval || meta.sensitive) {
        const approval = await requireConfigApproval(cwd, `config unset ${key}`, writeError);
        if (!approval) return EXIT_VALIDATION_FAILURE;
      }
      const fp = scope === "project" ? getProjectConfigPath(cwd) : getUserConfigFilePath();
      const before = await readJsonFileOrEmpty(fp);
      validatePersistedConfigDocument(before, scope === "project" ? ".workspace-kit/config.json" : "user config");
      const prevVal = getAtPath(before, key);
      const next = unsetDeep(before, key);
      validatePersistedConfigDocument(next, scope === "project" ? ".workspace-kit/config.json" : "user config");
      const actor = await resolveActorWithFallback(cwd, {}, process.env);

      try {
        if (Object.keys(next).length === 0) {
          await fs.rm(fp, { force: true });
        } else {
          await writeConfigFileAtomic(fp, next);
        }
        await appendConfigMutation(cwd, {
          timestamp: new Date().toISOString(),
          actor,
          key,
          layer: scope,
          operation: "unset",
          ok: true,
          previousSummary: summarizeForEvidence(key, meta.sensitive, prevVal),
          nextSummary: summarizeForEvidence(key, meta.sensitive, undefined)
        });
        if (meta.requiresApproval || meta.sensitive) {
          const appr = parsePolicyApprovalFromEnv(process.env)!;
          await appendPolicyTrace(cwd, {
            timestamp: new Date().toISOString(),
            operationId: "cli.config-mutate",
            command: `config unset ${key}`,
            actor,
            allowed: true,
            rationale: appr.rationale,
            commandOk: true
          });
        }
        if (json) {
          emit({ ok: true, code: "config-unset", data: { key, scope } });
        } else {
          writeLine(`Unset ${key} on ${scope} layer.`);
        }
        return EXIT_SUCCESS;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await appendConfigMutation(cwd, {
          timestamp: new Date().toISOString(),
          actor,
          key,
          layer: scope,
          operation: "unset",
          ok: false,
          message: msg
        });
        writeError(msg);
        return EXIT_VALIDATION_FAILURE;
      }
    }

    if (sub === "edit") {
      if (!processStdin.isTTY) {
        writeError("config edit requires an interactive TTY");
        return EXIT_USAGE_ERROR;
      }
      const metaList = listConfigMetadata({ exposure: "public" });
      writeLine("Select a key (number):");
      metaList.forEach((m, i) => writeLine(`  ${i + 1}. ${m.key} — ${m.description}`));
      const rl = createInterface({ input: processStdin, output: processStdout });
      const choice = await rl.question("> ");
      rl.close();
      const n = Number.parseInt(choice.trim(), 10);
      if (!Number.isFinite(n) || n < 1 || n > metaList.length) {
        writeError("Invalid selection");
        return EXIT_USAGE_ERROR;
      }
      const meta = metaList[n - 1];
      const { effective } = await resolveWorkspaceConfigWithLayers({ workspacePath: cwd, registry });
      const current = getAtPath(effective as Record<string, unknown>, meta.key);
      writeLine(`Current: ${JSON.stringify(current)} Default: ${JSON.stringify(meta.default)}`);
      const rl2 = createInterface({ input: processStdin, output: processStdout });
      const raw = await rl2.question("New JSON value: ");
      rl2.close();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        writeError("Invalid JSON");
        return EXIT_USAGE_ERROR;
      }
      validateValueForMetadata(meta, parsed);
      const scope = meta.writableLayers.includes("project") ? "project" : "user";
      return runWorkspaceConfigCli(
        cwd,
        ["set", "--scope", scope, meta.key, JSON.stringify(parsed)],
        io
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeError(msg);
    return EXIT_VALIDATION_FAILURE;
  }

  writeError(`Unknown config subcommand '${sub}'`);
  return EXIT_USAGE_ERROR;
}
