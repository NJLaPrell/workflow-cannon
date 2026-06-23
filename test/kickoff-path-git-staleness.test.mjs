import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { evaluatePathStaleness } from "../dist/modules/task-engine/kickoff/path-git-staleness.js";

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function initRepo(tmp) {
  git(tmp, ["init"]);
  git(tmp, ["config", "user.email", "kickoff@test.local"]);
  git(tmp, ["config", "user.name", "Kickoff Test"]);
}

function writeAndCommit(tmp, relPath, contents, message, dateIso) {
  const abs = path.join(tmp, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: dateIso,
    GIT_COMMITTER_DATE: dateIso
  };
  const add = spawnSync("git", ["add", relPath], { cwd: tmp, encoding: "utf8", env });
  assert.equal(add.status, 0, add.stderr);
  const commit = spawnSync("git", ["commit", "-m", message], { cwd: tmp, encoding: "utf8", env });
  assert.equal(commit.status, 0, commit.stderr);
}

describe("kickoff path git staleness", () => {
  it("returns git-unavailable finding for non-repo workspaces", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-no-git-"));
    try {
      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: ["src/foo.ts"],
        sinceIso: "2020-01-01T00:00:00Z"
      });
      assert.equal(result.entries.length, 0);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0]?.code, "kickoff-git-unavailable");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns empty results for empty path lists", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-empty-paths-"));
    try {
      initRepo(tmp);
      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: [],
        sinceIso: "2020-01-01T00:00:00Z"
      });
      assert.deepEqual(result.entries, []);
      assert.deepEqual(result.findings, []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports missing paths without throwing", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-missing-"));
    try {
      initRepo(tmp);
      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: ["src/never-created.ts"],
        sinceIso: "2020-01-01T00:00:00Z"
      });
      assert.equal(result.entries.length, 1);
      const entry = result.entries[0];
      assert.equal(entry.path, "src/never-created.ts");
      assert.equal(entry.exists, false);
      assert.equal(entry.deleted, false);
      assert.ok(result.findings.some((f) => f.code === "kickoff-scope-path-missing"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports deleted paths with exists:false", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-deleted-"));
    const rel = "src/deleted.ts";
    try {
      initRepo(tmp);
      writeAndCommit(tmp, rel, "v1\n", "add file", "2024-01-01T12:00:00Z");
      fs.unlinkSync(path.join(tmp, rel));
      const deleteCommit = spawnSync("git", ["add", rel], { cwd: tmp, encoding: "utf8" });
      assert.equal(deleteCommit.status, 0);
      const env = {
        ...process.env,
        GIT_AUTHOR_DATE: "2024-02-01T12:00:00Z",
        GIT_COMMITTER_DATE: "2024-02-01T12:00:00Z"
      };
      const commit = spawnSync("git", ["commit", "-m", "delete file"], { cwd: tmp, encoding: "utf8", env });
      assert.equal(commit.status, 0);

      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: [rel],
        sinceIso: "2024-01-15T00:00:00Z"
      });
      const entry = result.entries[0];
      assert.equal(entry.exists, false);
      assert.equal(entry.deleted, true);
      assert.ok(result.findings.some((f) => f.code === "kickoff-scope-path-deleted"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("increments commitsSinceUpdate for recent churn", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-churn-"));
    const rel = "src/churn.ts";
    try {
      initRepo(tmp);
      writeAndCommit(tmp, rel, "v1\n", "initial", "2024-01-01T12:00:00Z");
      writeAndCommit(tmp, rel, "v2\n", "second", "2024-03-01T12:00:00Z");
      writeAndCommit(tmp, rel, "v3\n", "third", "2024-03-02T12:00:00Z");

      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: [rel],
        sinceIso: "2024-02-01T00:00:00Z",
        staleCommitThreshold: 2
      });
      const entry = result.entries[0];
      assert.equal(entry.exists, true);
      assert.equal(entry.deleted, false);
      assert.ok(entry.commitsSinceUpdate >= 2);
      assert.ok(entry.lastCommitIso?.startsWith("2024-03"));
      assert.ok(result.findings.some((f) => f.code === "kickoff-scope-path-stale"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("treats quiet paths as clean without stale findings", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-clean-"));
    const rel = "src/clean.ts";
    try {
      initRepo(tmp);
      writeAndCommit(tmp, rel, "stable\n", "initial", "2023-01-01T12:00:00Z");

      const result = await evaluatePathStaleness({
        workspacePath: tmp,
        paths: [rel],
        sinceIso: "2024-06-01T00:00:00Z",
        staleCommitThreshold: 3
      });
      const entry = result.entries[0];
      assert.equal(entry.exists, true);
      assert.equal(entry.deleted, false);
      assert.equal(entry.commitsSinceUpdate, 0);
      assert.equal(
        result.findings.some((f) => f.code === "kickoff-scope-path-stale"),
        false
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
