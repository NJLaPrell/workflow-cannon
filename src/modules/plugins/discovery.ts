import fs from "node:fs";
import path from "node:path";
import { validateClaudePluginManifestJson } from "./manifest-validate.js";
import type { PluginDiscoveryRecord } from "./types.js";

const MANIFEST_SEGMENTS = [".claude-plugin", "plugin.json"];

function manifestRelPosix(): string {
  return MANIFEST_SEGMENTS.join("/");
}

function readDiscoveryRoots(effectiveConfig: Record<string, unknown> | undefined): string[] {
  const plugins = effectiveConfig?.plugins;
  if (plugins && typeof plugins === "object" && !Array.isArray(plugins)) {
    const roots = (plugins as Record<string, unknown>).discoveryRoots;
    if (Array.isArray(roots)) {
      const out = roots.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (out.length > 0) return out;
    }
  }
  return [".claude/plugins"];
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scan configured plugin roots for Claude-layout packages: `<root>/<plugin>/.claude-plugin/plugin.json`.
 */
export function discoverPluginPackages(
  workspacePath: string,
  effectiveConfig: Record<string, unknown> | undefined
): { ok: true; plugins: PluginDiscoveryRecord[] } | { ok: false; code: string; message: string } {
  const roots = readDiscoveryRoots(effectiveConfig);
  const byName = new Map<string, PluginDiscoveryRecord>();

  for (const relRoot of roots) {
    const rootAbs = path.resolve(workspacePath, relRoot);
    if (!isDir(rootAbs)) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootAbs, { withFileTypes: true });
    } catch {
      return { ok: false, code: "plugin-discovery-read-error", message: `Cannot read plugin root: ${relRoot}` };
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dirName = ent.name;
      const dirAbs = path.join(rootAbs, dirName);
      const manifestAbs = path.join(dirAbs, ...MANIFEST_SEGMENTS);
      if (!fs.existsSync(manifestAbs)) {
        continue;
      }
      const rootRelativePath = path.relative(workspacePath, dirAbs).split(path.sep).join("/");
      const manifestPathRelative = path.join(rootRelativePath, ...MANIFEST_SEGMENTS).split(path.sep).join("/");
      let rawJson: string;
      try {
        rawJson = fs.readFileSync(manifestAbs, "utf8");
      } catch {
        return {
          ok: false,
          code: "plugin-read-error",
          message: `Cannot read ${manifestPathRelative}`
        };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson) as unknown;
      } catch (e) {
        const rec: PluginDiscoveryRecord = {
          name: dirName,
          version: null,
          description: null,
          rootPath: dirAbs,
          rootRelativePath,
          manifestPathRelative,
          manifest: null,
          manifestValid: false,
          manifestErrors: [`invalid JSON: ${(e as Error).message}`],
          pathDiagnostics: []
        };
        if (byName.has(rec.name)) {
          return {
            ok: false,
            code: "plugin-duplicate-name",
            message: `Duplicate plugin name '${rec.name}' across discovery roots`
          };
        }
        byName.set(rec.name, rec);
        continue;
      }
      const v = validateClaudePluginManifestJson(parsed);
      if (!v.ok) {
        const rec: PluginDiscoveryRecord = {
          name: typeof (parsed as { name?: string }).name === "string" ? String((parsed as { name: string }).name) : dirName,
          version: null,
          description: null,
          rootPath: dirAbs,
          rootRelativePath,
          manifestPathRelative,
          manifest: null,
          manifestValid: false,
          manifestErrors: [v.message],
          pathDiagnostics: v.pathDiagnostics
        };
        if (byName.has(rec.name)) {
          return {
            ok: false,
            code: "plugin-duplicate-name",
            message: `Duplicate plugin name '${rec.name}' across discovery roots`
          };
        }
        byName.set(rec.name, rec);
        continue;
      }
      const m = v.manifest;
      if (byName.has(m.name)) {
        return {
          ok: false,
          code: "plugin-duplicate-name",
          message: `Duplicate plugin name '${m.name}' across discovery roots`
        };
      }
      const rec: PluginDiscoveryRecord = {
        name: m.name,
        version: m.version ?? null,
        description: m.description ?? null,
        rootPath: dirAbs,
        rootRelativePath,
        manifestPathRelative,
        manifest: m,
        manifestValid: true,
        manifestErrors: [],
        pathDiagnostics: []
      };
      byName.set(m.name, rec);
    }
  }

  const plugins = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, plugins };
}

export function getPluginRecordByName(
  workspacePath: string,
  effectiveConfig: Record<string, unknown> | undefined,
  pluginName: string
): PluginDiscoveryRecord | undefined {
  const res = discoverPluginPackages(workspacePath, effectiveConfig);
  if (!res.ok) return undefined;
  return res.plugins.find((p) => p.name === pluginName);
}

export function defaultManifestRelativePathForDocs(): string {
  return manifestRelPosix();
}
