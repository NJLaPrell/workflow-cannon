import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliJs = path.join(repoRoot, "dist", "cli.js");

function daemonRoundTrip(cwd, requestLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliJs, "run-daemon"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.includes("\n")) {
        child.stdin.end();
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = stdout.trim().split("\n").find((l) => l.trim().startsWith("{"));
      if (!line) {
        reject(new Error(`no daemon response stdout=${stdout.slice(0, 200)} exit=${String(code)}`));
        return;
      }
      resolve(JSON.parse(line));
    });
    child.stdin.write(`${requestLine}\n`);
  });
}

test("run-daemon answers ping", async () => {
  const res = await daemonRoundTrip(repoRoot, JSON.stringify({ id: "ping-1", ping: true }));
  assert.equal(res.id, "ping-1");
  assert.equal(res.pong, true);
  assert.equal(res.exitCode, 0);
});

test("run-daemon runs get-kit-persistence-map via handleRunCommand", async () => {
  const res = await daemonRoundTrip(
    repoRoot,
    JSON.stringify({
      id: "run-1",
      cliArgs: ["run", "get-kit-persistence-map", "{}"]
    })
  );
  assert.equal(res.id, "run-1");
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /"ok"\s*:\s*true/);
});
