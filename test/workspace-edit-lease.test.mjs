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

test("workspace edit lease: claim, deny second session, release", async () => {
  const {
    runClaimWorkspaceEditLease,
    runReleaseWorkspaceEditLease,
    runWorkspaceEditStatus
  } = await import("../dist/modules/task-engine/workspace-edit-lease-commands-runtime.js");

  const ws = mkdtempSync(path.join(tmpdir(), "wc-lease-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);

  const c = ctx(ws);
  const st0 = runWorkspaceEditStatus(c, {});
  assert.equal(st0.ok, true);
  assert.equal(st0.data.present, false);
  assert.equal(st0.data.status, "lease-free");
  assert.equal(st0.data.leaseStatus.state, "lease-free");

  const pa = { policyApproval: { confirmed: true, rationale: "test" } };
  const a = runClaimWorkspaceEditLease(c, { agentSessionId: "sess-a", taskId: "T1", leaseTtlSeconds: 120, ...pa });
  assert.equal(a.ok, true);
  assert.equal(a.code, "workspace-edit-lease-claimed");

  const mine = runWorkspaceEditStatus(c, { agentSessionId: "sess-a" });
  assert.equal(mine.ok, true);
  assert.equal(mine.data.status, "lease-held-by-me");
  assert.equal(mine.data.leaseStatus.heldByCaller, true);
  assert.equal(mine.data.leaseStatus.holder.agentSessionId, "sess-a");
  assert.equal(mine.data.leaseStatus.holder.taskId, "T1");

  const otherStatus = runWorkspaceEditStatus(c, { agentSessionId: "sess-b" });
  assert.equal(otherStatus.ok, true);
  assert.equal(otherStatus.data.status, "lease-held-by-other");
  assert.equal(otherStatus.data.leaseStatus.heldByCaller, false);

  const b = runClaimWorkspaceEditLease(c, { agentSessionId: "sess-b", leaseTtlSeconds: 120, ...pa });
  assert.equal(b.ok, false);
  assert.equal(b.code, "workspace-edit-lease-held");
  assert.equal(b.data.holder.agentSessionId, "sess-a");
  assert.equal(b.data.holder.taskId, "T1");
  assert.equal(b.data.leaseStatus.state, "lease-held-by-other");
  assert.equal(b.data.recommendedNextAction, "wait");
  assert.deepEqual(b.data.alternatives, ["wait", "read_only_plan", "release_if_holder"]);

  const hb = runClaimWorkspaceEditLease(c, { agentSessionId: "sess-a", leaseTtlSeconds: 60, ...pa });
  assert.equal(hb.ok, true);
  assert.equal(hb.code, "workspace-edit-lease-renewed");

  const rel = runReleaseWorkspaceEditLease(c, { agentSessionId: "sess-a", ...pa });
  assert.equal(rel.ok, true);
  assert.equal(rel.data.released, true);

  const st1 = runWorkspaceEditStatus(c, {});
  assert.equal(st1.ok, true);
  assert.equal(st1.data.present, false);
});

test("workspace edit lease: heartbeat extends and recover stale release", async () => {
  const {
    runClaimWorkspaceEditLease,
    runHeartbeatWorkspaceEditLease,
    runReleaseWorkspaceEditLease
  } = await import("../dist/modules/task-engine/workspace-edit-lease-commands-runtime.js");

  const ws = mkdtempSync(path.join(tmpdir(), "wc-lease-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);

  const c = ctx(ws);
  const pa = { policyApproval: { confirmed: true, rationale: "test" } };
  const a = runClaimWorkspaceEditLease(c, { agentSessionId: "s1", leaseTtlSeconds: 300, ...pa });
  assert.equal(a.ok, true);

  const hb = runHeartbeatWorkspaceEditLease(c, { agentSessionId: "s1", extendLeaseSeconds: 30, ...pa });
  assert.equal(hb.ok, true);
  assert.equal(hb.code, "workspace-edit-lease-heartbeat");

  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" });
  const raw = common.stdout.trim();
  const commonAbs = path.isAbsolute(raw) ? raw : path.join(ws, raw);
  const leasePath = path.join(commonAbs, "workflow-cannon", "leases", "workspace-edit.json");
  mkdirSync(path.dirname(leasePath), { recursive: true });
  writeFileSync(
    leasePath,
    JSON.stringify({
      schemaVersion: 1,
      leaseId: "x",
      agentSessionId: "other",
      taskId: null,
      branch: "main",
      headSha: "abc",
      worktreePath: ws,
      dirtyManifest: { lineCount: 0, capped: false },
      claimedAt: "2000-01-01T00:00:00.000Z",
      heartbeatAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-02T00:00:00.000Z"
    })
  );

  const rec = runReleaseWorkspaceEditLease(c, { recoverStaleLease: true, ...pa });
  assert.equal(rec.ok, true);
  assert.equal(rec.code, "workspace-edit-lease-stale-recovered");
});

test("workspace edit lease: status reports stale and invalid leases", async () => {
  const { runWorkspaceEditStatus } = await import("../dist/modules/task-engine/workspace-edit-lease-commands-runtime.js");

  const ws = mkdtempSync(path.join(tmpdir(), "wc-lease-"));
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "t@example.com"]);
  git(ws, ["config", "user.name", "T"]);
  writeFileSync(path.join(ws, "README.md"), "x\n");
  git(ws, ["add", "README.md"]);
  git(ws, ["commit", "-m", "init"]);

  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" });
  const raw = common.stdout.trim();
  const commonAbs = path.isAbsolute(raw) ? raw : path.join(ws, raw);
  const leasePath = path.join(commonAbs, "workflow-cannon", "leases", "workspace-edit.json");
  mkdirSync(path.dirname(leasePath), { recursive: true });
  writeFileSync(
    leasePath,
    JSON.stringify({
      schemaVersion: 1,
      leaseId: "x",
      agentSessionId: "other",
      taskId: "T2",
      branch: "main",
      headSha: "abc",
      worktreePath: ws,
      dirtyManifest: { lineCount: 0, capped: false },
      claimedAt: "2000-01-01T00:00:00.000Z",
      heartbeatAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-02T00:00:00.000Z"
    })
  );

  const stale = runWorkspaceEditStatus(ctx(ws), { agentSessionId: "sess-a" });
  assert.equal(stale.ok, true);
  assert.equal(stale.data.status, "stale-invalid");
  assert.equal(stale.data.leaseStatus.invalidReason, "expired");
  assert.equal(stale.data.leaseStatus.holder.agentSessionId, "other");

  writeFileSync(leasePath, "{");
  const invalid = runWorkspaceEditStatus(ctx(ws), { agentSessionId: "sess-a" });
  assert.equal(invalid.ok, true);
  assert.equal(invalid.data.status, "stale-invalid");
  assert.equal(invalid.data.leaseStatus.invalidReason, "invalid_json");
  assert.equal(invalid.data.leaseStatus.holder, null);
});

test("workspace edit lease core: readLeaseFile rejects bad json", async () => {
  const { readLeaseFile } = await import("../dist/modules/task-engine/coordination/workspace-edit-lease.js");
  const ws = mkdtempSync(path.join(tmpdir(), "wc-lease-"));
  const p = path.join(ws, "bad.json");
  writeFileSync(p, "{");
  const r = readLeaseFile(p);
  assert.equal(r.ok, false);
});
