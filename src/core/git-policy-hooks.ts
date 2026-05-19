import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const GIT_HOOKS_DIR_RELATIVE = ".workspace-kit/git-hooks";
export const GIT_POLICY_APPROVAL_RELATIVE = ".workspace-kit/policy/git-destructive-approval.json";

const PROTECTED_BRANCH_PATTERNS = [
  /^refs\/heads\/main$/,
  /^refs\/heads\/master$/,
  /^refs\/heads\/release\/phase-\d+$/
];

export function isProtectedRef(ref: string): boolean {
  return PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(ref));
}

export function hasGitDestructiveApproval(workspacePath: string): boolean {
  if (process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim()) {
    try {
      const parsed = JSON.parse(process.env.WORKSPACE_KIT_POLICY_APPROVAL) as { confirmed?: boolean };
      if (parsed.confirmed === true) {
        return true;
      }
    } catch {
      /* fall through */
    }
  }
  const approvalPath = path.join(workspacePath, GIT_POLICY_APPROVAL_RELATIVE);
  if (!fs.existsSync(approvalPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as {
      confirmed?: boolean;
      expiresAt?: string;
    };
    if (parsed.confirmed !== true) {
      return false;
    }
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hookScriptHeader(): string {
  return `#!/usr/bin/env bash
# Installed by workspace-kit (install-git-hooks). Blocks destructive git on protected branches
# unless WORKSPACE_KIT_POLICY_APPROVAL or ${GIT_POLICY_APPROVAL_RELATIVE} grants approval.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APPROVAL_FILE="$ROOT/${GIT_POLICY_APPROVAL_RELATIVE}"
has_approval() {
  if [[ -n "\${WORKSPACE_KIT_POLICY_APPROVAL:-}" ]]; then
    node -e "const j=JSON.parse(process.env.WORKSPACE_KIT_POLICY_APPROVAL||'{}'); process.exit(j.confirmed===true?0:1)" 2>/dev/null && return 0
  fi
  if [[ -f "$APPROVAL_FILE" ]]; then
    node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const ok=j.confirmed===true&&(!j.expiresAt||Date.parse(j.expiresAt)>Date.now()); process.exit(ok?0:1)" "$APPROVAL_FILE" 2>/dev/null && return 0
  fi
  return 1
}
protected_ref() {
  case "$1" in
    refs/heads/main|refs/heads/master|refs/heads/release/phase-*) return 0 ;;
    *) return 1 ;;
  esac
}
`;
}

function prePushHookBody(): string {
  return `${hookScriptHeader()}
while read -r local_ref local_sha remote_ref remote_sha; do
  [[ -z "$remote_ref" ]] && continue
  protected_ref "$remote_ref" || continue
  # force push: local_sha is all-zero (delete) or not ancestor
  zero="0000000000000000000000000000000000000000"
  if [[ "$local_sha" == "$zero" ]] || ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    if has_approval; then
      exit 0
    fi
    echo "workspace-kit git-policy: blocked force/rewritten push to protected branch $remote_ref" >&2
    echo "Set WORKSPACE_KIT_POLICY_APPROVAL='{\"confirmed\":true,\"rationale\":\"…\"}' or write $APPROVAL_FILE" >&2
    exit 1
  fi
done
exit 0
`;
}

function preCommitHookBody(): string {
  return `${hookScriptHeader()}
branch="$(git symbolic-ref -q HEAD 2>/dev/null || true)"
if [[ -n "$branch" ]] && protected_ref "$branch"; then
  if has_approval; then
    exit 0
  fi
  echo "workspace-kit git-policy: direct commits on protected branch $branch require approval" >&2
  echo "Use a task branch, or set WORKSPACE_KIT_POLICY_APPROVAL / $APPROVAL_FILE" >&2
  exit 1
fi
# Block reset --hard while on a protected branch (detect via reflog action when set)
if [[ "\${GIT_REFLOG_ACTION:-}" == "reset: moving to HEAD" ]] || [[ "\${GIT_REFLOG_ACTION:-}" == reset* ]]; then
  if [[ -n "$branch" ]] && protected_ref "$branch" && ! has_approval; then
    echo "workspace-kit git-policy: reset on protected branch requires approval" >&2
    exit 1
  fi
fi
exit 0
`;
}

export type GitHooksInstallResult = {
  hooksDir: string;
  hooksPathConfig: string;
  installed: string[];
};

export function installGitPolicyHooks(workspacePath: string): GitHooksInstallResult {
  const hooksDir = path.join(workspacePath, GIT_HOOKS_DIR_RELATIVE);
  fs.mkdirSync(hooksDir, { recursive: true });
  const hooks: Record<string, string> = {
    "pre-push": prePushHookBody(),
    "pre-commit": preCommitHookBody()
  };
  const installed: string[] = [];
  for (const [name, body] of Object.entries(hooks)) {
    const hookPath = path.join(hooksDir, name);
    fs.writeFileSync(hookPath, body, { encoding: "utf8", mode: 0o755 });
    installed.push(path.relative(workspacePath, hookPath));
  }
  const hooksPathConfig = GIT_HOOKS_DIR_RELATIVE;
  return { hooksDir, hooksPathConfig, installed };
}

export function uninstallGitPolicyHooks(workspacePath: string): { removed: string[] } {
  const hooksDir = path.join(workspacePath, GIT_HOOKS_DIR_RELATIVE);
  const removed: string[] = [];
  if (fs.existsSync(hooksDir)) {
    for (const name of fs.readdirSync(hooksDir)) {
      const hookPath = path.join(hooksDir, name);
      if (fs.statSync(hookPath).isFile()) {
        fs.unlinkSync(hookPath);
        removed.push(path.relative(workspacePath, hookPath));
      }
    }
    try {
      fs.rmdirSync(hooksDir);
    } catch {
      /* non-empty */
    }
  }
  return { removed };
}

export function readGitHooksPathFromRepo(workspacePath: string): string | null {
  const gitDir = path.join(workspacePath, ".git");
  if (!fs.existsSync(gitDir)) {
    return null;
  }
  try {
    const out = execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: workspacePath,
      encoding: "utf8"
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function setGitHooksPath(workspacePath: string, hooksPath: string | null): void {
  if (hooksPath === null) {
    try {
      execFileSync("git", ["config", "--unset", "core.hooksPath"], { cwd: workspacePath, stdio: "pipe" });
    } catch {
      /* already unset */
    }
    return;
  }
  execFileSync("git", ["config", "core.hooksPath", hooksPath], { cwd: workspacePath, stdio: "pipe" });
}
