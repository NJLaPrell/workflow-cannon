import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadWorkspaceDotenv } from "../dist/core/load-workspace-dotenv.js";

test("loadWorkspaceDotenv: applies .env when var unset", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-dotenv-"));
  await writeFile(
    path.join(dir, ".env"),
    'WORKSPACE_KIT_POLICY_APPROVAL={"confirmed":true,"rationale":"from-dotenv"}\n',
    "utf8"
  );
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  try {
    loadWorkspaceDotenv(dir);
    const raw = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    assert.ok(raw);
    assert.deepEqual(JSON.parse(raw), { confirmed: true, rationale: "from-dotenv" });
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    else process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
  }
});

test("loadWorkspaceDotenv: does not override existing env", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-dotenv2-"));
  await writeFile(
    path.join(dir, ".env"),
    'WORKSPACE_KIT_POLICY_APPROVAL={"confirmed":true,"rationale":"from-file"}\n',
    "utf8"
  );
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  process.env.WORKSPACE_KIT_POLICY_APPROVAL = JSON.stringify({
    confirmed: true,
    rationale: "shell-wins"
  });
  try {
    loadWorkspaceDotenv(dir);
    assert.deepEqual(JSON.parse(process.env.WORKSPACE_KIT_POLICY_APPROVAL), {
      confirmed: true,
      rationale: "shell-wins"
    });
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    else process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
  }
});

test("loadWorkspaceDotenv: finds .env in parent directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-dotenv3-"));
  await writeFile(
    path.join(root, ".env"),
    'WORKSPACE_KIT_POLICY_APPROVAL={"confirmed":true,"rationale":"parent"}\n',
    "utf8"
  );
  const sub = path.join(root, "packages", "foo");
  await mkdir(sub, { recursive: true });
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  try {
    loadWorkspaceDotenv(sub);
    assert.deepEqual(JSON.parse(process.env.WORKSPACE_KIT_POLICY_APPROVAL), {
      confirmed: true,
      rationale: "parent"
    });
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    else process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
  }
});
