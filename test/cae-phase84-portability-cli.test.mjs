/**
 * Phase 84 CAE portability / defaults — smoke the same CLI paths the dashboard Portability tab uses.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceWithSeededCaeRegistry } from "./cae-test-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function wkRunJson(workspacePath, cmd, argv) {
  const r = spawnSync(process.execPath, [path.join(root, "dist/cli.js"), "run", cmd, JSON.stringify(argv)], {
    cwd: workspacePath,
    encoding: "utf8"
  });
  assert.equal(r.error, undefined, r.error?.message ?? String(r.error));
  const out = r.stdout.trim();
  const brace = out.indexOf("{");
  assert.ok(brace >= 0, `no JSON in stdout: ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(brace));
}

describe("cae phase 84 portability CLI", () => {
  it("cae-reconcile-defaults returns ok", async () => {
    const workspacePath = await workspaceWithSeededCaeRegistry("wk-cae-phase84-");
    const j = wkRunJson(workspacePath, "cae-reconcile-defaults", { schemaVersion: 1 });
    assert.equal(j.ok, true, j.message ?? j.code);
    assert.ok(j.data);
  });

  it("cae-export-guidance-pack returns ok", async () => {
    const workspacePath = await workspaceWithSeededCaeRegistry("wk-cae-phase84-");
    const j = wkRunJson(workspacePath, "cae-export-guidance-pack", { schemaVersion: 1 });
    assert.equal(j.ok, true, j.message ?? j.code);
    assert.ok(j.data?.pack || j.data);
  });
});
