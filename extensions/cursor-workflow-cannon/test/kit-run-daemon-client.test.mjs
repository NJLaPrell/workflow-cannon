import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandClient } from "../dist/runtime/command-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

test("CommandClient kitRunDaemon:false uses spawn execFn only", async () => {
  const calls = [];
  const client = new CommandClient(repoRoot, {
    kitRunDaemon: false,
    execFn: async (_root, args) => {
      calls.push(args);
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, code: args[1] }), stderr: "" };
    }
  });
  const out = await client.run("get-kit-persistence-map", {});
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0], ["run", "get-kit-persistence-map", "{}"]);
  client.dispose();
});

test("CommandClient wires kit run daemon by default", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/runtime/command-client.ts"), "utf8");
  assert.match(src, /createDaemonAwareExecFn/);
  assert.match(src, /kitRunDaemon !== false/);
});

test("extension enables kitRunDaemon setting by default", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/extension.ts"), "utf8");
  assert.match(src, /kitRunDaemon\.enabled/);
  assert.match(src, /kitRunDaemon: readKitRunDaemonEnabled\(\)/);
});
