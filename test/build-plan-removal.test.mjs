/** T100840 — build-plan command removed after planner-chat dogfood gates. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../dist/cli.js";

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-build-plan-removed-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

test("build-plan is not registered after sunset removal", async () => {
  const workspace = await tmpWorkspace();
  const lines = [];
  const errors = [];
  const exitCode = await runCli(
    ["run", "build-plan", JSON.stringify({ planningType: "new-feature" })],
    {
      cwd: workspace,
      writeLine: (m) => lines.push(m),
      writeError: (m) => errors.push(m)
    }
  );
  assert.notEqual(exitCode, 0);
  const payload = JSON.parse(lines.at(-1) ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(String(payload.code), /unknown-command|unsupported-command|command-not-found/i);
});
