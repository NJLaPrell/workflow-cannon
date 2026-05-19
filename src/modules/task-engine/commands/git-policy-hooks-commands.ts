import fs from "node:fs";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  GIT_HOOKS_DIR_RELATIVE,
  installGitPolicyHooks,
  readGitHooksPathFromRepo,
  setGitHooksPath,
  uninstallGitPolicyHooks
} from "../../../core/git-policy-hooks.js";

export function runInstallGitHooksCommand(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const gitDir = path.join(ctx.workspacePath, ".git");
  try {
    if (!fs.existsSync(gitDir)) {
      return {
        ok: false,
        code: "git-not-a-repository",
        message: "install-git-hooks requires a git repository at the workspace root."
      };
    }
  } catch {
    return { ok: false, code: "git-not-a-repository", message: "Could not verify .git directory." };
  }

  const result = installGitPolicyHooks(ctx.workspacePath);
  setGitHooksPath(ctx.workspacePath, result.hooksPathConfig);
  return {
    ok: true,
    code: "git-hooks-installed",
    message: `Installed git policy hooks (${result.installed.length} files); core.hooksPath=${result.hooksPathConfig}`,
    data: {
      schemaVersion: 1,
      hooksPath: result.hooksPathConfig,
      hooksDirRelative: GIT_HOOKS_DIR_RELATIVE,
      installed: result.installed,
      optOut: "wk run uninstall-git-hooks or git config --unset core.hooksPath"
    }
  };
}

export function runUninstallGitHooksCommand(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const removed = uninstallGitPolicyHooks(ctx.workspacePath);
  const current = readGitHooksPathFromRepo(ctx.workspacePath);
  if (current === GIT_HOOKS_DIR_RELATIVE) {
    setGitHooksPath(ctx.workspacePath, null);
  }
  return {
    ok: true,
    code: "git-hooks-uninstalled",
    message: `Removed ${removed.removed.length} git policy hook file(s)`,
    data: { schemaVersion: 1, removed: removed.removed, hooksPathCleared: current === GIT_HOOKS_DIR_RELATIVE }
  };
}
