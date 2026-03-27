import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  findWorkflowCannonRootFromPaths,
  isWorkflowCannonWorkspace
} from "../dist/workspace-detect-core.js";

test("isWorkflowCannonWorkspace detects manifest", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ext-detect-"));
  await mkdir(path.join(ws, ".workspace-kit"), { recursive: true });
  await writeFile(path.join(ws, ".workspace-kit", "manifest.json"), '{"schemaVersion":1}', "utf8");
  assert.equal(isWorkflowCannonWorkspace(ws), true);
});

test("findWorkflowCannonRootFromPaths returns first matching path", async () => {
  const a = await mkdtemp(path.join(os.tmpdir(), "wk-ext-a-"));
  const b = await mkdtemp(path.join(os.tmpdir(), "wk-ext-b-"));
  await mkdir(path.join(b, ".workspace-kit"), { recursive: true });
  await writeFile(path.join(b, ".workspace-kit", "manifest.json"), '{"schemaVersion":1}', "utf8");
  const root = findWorkflowCannonRootFromPaths([a, b]);
  assert.equal(root, b);
});
