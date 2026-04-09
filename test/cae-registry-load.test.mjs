/**
 * CAE registry loader (T858).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("CAE registry load (T858)", () => {
  it("loads default registry under workspace root", () => {
    const res = loadCaeRegistry(root);
    assert.equal(res.ok, true);
    assert.ok(res.value.artifacts.length >= 1);
    assert.ok(res.value.activations.length >= 1);
    assert.ok(res.value.registryDigest.length >= 16);
    assert.ok(res.value.artifactById.has("cae.playbook.machine-playbooks"));
  });

  it("returns cae-registry-read-error for missing bundle", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-cae-"));
    const res = loadCaeRegistry(tmp);
    assert.equal(res.ok, false);
    assert.equal(res.code, "cae-registry-read-error");
  });
});
