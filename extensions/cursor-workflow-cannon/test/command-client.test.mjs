import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { CommandClient, parseRunCommandOutput, pickNodeExecutable } from "../dist/runtime/command-client.js";

test("pickNodeExecutable uses resolver path when it exists", () => {
  const picked = pickNodeExecutable(() => process.execPath);
  assert.equal(picked, process.execPath);
});

test("pickNodeExecutable falls through when resolver path is bogus", () => {
  const picked = pickNodeExecutable(() => "/__no_such__/node");
  assert.notEqual(picked, "/__no_such__/node");
});

test("parseRunCommandOutput parses valid JSON", () => {
  const out = parseRunCommandOutput('{"ok":true,"code":"tasks-listed"}', 0);
  assert.equal(out.ok, true);
  assert.equal(out.code, "tasks-listed");
});

test("parseRunCommandOutput parses pretty-printed JSON", () => {
  const out = parseRunCommandOutput('{\n  "ok": true,\n  "code": "tasks-listed"\n}\n', 0);
  assert.equal(out.ok, true);
  assert.equal(out.code, "tasks-listed");
});

test("parseRunCommandOutput returns parse error on malformed output", () => {
  const out = parseRunCommandOutput("not-json", 1);
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-json-parse");
});

test("parseRunCommandOutput remediates pnpm banner contamination", () => {
  const out = parseRunCommandOutput(
    `> @workflow-cannon/workspace-kit@0.73.0 wk /repo
> node dist/cli.js run list-tasks '{}'

{"ok":true}`,
    0
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "extension-json-parse");
  assert.equal(out.details.suspectedPackageManagerBanner, true);
  assert.match(out.message, /pnpm exec wk|node dist\/cli\.js/);
});

test("CommandClient.run handles non-zero with valid JSON payload", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => ({
      exitCode: 1,
      stdout: '{"ok":false,"code":"policy-denied","operationId":"tasks.run-transition"}',
      stderr: ""
    })
  });
  const out = await client.run("run-transition", { taskId: "T1", action: "start" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "policy-denied");
  assert.equal(out.operationId, "tasks.run-transition");
});

test("CommandClient.config returns execution error as stderr", async () => {
  const client = new CommandClient("/tmp/noop", {
    execFn: async () => {
      throw new Error("ENOENT workspace-kit");
    }
  });
  const out = await client.config(["validate"]);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /ENOENT/);
});

test("CommandClient uses cliPathOverride when provided", async () => {
  const fakeCli = path.join(process.cwd(), "dist", "cli.js");
  const client = new CommandClient("/tmp/noop", {
    cliPathOverride: fakeCli,
    execFn: async (_root, args) => ({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, data: { argv: args } }),
      stderr: ""
    })
  });
  const out = await client.run("list-tasks", {});
  assert.equal(out.ok, true);
});
