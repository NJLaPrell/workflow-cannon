#!/usr/bin/env node
/**
 * Emit `schemas/mcp-tool-schema-snapshot.json` from `listReadOnlyMcpTools()`.
 * Run after `pnpm run build`.
 *
 * Schema source-of-truth pipeline (T100729):
 *   TypeScript contracts (src/mcp/server.ts)
 *     → dist/mcp/index.js (via `pnpm run build`)
 *       → schemas/mcp-tool-schema-snapshot.json (this script)
 *         → check-mcp-tool-schema-snapshot.mjs (CI drift gate)
 *
 * Each tool's `inputSchema` is the canonical shape for that MCP surface.
 * The snapshot is the committed source-of-truth artifact checked by CI.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_MCP = path.join(ROOT, "dist/mcp/index.js");
const MANIFEST_PATH = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const OUT_PATH = path.join(ROOT, "schemas/mcp-tool-schema-snapshot.json");
const PKG_PATH = path.join(ROOT, "package.json");

function fail(msg) {
  console.error(`[generate-mcp-tool-schema-snapshot] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(DIST_MCP)) {
  fail("dist/mcp/index.js missing — run pnpm run build first.");
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const manifestCommandNames = new Set(
  manifest.map((r) => (typeof r.name === "string" ? r.name.trim() : "")).filter(Boolean)
);

const require = createRequire(import.meta.url);
const { listReadOnlyMcpTools, listMutationMcpToolDescriptors } = require(DIST_MCP);
const rawTools = listReadOnlyMcpTools();

if (!Array.isArray(rawTools) || rawTools.length === 0) {
  fail("listReadOnlyMcpTools() returned empty result.");
}

const rawMutationTools = listMutationMcpToolDescriptors();
if (!Array.isArray(rawMutationTools)) {
  fail("listMutationMcpToolDescriptors() did not return an array.");
}

/** Extract CLI command name from the "CLI fallback: pnpm exec wk run <cmd>" description pattern. */
function extractCliCommand(description) {
  const m = typeof description === "string"
    ? description.match(/CLI fallback: pnpm exec wk run (\S+)/)
    : null;
  if (!m) return null;
  const cmd = m[1].replace(/[.,;]$/, "");
  // Flags (--list-commands) are not run commands.
  return cmd.startsWith("--") ? null : cmd;
}

const tools = [];
const unknownCmds = [];

for (const tool of rawTools) {
  const cliCommand = extractCliCommand(tool.description);
  if (cliCommand && !manifestCommandNames.has(cliCommand)) {
    unknownCmds.push(`${tool.name} -> ${cliCommand}`);
  }
  tools.push({
    name: tool.name,
    cliCommand: cliCommand ?? null,
    inputSchema: tool.inputSchema
  });
}

if (unknownCmds.length > 0) {
  fail(
    `MCP tool CLI command(s) not found in builtin-run-command-manifest.json:\n  ${unknownCmds.join("\n  ")}\n` +
    "Update the manifest or fix the CLI fallback in the tool description."
  );
}

const mutationTools = [];
const unknownMutationCmds = [];

for (const tool of rawMutationTools) {
  const cliCommand = extractCliCommand(tool.description);
  if (cliCommand && !manifestCommandNames.has(cliCommand)) {
    unknownMutationCmds.push(`${tool.name} -> ${cliCommand}`);
  }
  mutationTools.push({
    name: tool.name,
    cliCommand: cliCommand ?? null,
    inputSchema: tool.inputSchema
  });
}

if (unknownMutationCmds.length > 0) {
  fail(
    `Mutation tool CLI command(s) not found in builtin-run-command-manifest.json:\n  ${unknownMutationCmds.join("\n  ")}\n` +
    "Update the manifest or fix the CLI fallback in the mutation tool description."
  );
}

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  packageVersion: pkg.version,
  toolCount: tools.length,
  tools,
  mutationToolCount: mutationTools.length,
  mutationTools
};

fs.writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.error(
  `[generate-mcp-tool-schema-snapshot] wrote ${tools.length} read-only + ${mutationTools.length} mutation tool(s) to schemas/mcp-tool-schema-snapshot.json`
);
