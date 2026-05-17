import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALLOWED_ROOT_MARKDOWN_NAMES,
  ledgerRootDiskDriftMessages,
  unexpectedRootMarkdown,
  validateLedgerDocumentedSurfaces
} from "../scripts/doc-lifecycle-helpers.mjs";

describe("doc-lifecycle-helpers", () => {
  it("flags unexpected root markdown", () => {
    const bad = unexpectedRootMarkdown(["README.md", "AGENTS.md", "oops-root-doc.md"]);
    assert.deepEqual(bad, ["oops-root-doc.md"]);
  });

  it("accepts allowlisted root markdown only", () => {
    assert.deepEqual(unexpectedRootMarkdown([...ALLOWED_ROOT_MARKDOWN_NAMES]), []);
  });

  it("validateLedgerDocumentedSurfaces rejects bad ledger", () => {
    const r = validateLedgerDocumentedSurfaces(null);
    assert.ok(r.errors.length > 0);
  });

  it("validateLedgerDocumentedSurfaces warns on review disposition", () => {
    const r = validateLedgerDocumentedSurfaces({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      groups: [],
      rootMarkdownFiles: [{ path: "MYSTERY.md", disposition: "review" }]
    });
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("MYSTERY")));
  });

  it("ledgerRootDiskDriftMessages detects disk missing from ledger", () => {
    const m = ledgerRootDiskDriftMessages(["README.md", "NEW.md"], ["README.md"]);
    assert.ok(m.some((x) => x.includes("NEW.md")));
  });

  it("ledgerRootDiskDriftMessages detects ledger orphan", () => {
    const m = ledgerRootDiskDriftMessages(["README.md"], ["README.md", "GHOST.md"]);
    assert.ok(m.some((x) => x.includes("GHOST.md")));
  });
});
