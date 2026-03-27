import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { CommandClient } from "../dist/runtime/command-client.js";

test("integration: client executes list-tasks through real workspace-kit cli", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const cliPath = path.join(repoRoot, "dist", "cli.js");
  const client = new CommandClient(repoRoot, { cliPathOverride: cliPath, timeoutMs: 15_000 });
  const out = await client.run("list-tasks", {});
  assert.equal(out.ok, true);
  assert.equal(out.code, "tasks-listed");
});
