#!/usr/bin/env node
/**
 * CI drift gate: verifies `schemas/mcp-tool-schema-snapshot.json` matches
 * the current output of `listReadOnlyMcpTools()` (from `dist/mcp/index.js`).
 *
 * Also cross-checks that each tool's inferred CLI command exists in
 * `src/contracts/builtin-run-command-manifest.json`, so CLI/MCP adapters
 * agree on command shape.
 *
 * Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs
 *
 * Requires: pnpm run build (dist/mcp/index.js must exist).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_MCP = path.join(ROOT, "dist/mcp/index.js");
const MANIFEST_PATH = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const SNAP_PATH = path.join(ROOT, "schemas/mcp-tool-schema-snapshot.json");
const PKG_PATH = path.join(ROOT, "package.json");

function fail(msg) {
  console.error(`[check-mcp-tool-schema-snapshot] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(DIST_MCP)) {
  fail("dist/mcp/index.js missing — run pnpm run build first.");
}
if (!fs.existsSync(SNAP_PATH)) {
  fail(
    "schemas/mcp-tool-schema-snapshot.json missing — run:\n" +
    "  pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const manifestCommandNames = new Set(
  manifest.map((r) => (typeof r.name === "string" ? r.name.trim() : "")).filter(Boolean)
);

const snapshot = JSON.parse(fs.readFileSync(SNAP_PATH, "utf8"));

if (snapshot.packageVersion !== pkg.version) {
  fail(
    `Snapshot packageVersion (${snapshot.packageVersion}) !== package.json version (${pkg.version}). ` +
    "Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}

const require = createRequire(import.meta.url);
const { listReadOnlyMcpTools } = require(DIST_MCP);
const liveTools = listReadOnlyMcpTools();

if (!Array.isArray(liveTools) || liveTools.length === 0) {
  fail("listReadOnlyMcpTools() returned empty result.");
}

/** Deterministic JSON stringify for schema comparison. */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Extract CLI command name from description (mirrors generate script logic). */
function extractCliCommand(description) {
  const m = typeof description === "string"
    ? description.match(/CLI fallback: pnpm exec wk run (\S+)/)
    : null;
  if (!m) return null;
  const cmd = m[1].replace(/[.,;]$/, "");
  return cmd.startsWith("--") ? null : cmd;
}

// ── Cross-check 1: CLI command names in manifest ──────────────────────────────
const unknownCmds = [];
for (const tool of liveTools) {
  const cliCommand = extractCliCommand(tool.description);
  if (cliCommand && !manifestCommandNames.has(cliCommand)) {
    unknownCmds.push(`${tool.name} -> ${cliCommand}`);
  }
}
if (unknownCmds.length > 0) {
  fail(
    `MCP tool CLI command(s) not in builtin-run-command-manifest.json:\n  ${unknownCmds.join("\n  ")}\n` +
    "CLI/MCP adapter shape mismatch. Update manifest or fix tool description."
  );
}

// ── Cross-check 2: snapshot tool names ────────────────────────────────────────
const snapByName = new Map(
  Array.isArray(snapshot.tools) ? snapshot.tools.map((t) => [t.name, t]) : []
);
const liveByName = new Map(liveTools.map((t) => [t.name, t]));

const missingInSnap = liveTools.filter((t) => !snapByName.has(t.name)).map((t) => t.name);
const missingInLive = [...snapByName.keys()].filter((n) => !liveByName.has(n));

if (missingInSnap.length > 0) {
  fail(
    `New MCP tool(s) not in snapshot: ${missingInSnap.join(", ")}\n` +
    "Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}
if (missingInLive.length > 0) {
  fail(
    `Snapshot has removed tool(s) not in live server: ${missingInLive.join(", ")}\n` +
    "Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}

// ── Cross-check 3: inputSchema drift ─────────────────────────────────────────
const schemaDrift = [];
for (const liveTool of liveTools) {
  const snapTool = snapByName.get(liveTool.name);
  const liveSchema = stableStringify(liveTool.inputSchema);
  const snapSchema = stableStringify(snapTool.inputSchema);
  if (liveSchema !== snapSchema) {
    schemaDrift.push(liveTool.name);
  }
}
if (schemaDrift.length > 0) {
  fail(
    `MCP tool inputSchema changed (not reflected in snapshot): ${schemaDrift.join(", ")}\n` +
    "Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}

// ── Cross-check 4: tool count ────────────────────────────────────────────────
if (liveTools.length !== (snapshot.toolCount ?? snapshot.tools?.length)) {
  fail(
    `Tool count mismatch: live=${liveTools.length}, snapshot=${snapshot.toolCount}. ` +
    "Regenerate: pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs"
  );
}

console.error(
  `[check-mcp-tool-schema-snapshot] OK: ${liveTools.length} MCP tool(s); ` +
  `CLI command cross-check passed; no inputSchema drift; package ${pkg.version}.`
);
