import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAtPath } from "./workspace-kit-config.js";

export type LifecycleHookMode = "off" | "observe" | "enforce";

export type LifecycleHookEvent =
  | "before-task-transition"
  | "after-task-transition"
  | "before-module-command"
  | "after-module-command"
  | "before-task-store-persist"
  | "after-task-store-persist"
  | "before-pr-mutation"
  | "after-pr-mutation";

export type LifecycleHookHandlerConfig = {
  id: string;
  order: number;
  events: string[];
  kind: "node" | "shell";
  /** Workspace-relative path for kind `node` */
  modulePath?: string;
  /** argv for kind `shell` (no shell unless shellScript set) */
  argv?: string[];
  /** When set, run `/bin/sh -c <shellScript>` with cwd workspace (dangerous; documented). */
  shellScript?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type LifecycleHooksConfig = {
  enabled: boolean;
  mode: LifecycleHookMode;
  traceRelativePath: string;
  handlers: LifecycleHookHandlerConfig[];
};

export type HookHandlerVerdict =
  | { verdict: "allow" }
  | { verdict: "deny"; reason: string }
  | { verdict: "modifyTransition"; action?: string }
  | { verdict: "modifyCommandArgs"; patch: Record<string, unknown> };

export type HookEmitResult = {
  denied?: { reason: string };
  actionOverride?: string;
  commandArgsPatch?: Record<string, unknown>;
};

const DEFAULT_HOOKS: LifecycleHooksConfig = {
  enabled: false,
  mode: "off",
  traceRelativePath: ".workspace-kit/kit/lifecycle-hook-traces.jsonl",
  handlers: []
};

function readLifecycleHooksConfig(effective: Record<string, unknown>): LifecycleHooksConfig {
  const kit = getAtPath(effective, "kit") as Record<string, unknown> | undefined;
  const raw = kit?.lifecycleHooks;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_HOOKS };
  }
  const h = raw as Record<string, unknown>;
  const enabled = h.enabled === true;
  const mode = (h.mode as LifecycleHookMode) ?? "off";
  const traceRelativePath =
    typeof h.traceRelativePath === "string" && h.traceRelativePath.trim()
      ? h.traceRelativePath.trim()
      : DEFAULT_HOOKS.traceRelativePath;
  const handlersRaw = Array.isArray(h.handlers) ? h.handlers : [];
  const handlers: LifecycleHookHandlerConfig[] = [];
  for (const entry of handlersRaw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    const kind = e.kind === "shell" ? "shell" : e.kind === "node" ? "node" : "";
    const order = typeof e.order === "number" && Number.isFinite(e.order) ? e.order : 0;
    const events = Array.isArray(e.events)
      ? e.events.filter((x): x is string => typeof x === "string")
      : [];
    if (!id || !kind || events.length === 0) continue;
    const timeoutMs =
      typeof e.timeoutMs === "number" && e.timeoutMs > 0 ? Math.min(e.timeoutMs, 120_000) : 30_000;
    const maxOutputBytes =
      typeof e.maxOutputBytes === "number" && e.maxOutputBytes > 0
        ? Math.min(e.maxOutputBytes, 2_000_000)
        : 65_536;
    if (kind === "node") {
      const modulePath = typeof e.modulePath === "string" ? e.modulePath : "";
      if (!modulePath) continue;
      handlers.push({ id, order, events, kind: "node", modulePath, timeoutMs, maxOutputBytes });
    } else {
      const shellScript = typeof e.shellScript === "string" ? e.shellScript : undefined;
      const argv = Array.isArray(e.argv) ? e.argv.filter((x): x is string => typeof x === "string") : [];
      if (!shellScript && argv.length === 0) continue;
      handlers.push({
        id,
        order,
        events,
        kind: "shell",
        argv: argv.length ? argv : undefined,
        shellScript,
        timeoutMs,
        maxOutputBytes
      });
    }
  }
  return { enabled, mode: mode === "enforce" || mode === "observe" ? mode : "off", traceRelativePath, handlers };
}

function resolveSafeModulePath(workspacePath: string, rel: string): string | null {
  const abs = path.resolve(workspacePath, rel);
  const normRoot = path.resolve(workspacePath) + path.sep;
  if (!abs.startsWith(normRoot)) return null;
  if (!/\.(mjs|cjs|js)$/i.test(abs)) return null;
  return abs;
}

async function appendTrace(
  workspacePath: string,
  traceRel: string,
  row: Record<string, unknown>
): Promise<void> {
  const file = path.join(workspacePath, traceRel);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const line = JSON.stringify({ ...row, timestamp: new Date().toISOString() }) + "\n";
  await fs.appendFile(file, line, "utf8");
}

function summarizeCommandArgs(args: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(args).filter((k) => k !== "policyApproval");
  return { keys, keyCount: keys.length };
}

async function invokeNodeHandler(
  workspacePath: string,
  handler: LifecycleHookHandlerConfig,
  event: LifecycleHookEvent,
  payload: Record<string, unknown>
): Promise<{ verdict: HookHandlerVerdict; error?: string; durationMs: number }> {
  const rel = handler.modulePath!;
  const abs = resolveSafeModulePath(workspacePath, rel);
  if (!abs) {
    return {
      verdict: { verdict: "allow" },
      error: "invalid-module-path",
      durationMs: 0
    };
  }
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(abs).href);
    const fn = (mod as { handle?: (ctx: unknown) => unknown }).handle;
    if (typeof fn !== "function") {
      return { verdict: { verdict: "allow" }, error: "missing-export-handle", durationMs: Date.now() - t0 };
    }
    const ctx = { event, payload, workspacePath };
    const timeoutMs = handler.timeoutMs ?? 30_000;
    const out = await Promise.race([
      Promise.resolve(fn(ctx)),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("handler-timeout")), timeoutMs)
      )
    ]);
    const durationMs = Date.now() - t0;
    if (!out || typeof out !== "object") {
      return { verdict: { verdict: "allow" }, durationMs };
    }
    const o = out as Record<string, unknown>;
    if (o.verdict === "deny" && typeof o.reason === "string") {
      return { verdict: { verdict: "deny", reason: o.reason }, durationMs };
    }
    if (o.verdict === "modifyTransition" && typeof o.action === "string") {
      return {
        verdict: { verdict: "modifyTransition", action: o.action },
        durationMs
      };
    }
    if (o.verdict === "modifyCommandArgs" && o.patch && typeof o.patch === "object" && !Array.isArray(o.patch)) {
      return {
        verdict: {
          verdict: "modifyCommandArgs",
          patch: o.patch as Record<string, unknown>
        },
        durationMs
      };
    }
    return { verdict: { verdict: "allow" }, durationMs };
  } catch (e) {
    return {
      verdict: { verdict: "allow" },
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0
    };
  }
}

async function invokeShellHandler(
  workspacePath: string,
  handler: LifecycleHookHandlerConfig,
  event: LifecycleHookEvent,
  payload: Record<string, unknown>
): Promise<{ verdict: HookHandlerVerdict; error?: string; durationMs: number; stderr?: string }> {
  const t0 = Date.now();
  const timeoutMs = handler.timeoutMs ?? 30_000;
  const maxOut = handler.maxOutputBytes ?? 65_536;
  let cmd: string;
  let args: string[];
  if (handler.shellScript) {
    cmd = "/bin/sh";
    args = ["-c", handler.shellScript];
  } else if (handler.argv && handler.argv.length > 0) {
    cmd = handler.argv[0]!;
    args = handler.argv.slice(1);
  } else {
    return { verdict: { verdict: "allow" }, error: "shell-misconfigured", durationMs: 0 };
  }
  const stdin = JSON.stringify({ event, payload }) + "\n";
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, WORKSPACE_KIT_HOOK_EVENT: event }
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (ch: Buffer) => {
      stdout += ch.toString("utf8");
      if (stdout.length > maxOut) {
        killed = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr?.on("data", (ch: Buffer) => {
      stderr += ch.toString("utf8");
      if (stderr.length > maxOut) {
        killed = true;
        child.kill("SIGTERM");
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        verdict: { verdict: "allow" },
        error: err.message,
        durationMs: Date.now() - t0,
        stderr
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - t0;
      if (killed) {
        resolve({ verdict: { verdict: "allow" }, error: "timeout-or-output-cap", durationMs, stderr });
        return;
      }
      if (code !== 0) {
        resolve({
          verdict: { verdict: "allow" },
          error: `exit-${code}`,
          durationMs,
          stderr: stderr.slice(0, 2000)
        });
        return;
      }
      const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
      if (!line) {
        resolve({ verdict: { verdict: "allow" }, durationMs, stderr });
        return;
      }
      try {
        const o = JSON.parse(line) as Record<string, unknown>;
        if (o.verdict === "deny" && typeof o.reason === "string") {
          resolve({ verdict: { verdict: "deny", reason: o.reason }, durationMs, stderr });
          return;
        }
        if (o.verdict === "modifyTransition" && typeof o.action === "string") {
          resolve({ verdict: { verdict: "modifyTransition", action: o.action }, durationMs, stderr });
          return;
        }
        if (o.verdict === "modifyCommandArgs" && o.patch && typeof o.patch === "object") {
          resolve({
            verdict: {
              verdict: "modifyCommandArgs",
              patch: o.patch as Record<string, unknown>
            },
            durationMs,
            stderr
          });
          return;
        }
      } catch {
        resolve({ verdict: { verdict: "allow" }, error: "invalid-json-line", durationMs, stderr });
        return;
      }
      resolve({ verdict: { verdict: "allow" }, durationMs, stderr });
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

export class KitLifecycleHookBus {
  private readonly cfg: LifecycleHooksConfig;

  constructor(
    private readonly workspacePath: string,
    effectiveConfig: Record<string, unknown>
  ) {
    this.cfg = readLifecycleHooksConfig(effectiveConfig);
  }

  isEnabled(): boolean {
    return this.cfg.enabled === true && this.cfg.handlers.length > 0 && this.cfg.mode !== "off";
  }

  getMode(): LifecycleHookMode {
    return this.cfg.mode;
  }

  private handlersFor(event: LifecycleHookEvent): LifecycleHookHandlerConfig[] {
    return this.cfg.handlers
      .filter((h) => h.events.includes(event))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private async trace(
    row: Record<string, unknown>
  ): Promise<void> {
    if (!this.cfg.enabled) return;
    try {
      await appendTrace(this.workspacePath, this.cfg.traceRelativePath, row);
    } catch {
      /* best-effort */
    }
  }

  async emit(
    event: LifecycleHookEvent,
    payload: Record<string, unknown>
  ): Promise<HookEmitResult> {
    const result: HookEmitResult = {};
    if (!this.cfg.enabled || this.cfg.mode === "off") {
      return result;
    }
    const handlers = this.handlersFor(event);
    if (handlers.length === 0 && event !== "before-pr-mutation" && event !== "after-pr-mutation") {
      return result;
    }
    const enforce = this.cfg.mode === "enforce";
    for (const h of handlers) {
      const started = Date.now();
      let parsed: { verdict: HookHandlerVerdict; error?: string; durationMs: number; stderr?: string };
      if (h.kind === "node") {
        parsed = await invokeNodeHandler(this.workspacePath, h, event, payload);
      } else {
        parsed = await invokeShellHandler(this.workspacePath, h, event, payload);
      }
      const { verdict, error, durationMs, stderr } = parsed;
      await this.trace({
        event,
        handlerId: h.id,
        kind: h.kind,
        durationMs: durationMs ?? Date.now() - started,
        verdict: verdict.verdict,
        error,
        stderrTail: stderr ? stderr.slice(0, 500) : undefined
      });
      if (verdict.verdict === "deny") {
        if (enforce) {
          result.denied = { reason: verdict.reason };
          return result;
        }
      }
      if (enforce && verdict.verdict === "modifyTransition" && verdict.action) {
        result.actionOverride = verdict.action;
      }
      if (enforce && verdict.verdict === "modifyCommandArgs" && verdict.patch) {
        result.commandArgsPatch = {
          ...(result.commandArgsPatch ?? {}),
          ...verdict.patch
        };
      }
    }
    return result;
  }

  async emitBeforeModuleCommand(
    command: string,
    args: Record<string, unknown>
  ): Promise<HookEmitResult> {
    return this.emit("before-module-command", {
      command,
      argsSummary: summarizeCommandArgs(args)
    });
  }

  async emitAfterModuleCommand(command: string, ok: boolean, code?: string): Promise<void> {
    await this.emit("after-module-command", { command, ok, code: code ?? null });
  }

  async emitBeforeTaskTransition(payload: Record<string, unknown>): Promise<HookEmitResult> {
    return this.emit("before-task-transition", payload);
  }

  async emitAfterTaskTransition(payload: Record<string, unknown>): Promise<void> {
    await this.emit("after-task-transition", payload);
  }

  async emitBeforeTaskStorePersist(payload: Record<string, unknown>): Promise<HookEmitResult> {
    return this.emit("before-task-store-persist", payload);
  }

  async emitAfterTaskStorePersist(payload: Record<string, unknown>): Promise<void> {
    await this.emit("after-task-store-persist", payload);
  }

  /** Reserved stub — no kit choke point in v1 unless handlers are registered for documentation/tests. */
  async emitPrMutationStub(phase: "before" | "after", payload: Record<string, unknown>): Promise<HookEmitResult> {
    const ev = phase === "before" ? "before-pr-mutation" : "after-pr-mutation";
    return this.emit(ev, payload);
  }
}

export function createKitLifecycleHookBus(
  workspacePath: string,
  effectiveConfig: Record<string, unknown>
): KitLifecycleHookBus {
  return new KitLifecycleHookBus(workspacePath, effectiveConfig);
}
