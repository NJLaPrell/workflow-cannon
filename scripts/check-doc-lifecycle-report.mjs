#!/usr/bin/env node
/**
 * Mechanical doc classification / staleness gate (T100199):
 * - repo-root `*.md` allowlist (CONTRIBUTING contract)
 * - committed documentation-ledger.v1.json shape + root list matches disk
 *
 * Emits one JSON object on stdout; human hints on stderr when failing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ledgerRootDiskDriftMessages,
  unexpectedRootMarkdown,
  validateLedgerDocumentedSurfaces
} from "./doc-lifecycle-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(root, "docs", "maintainers", "data", "documentation-ledger.v1.json");

function listRootMarkdownBasenames() {
  const names = fs.readdirSync(root, { withFileTypes: true });
  const md = [];
  for (const d of names) {
    if (!d.isFile() || !d.name.endsWith(".md")) continue;
    md.push(d.name);
  }
  md.sort((a, b) => a.localeCompare(b));
  return md;
}

const diskRootMd = listRootMarkdownBasenames();
const allowViolations = unexpectedRootMarkdown(diskRootMd.map((n) => n));

let ledger = null;
let parseErr = null;
try {
  const raw = fs.readFileSync(ledgerPath, "utf8");
  ledger = JSON.parse(raw);
} catch (e) {
  parseErr = e instanceof Error ? e.message : String(e);
}

const shape = ledger ? validateLedgerDocumentedSurfaces(ledger) : { errors: [], warnings: [] };
if (parseErr) {
  shape.errors.unshift(`could not read or parse documentation ledger: ${parseErr}`);
}

const ledgerPaths =
  ledger && Array.isArray(ledger.rootMarkdownFiles)
    ? ledger.rootMarkdownFiles.map((r) => (r && typeof r.path === "string" ? r.path : "")).filter(Boolean)
    : [];

const drift = ledger && !parseErr ? ledgerRootDiskDriftMessages(diskRootMd, ledgerPaths) : [];

const errors = [
  ...allowViolations.map((f) => `unexpected root Markdown (not in CONTRIBUTING allowlist): ${f}`),
  ...shape.errors,
  ...drift
];

const warnings = [...shape.warnings];

const report = {
  ok: errors.length === 0,
  code: errors.length === 0 ? "doc-lifecycle-ok" : "doc-lifecycle-failed",
  data: {
    ledgerPath: path.relative(root, ledgerPath),
    diskRootMarkdown: diskRootMd,
    errorCount: errors.length,
    warningCount: warnings.length
  },
  errors,
  warnings
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[check:doc-lifecycle] ${e}`);
  }
  console.error(
    "[check:doc-lifecycle] Fix allowlist violations in CONTRIBUTING / root files; refresh ledger via pnpm run build:documentation-ledger"
  );
  process.exit(1);
}

if (warnings.length > 0) {
  for (const w of warnings) {
    console.error(`[check:doc-lifecycle] WARN ${w}`);
  }
}
