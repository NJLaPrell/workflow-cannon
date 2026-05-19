import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  hasGitDestructiveApproval,
  installGitPolicyHooks,
  isProtectedRef,
  uninstallGitPolicyHooks
} from "../dist/core/git-policy-hooks.js";

test("isProtectedRef matches main, master, and release phase branches", () => {
  assert.equal(isProtectedRef("refs/heads/main"), true);
  assert.equal(isProtectedRef("refs/heads/master"), true);
  assert.equal(isProtectedRef("refs/heads/release/phase-102"), true);
  assert.equal(isProtectedRef("refs/heads/feature/T1-slug"), false);
});

test("installGitPolicyHooks writes executable pre-push and pre-commit hooks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-git-hooks-"));
  try {
    const result = installGitPolicyHooks(tmp);
    assert.equal(result.installed.length, 2);
    for (const rel of result.installed) {
      const hookPath = path.join(tmp, rel);
      assert.ok(fs.existsSync(hookPath));
      const mode = fs.statSync(hookPath).mode & 0o111;
      assert.ok(mode > 0, `hook ${rel} should be executable`);
      const body = fs.readFileSync(hookPath, "utf8");
      assert.match(body, /workspace-kit git-policy/);
    }
  } finally {
    uninstallGitPolicyHooks(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("hasGitDestructiveApproval reads WORKSPACE_KIT_POLICY_APPROVAL env", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-git-approval-"));
  try {
    process.env.WORKSPACE_KIT_POLICY_APPROVAL = JSON.stringify({ confirmed: true, rationale: "test" });
    assert.equal(hasGitDestructiveApproval(tmp), true);
  } finally {
    delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
