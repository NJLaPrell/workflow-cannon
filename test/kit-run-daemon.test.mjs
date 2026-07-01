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

/** Spawn one daemon, send several requests over its stdin, collect responses by id. */
function daemonSession(cwd, requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliJs, "run-daemon"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let buffer = "";
    let stderr = "";
    const responses = new Map();
    const expected = requests.map((r) => r.id);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("{")) {
          const parsed = JSON.parse(line);
          if (parsed.id) {
            responses.set(parsed.id, parsed);
          }
        }
        nl = buffer.indexOf("\n");
      }
      if (expected.every((id) => responses.has(id))) {
        child.stdin.end();
      }
    });
    child.on("error", reject);
    child.on("close", () => resolve({ responses, stderr }));
    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`);
    }
  });
}

test("run-daemon serves several sequential requests from one warm (cached) process", async () => {
  const { responses } = await daemonSession(repoRoot, [
    { id: "seq-1", cliArgs: ["run", "get-kit-persistence-map", "{}"] },
    { id: "seq-2", cliArgs: ["run", "list-commands", "{}"] },
    { id: "seq-3", cliArgs: ["run", "get-kit-persistence-map", "{}"] }
  ]);

  const first = responses.get("seq-1");
  const catalog = responses.get("seq-2");
  const second = responses.get("seq-3");

  assert.ok(first && catalog && second, "expected all three responses");
  // Same read command before and after a different command still resolves correctly
  // against the cached registry/router.
  assert.equal(first.exitCode, 0);
  assert.match(first.stdout, /"ok"\s*:\s*true/);
  assert.equal(second.exitCode, 0);
  assert.match(second.stdout, /"ok"\s*:\s*true/);
  // The command catalog is served from the cached router index.
  assert.equal(catalog.exitCode, 0);
  assert.match(catalog.stdout, /get-kit-persistence-map/);
});
