import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { ClaudePluginManifest, PluginPathDiagnostic } from "./types.js";

const SCHEMA_PATH = path.join(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "schemas/claude-plugin-manifest.schema.json"
);

type AjvLike = { compile: (schema: object) => ValidateFunction };

function createAjv(): AjvLike {
  const Ctor = AjvImport as unknown as new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvLike;
  return new Ctor({ allErrors: true, strict: false });
}

let validateManifest: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!validateManifest) {
    const raw = readFileSync(SCHEMA_PATH, "utf8");
    const schema = JSON.parse(raw) as Record<string, unknown>;
    delete schema.$schema;
    delete schema.$id;
    validateManifest = createAjv().compile(schema as object);
  }
  return validateManifest;
}

function isValidClaudeRelativePath(s: string): boolean {
  if (!s.startsWith("./")) return false;
  if (s.includes("../") || s.includes("..\\")) return false;
  if (path.isAbsolute(s)) return false;
  if (s.includes("\\")) return false;
  return true;
}

function collectPathStrings(m: ClaudePluginManifest): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const push = (field: string, v: string | undefined) => {
    if (v && typeof v === "string") out.push({ field, value: v });
  };
  if (typeof m.commands === "string") push("commands", m.commands);
  else if (Array.isArray(m.commands)) {
    for (let i = 0; i < m.commands.length; i++) {
      const x = m.commands[i];
      if (typeof x === "string") push(`commands[${i}]`, x);
    }
  }
  if (typeof m.agents === "string") push("agents", m.agents);
  else if (Array.isArray(m.agents)) {
    for (let i = 0; i < m.agents.length; i++) {
      const x = m.agents[i];
      if (typeof x === "string") push(`agents[${i}]`, x);
    }
  }
  if (typeof m.hooks === "string") push("hooks", m.hooks);
  if (typeof m.mcpServers === "string") push("mcpServers", m.mcpServers);
  return out;
}

/** Validate manifest JSON shape + Claude relative-path rules for string path fields. */
export function validateClaudePluginManifestJson(data: unknown): {
  ok: true;
  manifest: ClaudePluginManifest;
  pathDiagnostics: PluginPathDiagnostic[];
} | { ok: false; message: string; pathDiagnostics: PluginPathDiagnostic[] } {
  const v = getValidator();
  if (!v(data)) {
    const errs = (v.errors ?? []) as ErrorObject[];
    const msg = errs.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ");
    return { ok: false, message: msg || "plugin manifest schema validation failed", pathDiagnostics: [] };
  }
  const manifest = data as ClaudePluginManifest;
  const pathDiagnostics: PluginPathDiagnostic[] = [];
  for (const { field, value } of collectPathStrings(manifest)) {
    if (!isValidClaudeRelativePath(value)) {
      pathDiagnostics.push({
        field,
        message: `must be a relative path starting with './' with no '..' segments (Claude Code plugin rules)`
      });
    }
  }
  if (pathDiagnostics.length > 0) {
    return {
      ok: false,
      message: pathDiagnostics.map((p) => `${p.field}: ${p.message}`).join("; "),
      pathDiagnostics
    };
  }
  return { ok: true, manifest, pathDiagnostics: [] };
}
