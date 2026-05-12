import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

function git(ws, args) {
  const r = spawnSync("git", args, { cwd: ws, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
}

function ctx(ws) {
  return {
    runtimeVersion: "0.1",
    workspacePath: ws,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
}

test("buildWorkspaceCoordinationStatus: non-repo is unknown_git", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.posture, "unknown_git");
  assert.ok(s.suspectFlags.includes("git:not_a_repository"));
});

test("buildWorkspaceCoordinationStatus: clean main is safe / integration_authority", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  mkdirSync(path.join(ws, ".workspace-kit", "tasks"), { recursive: true });
  writeFileSync(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"), "");
  git(ws, ["add", ".workspace-kit/tasks/workspace-kit.db"]);
  git(ws, ["commit", "-m", "db"]);
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.authorityRole, "integration_authority");
  assert.equal(s.posture, "safe");
  assert.equal(s.taskDatabaseGitDirty, false);
});

test("buildWorkspaceCoordinationStatus: feature branch is worker_branch", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  git(ws, ["checkout", "-b", "feature/foo"]);
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.posture, "worker_branch");
  assert.equal(s.authorityRole, "worker");
});

test("buildWorkspaceCoordinationStatus: detached HEAD", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  git(ws, ["checkout", "--detach", "HEAD"]);
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.detachedHead, true);
  assert.equal(s.posture, "detached_head");
});

test("buildWorkspaceCoordinationStatus: dirty workspace", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  writeFileSync(path.join(ws, "dirty.txt"), "oops");
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.posture, "dirty_workspace");
  assert.ok(s.dirtyManifest.lineCount >= 1);
});

test("buildWorkspaceCoordinationStatus: task DB dirty in git", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  mkdirSync(path.join(ws, ".workspace-kit", "tasks"), { recursive: true });
  writeFileSync(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"), "v1");
  git(ws, ["add", ".workspace-kit/tasks/workspace-kit.db"]);
  git(ws, ["commit", "-m", "db"]);
  writeFileSync(path.join(ws, ".workspace-kit", "tasks", "workspace-kit.db"), "v2-modified");
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.taskDatabaseGitDirty, true);
  assert.equal(s.posture, "dirty_task_db");
});

test("buildWorkspaceCoordinationStatus: stale lease file under git common dir", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" });
  assert.equal(common.status, 0);
  const raw = common.stdout.trim();
  const commonAbs = path.isAbsolute(raw) ? raw : path.join(ws, raw);
  const leaseDir = path.join(commonAbs, "workflow-cannon", "leases");
  mkdirSync(leaseDir, { recursive: true });
  writeFileSync(
    path.join(leaseDir, "workspace-edit.json"),
    JSON.stringify({ expiresAt: "2000-01-01T00:00:00.000Z", leaseId: "dead" })
  );
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.lease.present, true);
  assert.equal(s.lease.status, "stale-invalid");
  assert.equal(s.lease.staleOrInvalid, true);
  assert.deepEqual(s.lease.suspectFlags, ["lease:stale_or_invalid"]);
  assert.deepEqual(s.suspectFlags, ["lease:stale_or_invalid"]);
  assert.equal(s.posture, "stale_lease");
});

test("buildWorkspaceCoordinationStatus: malformed lease is stale_lease with suspect flag", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" });
  assert.equal(common.status, 0);
  const raw = common.stdout.trim();
  const commonAbs = path.isAbsolute(raw) ? raw : path.join(ws, raw);
  const leaseDir = path.join(commonAbs, "workflow-cannon", "leases");
  mkdirSync(leaseDir, { recursive: true });
  writeFileSync(path.join(leaseDir, "workspace-edit.json"), "{");
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.lease.present, true);
  assert.equal(s.lease.status, "stale-invalid");
  assert.equal(s.lease.invalidReason, "invalid_json");
  assert.deepEqual(s.lease.suspectFlags, ["lease:stale_or_invalid"]);
  assert.deepEqual(s.suspectFlags, ["lease:stale_or_invalid"]);
  assert.equal(s.posture, "stale_lease");
});

test("buildWorkspaceCoordinationStatus: active future lease is lease_held", async () => {
  const { buildWorkspaceCoordinationStatus } = await import(
    "../dist/modules/task-engine/coordination/build-workspace-coordination-status.js"
  );
  const ws = mkdtempSync(path.join(tmpdir(), "wc-coord-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" });
  const raw = common.stdout.trim();
  const commonAbs = path.isAbsolute(raw) ? raw : path.join(ws, raw);
  const leaseDir = path.join(commonAbs, "workflow-cannon", "leases");
  mkdirSync(leaseDir, { recursive: true });
  const far = new Date(Date.now() + 3600_000).toISOString();
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" });
  assert.equal(head.status, 0);
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: ws, encoding: "utf8" });
  assert.equal(top.status, 0);
  writeFileSync(
    path.join(leaseDir, "workspace-edit.json"),
    JSON.stringify({
      schemaVersion: 1,
      expiresAt: far,
      leaseId: "live",
      agentSessionId: "sess",
      taskId: "T1",
      branch: "main",
      headSha: head.stdout.trim(),
      worktreePath: top.stdout.trim(),
      dirtyManifest: { lineCount: 0, capped: false },
      claimedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString()
    })
  );
  const s = buildWorkspaceCoordinationStatus(ctx(ws));
  assert.equal(s.lease.active, true);
  assert.equal(s.lease.status, "lease-held-by-other");
  assert.equal(s.lease.holder.agentSessionId, "sess");
  assert.equal(s.lease.holder.taskId, "T1");
  assert.deepEqual(s.lease.suspectFlags, []);
  assert.equal(s.posture, "lease_held");
});
