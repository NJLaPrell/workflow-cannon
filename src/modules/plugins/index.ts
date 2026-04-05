import fs from "node:fs";
import path from "node:path";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { parsePolicyApproval } from "../../core/policy.js";
import { openPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { discoverPluginPackages, getPluginRecordByName } from "./discovery.js";
import { validateClaudePluginManifestJson } from "./manifest-validate.js";
import {
  assertPluginKitSchema,
  getPluginState,
  isPluginEnabledInDb,
  upsertPluginState
} from "./plugin-store.js";

function nowIso(): string {
  return new Date().toISOString();
}

export const pluginsModule: WorkflowModule = {
  registration: {
    id: "plugins",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["plugins"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/plugins/config.md",
      format: "md",
      description: "Claude Code–layout plugin discovery, inspection, and kit SQLite enablement."
    },
    instructions: {
      directory: "src/modules/plugins/instructions",
      entries: builtinInstructionEntriesForModule("plugins")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;
    const ws = ctx.workspacePath;
    const eff = ctx.effectiveConfig as Record<string, unknown> | undefined;

    if (name === "list-plugins") {
      const res = discoverPluginPackages(ws, eff);
      if (!res.ok) {
        return { ok: false, code: res.code, message: res.message };
      }
      let planning;
      try {
        planning = await openPlanningStores(ctx);
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "storage-read-error",
          message: `Failed to open planning stores: ${(err as Error).message}`
        };
      }
      const dbPathAbs = planning.sqliteDual.dbPath;
      const schemaOk = assertPluginKitSchema(dbPathAbs);
      const db = planning.sqliteDual.getDatabase();
      const plugins = res.plugins.map((p) => ({
        name: p.name,
        version: p.version,
        description: p.description,
        rootRelativePath: p.rootRelativePath,
        manifestPathRelative: p.manifestPathRelative,
        manifestValid: p.manifestValid,
        manifestErrors: p.manifestErrors,
        pathDiagnostics: p.pathDiagnostics,
        enabled: schemaOk.ok ? isPluginEnabledInDb(db, p.name) : true
      }));
      return {
        ok: true,
        code: "plugins-listed",
        data: {
          plugins,
          count: plugins.length,
          discoveryRoots: (() => {
            const pl = eff?.plugins;
            if (pl && typeof pl === "object" && !Array.isArray(pl)) {
              const r = (pl as Record<string, unknown>).discoveryRoots;
              if (Array.isArray(r)) {
                return r.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
              }
            }
            return [".claude/plugins"];
          })(),
          kitSqlitePluginStateAvailable: schemaOk.ok
        }
      };
    }

    if (name === "inspect-plugin") {
      const pluginName = typeof args.pluginName === "string" ? args.pluginName.trim() : "";
      if (!pluginName) {
        return { ok: false, code: "invalid-args", message: "inspect-plugin requires pluginName" };
      }
      const rec = getPluginRecordByName(ws, eff, pluginName);
      if (!rec) {
        return { ok: false, code: "plugin-not-found", message: `Plugin '${pluginName}' not found` };
      }
      let planning;
      try {
        planning = await openPlanningStores(ctx);
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "storage-read-error",
          message: `Failed to open planning stores: ${(err as Error).message}`
        };
      }
      const dbPathAbs = planning.sqliteDual.dbPath;
      const schemaOk = assertPluginKitSchema(dbPathAbs);
      const db = planning.sqliteDual.getDatabase();
      const st = schemaOk.ok ? getPluginState(db, pluginName) : undefined;
      return {
        ok: true,
        code: "plugin-inspected",
        data: {
          plugin: {
            name: rec.name,
            version: rec.version,
            description: rec.description,
            rootRelativePath: rec.rootRelativePath,
            manifestPathRelative: rec.manifestPathRelative,
            manifest: rec.manifest,
            manifestValid: rec.manifestValid,
            manifestErrors: rec.manifestErrors,
            pathDiagnostics: rec.pathDiagnostics,
            enabled: schemaOk.ok ? isPluginEnabledInDb(db, rec.name) : true,
            persisted: st
              ? {
                  installedVia: st.installedVia,
                  updatedAt: st.updatedAt
                }
              : null
          }
        }
      };
    }

    if (name === "install-plugin" || name === "enable-plugin" || name === "disable-plugin") {
      const approval = parsePolicyApproval(args);
      if (!approval) {
        return {
          ok: false,
          code: "policy-denied",
          message: `${name} requires policyApproval JSON in args (confirmed + rationale) — see docs/maintainers/POLICY-APPROVAL.md`
        };
      }
    }

    if (name === "install-plugin") {
      const sourcePath = typeof args.sourcePath === "string" ? args.sourcePath.trim() : "";
      if (!sourcePath) {
        return { ok: false, code: "invalid-args", message: "install-plugin requires sourcePath (workspace-relative)" };
      }
      const sourceAbs = path.resolve(ws, sourcePath);
      const manifestAbs = path.join(sourceAbs, ".claude-plugin", "plugin.json");
      if (!fs.existsSync(manifestAbs)) {
        return {
          ok: false,
          code: "plugin-manifest-missing",
          message: `Expected manifest at ${path.relative(ws, manifestAbs) || manifestAbs}`
        };
      }
      let raw: string;
      try {
        raw = fs.readFileSync(manifestAbs, "utf8");
      } catch {
        return { ok: false, code: "plugin-read-error", message: "Cannot read source plugin.json" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (e) {
        return {
          ok: false,
          code: "plugin-manifest-invalid",
          message: `Invalid JSON: ${(e as Error).message}`
        };
      }
      const v = validateClaudePluginManifestJson(parsed);
      if (!v.ok) {
        return {
          ok: false,
          code: "plugin-manifest-invalid",
          message: v.message,
          data: { pathDiagnostics: v.pathDiagnostics }
        };
      }
      const manifest = v.manifest;
      const roots = (() => {
        const pl = eff?.plugins;
        if (pl && typeof pl === "object" && !Array.isArray(pl)) {
          const r = (pl as Record<string, unknown>).discoveryRoots;
          if (Array.isArray(r)) {
            const out = r.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
            if (out.length > 0) return out;
          }
        }
        return [".claude/plugins"];
      })();
      const targetRootArg =
        typeof args.targetDiscoveryRoot === "string" ? args.targetDiscoveryRoot.trim() : "";
      const targetRootRel = targetRootArg || roots[0]!;
      if (targetRootArg && !roots.includes(targetRootArg)) {
        return {
          ok: false,
          code: "invalid-args",
          message: `targetDiscoveryRoot must be one of plugins.discoveryRoots: ${roots.join(", ")}`
        };
      }
      const destAbs = path.resolve(ws, targetRootRel, manifest.name);
      if (fs.existsSync(destAbs)) {
        return {
          ok: false,
          code: "plugin-destination-exists",
          message: `Destination already exists: ${path.relative(ws, destAbs) || destAbs}`
        };
      }
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      try {
        fs.cpSync(sourceAbs, destAbs, { recursive: true });
      } catch (e) {
        return {
          ok: false,
          code: "plugin-install-copy-failed",
          message: (e as Error).message
        };
      }
      let planning;
      try {
        planning = await openPlanningStores(ctx);
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "storage-read-error",
          message: `Failed to open planning stores: ${(err as Error).message}`
        };
      }
      const dbPathAbs = planning.sqliteDual.dbPath;
      const schemaOk = assertPluginKitSchema(dbPathAbs);
      if (!schemaOk.ok) {
        return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
      }
      const db = planning.sqliteDual.getDatabase();
      const rootRelativePath = path.relative(ws, destAbs).split(path.sep).join("/");
      upsertPluginState(db, {
        pluginName: manifest.name,
        enabled: true,
        rootRelativePath,
        installedVia: "copy-install",
        updatedAt: nowIso()
      });
      return {
        ok: true,
        code: "plugin-installed",
        message: `Installed plugin '${manifest.name}'`,
        data: {
          pluginName: manifest.name,
          destinationRelativePath: rootRelativePath,
          targetDiscoveryRoot: targetRootRel
        }
      };
    }

    if (name === "enable-plugin" || name === "disable-plugin") {
      const pluginName = typeof args.pluginName === "string" ? args.pluginName.trim() : "";
      if (!pluginName) {
        return { ok: false, code: "invalid-args", message: `${name} requires pluginName` };
      }
      const rec = getPluginRecordByName(ws, eff, pluginName);
      if (!rec) {
        return { ok: false, code: "plugin-not-found", message: `Plugin '${pluginName}' not found` };
      }
      let planning;
      try {
        planning = await openPlanningStores(ctx);
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "storage-read-error",
          message: `Failed to open planning stores: ${(err as Error).message}`
        };
      }
      const dbPathAbs = planning.sqliteDual.dbPath;
      const schemaOk = assertPluginKitSchema(dbPathAbs);
      if (!schemaOk.ok) {
        return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
      }
      const db = planning.sqliteDual.getDatabase();
      const existing = getPluginState(db, pluginName);
      const installedVia = existing?.installedVia ?? "scan";
      upsertPluginState(db, {
        pluginName,
        enabled: name === "enable-plugin",
        rootRelativePath: rec.rootRelativePath,
        installedVia,
        updatedAt: nowIso()
      });
      return {
        ok: true,
        code: name === "enable-plugin" ? "plugin-enabled" : "plugin-disabled",
        data: { pluginName, enabled: name === "enable-plugin" }
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `plugins: unknown command '${name}'`
    };
  }
};
