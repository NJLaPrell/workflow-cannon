import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const LOCK_REL = ".workspace-kit/improvement/transcript-hook.lock";
const EVENT_LOG_REL = ".workspace-kit/improvement/transcript-hook-events.jsonl";
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

function appendHookEvent(
  workspacePath: string,
  event: "skipped" | "started" | "completed" | "failed",
  details: Record<string, unknown>
): void {
  const fp = path.join(workspacePath, EVENT_LOG_REL);
  try {
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(
      fp,
      `${JSON.stringify({
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        event,
        ...details
      })}\n`,
      { encoding: "utf8", flag: "a" }
    );
  } catch {
    // Observability must never block task transitions.
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
  if (mode === "off") {
    appendHookEvent(workspacePath, "skipped", { reason: "hook-mode-off" });
    return;
  }
  if (hookLockBusy(workspacePath)) {
    appendHookEvent(workspacePath, "skipped", { reason: "lock-busy", mode });
    return;
  }

  let subcommand = "sync-transcripts";
  if (mode === "ingest" && process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim()) {
    subcommand = "ingest-transcripts";
  }

  const cli = resolveWorkspaceKitCli(workspacePath);
  if (!cli) {
    appendHookEvent(workspacePath, "failed", {
      reason: "cli-not-found",
      mode,
      subcommand
    });
    return;
  }

  const fp = lockPath(workspacePath);
  try {
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, `${JSON.stringify({ at: new Date().toISOString(), subcommand })}\n`, "utf8");
  } catch {
    appendHookEvent(workspacePath, "failed", {
      reason: "lock-write-failed",
      mode,
      subcommand
    });
    return;
  }
  appendHookEvent(workspacePath, "started", { mode, subcommand });

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
    appendHookEvent(workspacePath, "completed", { mode, subcommand });
  });
  child.on("error", () => {
    try {
      unlinkSync(fp);
    } catch {
      /* ignore */
    }
    appendHookEvent(workspacePath, "failed", {
      reason: "spawn-error",
      mode,
      subcommand
    });
  });
}
