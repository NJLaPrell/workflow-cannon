import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createRunInvocationId,
  resolveAvailableOutputFilePath
} from "../dist/cli/run-invocation-output.js";
import { peelRunArgv } from "../dist/cli/run-helpers.js";
import { runCli } from "../dist/cli.js";

test("createRunInvocationId returns UUIDv4 shape", () => {
  const id = createRunInvocationId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("resolveAvailableOutputFilePath uses numeric suffix on collision", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-out-file-"));
  const existing = path.join(dir, "out.json");
  await fs.writeFile(existing, "{}\n", "utf8");
  const resolved = resolveAvailableOutputFilePath(dir, "out.json");
  assert.equal(resolved.outputFilePath, "out.json.1");
  assert.equal(resolved.absolutePath, path.join(dir, "out.json.1"));
});

test("peelRunArgv extracts --output-file", () => {
  const peeled = peelRunArgv(["list-tasks", "{}", "--output-file", "artifacts/out.json"]);
  assert.equal(peeled.outputFile, "artifacts/out.json");
  assert.deepEqual(peeled.rest, ["list-tasks", "{}"]);
});

test("wk run JSON includes invocationId and mirrors --output-file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-invoke-env-"));
  await fs.mkdir(path.join(dir, ".workspace-kit", "tasks"), { recursive: true });
  const dbPath = path.join(dir, ".workspace-kit", "tasks", "workspace-kit.db");
  const { default: Database } = await import("better-sqlite3");
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  db.close();

  const outPath = path.join(dir, "run-out.json");
  const cap = { lines: [], errors: [], writeLine(m) { cap.lines.push(m); }, writeError(m) { cap.errors.push(m); } };
  const code = await runCli(
    ["run", "list-planning-types", "{}", "--output-file", "run-out.json"],
    { cwd: dir, ...cap }
  );
  assert.equal(code, 0, cap.errors.join("\n"));
  const stdout = JSON.parse(cap.lines.join("\n"));
  assert.match(stdout.invocationId, /^[0-9a-f-]{36}$/i);
  assert.equal(stdout.outputFilePath, "run-out.json");
  const disk = JSON.parse(await fs.readFile(outPath, "utf8"));
  assert.equal(disk.invocationId, stdout.invocationId);
  assert.equal(disk.outputFilePath, "run-out.json");
});
