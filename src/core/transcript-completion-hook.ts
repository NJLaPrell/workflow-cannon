import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const LOCK_REL = ".workspace-kit/improvement/transcript-hook.lock";
const LOCK_STALE_MS = 120_000;

export function readAfterTaskCompletedHook(effective: Record<string, unknown>): "off" | "sync" | "ingest" {
  const imp = effective.improvement;
  if (!imp || typeof imp !== "object" || Array.isArray(imp)) return "off";
  const hooks = (imp as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return "off";
  const v = (hooks as Record<string, unknown>).afterTaskCompleted;
  if (v === "sync" || v === "ingest") return v;
  return "off";
}

export function resolveWorkspaceKitCli(workspacePath: string): string | null {
  const candidates = [
    path.join(workspacePath, "node_modules", "@workflow-cannon", "workspace-kit", "dist", "cli.js"),
    path.join(workspacePath, "dist", "cli.js")
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function lockPath(workspacePath: string): string {
  return path.join(workspacePath, LOCK_REL);
}

function hookLockBusy(workspacePath: string): boolean {
  const fp = lockPath(workspacePath);
  try {
    const st = statSync(fp);
    return Date.now() - st.mtimeMs < LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/**
 * After a task reaches `completed`, optionally spawn sync/ingest without blocking the transition (T274).
 * Ingest requires WORKSPACE_KIT_POLICY_APPROVAL in the parent env or falls back to sync.
 */
export function maybeSpawnTranscriptHookAfterCompletion(
  workspacePath: string,
  effective: Record<string, unknown>
): void {
  const mode = readAfterTaskCompletedHook(effective);
  if (mode === "off") return;
  if (hookLockBusy(workspacePath)) return;

  let subcommand = "sync-transcripts";
  if (mode === "ingest" && process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim()) {
    subcommand = "ingest-transcripts";
  }

  const cli = resolveWorkspaceKitCli(workspacePath);
  if (!cli) return;

  const fp = lockPath(workspacePath);
  try {
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, `${JSON.stringify({ at: new Date().toISOString(), subcommand })}\n`, "utf8");
  } catch {
    return;
  }

  const child = spawn(process.execPath, [cli, "run", subcommand, "{}"], {
    cwd: workspacePath,
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
  child.on("exit", () => {
    try {
      unlinkSync(fp);
    } catch {
      /* ignore */
    }
  });
  child.on("error", () => {
    try {
      unlinkSync(fp);
    } catch {
      /* ignore */
    }
  });
}
