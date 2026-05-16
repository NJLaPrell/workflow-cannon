import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { validateDeletionRegister } from "../scripts/documentation-deletion-register-helpers.mjs";

describe("documentation-deletion-register-helpers", () => {
  it("rejects malformed register", () => {
    const r = validateDeletionRegister(null, "/tmp");
    assert.ok(r.errors.length > 0);
  });

  it("requires deleted paths to be absent on disk", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-delreg-"));
    const rel = "gone.txt";
    fs.writeFileSync(path.join(tmp, rel), "x", "utf8");
    const reg = {
      schemaVersion: 1,
      title: "t",
      updatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        {
          path: rel,
          disposition: "deleted",
          confidence: "high",
          rationale: "test",
          replacement: "",
          inboundLinks: [],
          taskRefs: ["T100200"],
          releaseRefs: [],
          packageImpact: "none",
          evidence: { note: "fixture" }
        }
      ]
    };
    const bad = validateDeletionRegister(reg, tmp);
    assert.ok(bad.errors.some((e) => e.includes("still exists")));
    fs.unlinkSync(path.join(tmp, rel));
    const good = validateDeletionRegister(reg, tmp);
    assert.equal(good.errors.length, 0);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("requires archived paths under docs/maintainers/archive", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-delreg-"));
    const reg = {
      schemaVersion: 1,
      title: "t",
      updatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        {
          path: "wrong/readme.md",
          disposition: "archived",
          confidence: "high",
          rationale: "test",
          replacement: "docs/maintainers/README.md",
          inboundLinks: [],
          taskRefs: [],
          releaseRefs: [],
          packageImpact: "none",
          evidence: { note: "fixture" }
        }
      ]
    };
    const r = validateDeletionRegister(reg, tmp);
    assert.ok(r.errors.some((e) => e.includes("docs/maintainers/archive")));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
