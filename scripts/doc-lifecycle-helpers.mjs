/**
 * Shared rules for root Markdown + documentation ledger checks (T100199).
 * Keep ALLOWED_ROOT_MARKDOWN_NAMES aligned with ROOT_FILE_DISPOSITION in
 * scripts/build-documentation-ledger.mjs.
 */

/** @type {readonly string[]} */
export const ALLOWED_ROOT_MARKDOWN_NAMES = Object.freeze([
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "PHASE_JOURNAL.md"
]);

export const ALLOWED_ROOT_MARKDOWN = new Set(ALLOWED_ROOT_MARKDOWN_NAMES);

/**
 * @param {string[]} rootFilenames - `readdir` names at repo root (basenames)
 * @returns {string[]} unexpected `*.md` files (not in allowlist)
 */
export function unexpectedRootMarkdown(rootFilenames) {
  return rootFilenames.filter((n) => n.endsWith(".md") && !ALLOWED_ROOT_MARKDOWN.has(n));
}

/**
 * @param {unknown} ledger
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateLedgerDocumentedSurfaces(ledger) {
  const errors = [];
  const warnings = [];
  if (!ledger || typeof ledger !== "object") {
    errors.push("ledger missing or not an object");
    return { errors, warnings };
  }
  const o = /** @type {Record<string, unknown>} */ (ledger);
  if (o.schemaVersion !== 1) {
    errors.push(`ledger.schemaVersion must be 1 (got ${String(o.schemaVersion)})`);
  }
  if (typeof o.generatedAt !== "string" || !o.generatedAt) {
    errors.push("ledger.generatedAt missing or not a string");
  } else if (Number.isNaN(Date.parse(o.generatedAt))) {
    errors.push("ledger.generatedAt is not a parseable ISO-8601 timestamp");
  }
  if (!Array.isArray(o.rootMarkdownFiles)) {
    errors.push("ledger.rootMarkdownFiles must be an array");
  } else {
    for (const row of o.rootMarkdownFiles) {
      if (!row || typeof row !== "object") {
        errors.push("ledger.rootMarkdownFiles entry is not an object");
        continue;
      }
      const r = /** @type {Record<string, unknown>} */ (row);
      const p = typeof r.path === "string" ? r.path : "";
      if (!p) errors.push("ledger.rootMarkdownFiles row missing path");
      if (typeof r.disposition !== "string" || !r.disposition) {
        errors.push(`ledger.rootMarkdownFiles row ${p || "(unknown)"} missing disposition`);
      } else if (r.disposition === "review") {
        warnings.push(
          `root ${p}: disposition "review" — add an explicit map entry in build-documentation-ledger.mjs (ROOT_FILE_DISPOSITION)`
        );
      }
    }
  }
  if (!Array.isArray(o.groups)) {
    errors.push("ledger.groups must be an array");
  }
  return { errors, warnings };
}

/**
 * @param {string[]} diskRootMd - basenames `*.md` present at repo root
 * @param {string[]} ledgerPaths - `path` values from ledger.rootMarkdownFiles
 * @returns {string[]} human-readable drift messages (empty when in sync)
 */
export function ledgerRootDiskDriftMessages(diskRootMd, ledgerPaths) {
  const disk = new Set(diskRootMd);
  const led = new Set(ledgerPaths);
  const out = [];
  for (const d of disk) {
    if (!led.has(d)) {
      out.push(
        `root file ${d} is missing from committed documentation-ledger rootMarkdownFiles — run pnpm run build:documentation-ledger`
      );
    }
  }
  for (const p of led) {
    if (!disk.has(p)) {
      out.push(
        `documentation-ledger lists root ${p} but that file is not on disk — restore the file or regenerate the ledger`
      );
    }
  }
  return out;
}
