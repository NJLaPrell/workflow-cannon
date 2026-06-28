import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { CommandClientExecFn, CommandClientExecResult } from "./command-client.js";
import {
  pickNodeExecutable,
  resolveCliJs,
  resolveRuntimeStampExecutionPlan
} from "./command-client.js";
import { kitRunTimeoutMsForCommand } from "./kit-refresh-run-commands.js";

export type KitRunDaemonSpawnPlan = {
  executable: string;
  args: string[];
  cwd: string;
};

export type KitRunDaemonClientOptions = {
  workspaceRoot: string;
  cliPathOverride?: string;
  extensionRoot?: string;
  resolveNodeExecutable?: () => string | undefined;
  onNotice?: (message: string) => void;
  fallbackExec: CommandClientExecFn;
};

type PendingRequest = {
  resolve: (result: CommandClientExecResult) => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export function resolveKitRunDaemonSpawnPlan(
  workspaceRoot: string,
  options?: Pick<KitRunDaemonClientOptions, "cliPathOverride" | "extensionRoot" | "resolveNodeExecutable">
): KitRunDaemonSpawnPlan | { error: string } {
  if (!options?.cliPathOverride) {
    const runtimePlan = resolveRuntimeStampExecutionPlan(workspaceRoot);
    if (runtimePlan.kind === "launcher" || runtimePlan.kind === "stamped-node") {
      return {
        executable: runtimePlan.executable,
        args: [...runtimePlan.argsPrefix, "run-daemon"],
        cwd: workspaceRoot
      };
    }
    if (runtimePlan.kind === "missing" || runtimePlan.kind === "invalid") {
      return { error: runtimePlan.kind === "missing" ? "runtime stamp missing" : runtimePlan.message };
    }
  }

  const cliJs = resolveCliJs(workspaceRoot, options?.cliPathOverride, options?.extensionRoot);
  const cliPackageRoot = path.dirname(path.dirname(cliJs));
  const runtimeRoots = [cliPackageRoot, options?.extensionRoot].filter((root): root is string => Boolean(root));
  const nodeBin = pickNodeExecutable(options?.resolveNodeExecutable, workspaceRoot, [cliPackageRoot], runtimeRoots);
  return {
    executable: nodeBin,
    args: [cliJs, "run-daemon"],
    cwd: workspaceRoot
  };
}

export class KitRunDaemonClient {
  private child: ChildProcess | undefined;
  private stdoutBuffer = "";
  private readonly pending = new Map<string, PendingRequest>();
  private starting: Promise<void> | undefined;
  private disabled = false;
  private consecutiveFailures = 0;

  constructor(private readonly options: KitRunDaemonClientOptions) {}

  dispose(): void {
    this.disabled = true;
    this.killInFlight();
    this.stopChild();
  }

  killInFlight(): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.resolve({ exitCode: 1, stdout: "", stderr: "", preempted: true });
      this.pending.delete(id);
    }
    this.stopChild();
  }

  async exec(workspaceRoot: string, cliArgs: string[]): Promise<CommandClientExecResult> {
    if (this.disabled || this.consecutiveFailures >= 3) {
      return this.options.fallbackExec(workspaceRoot, cliArgs);
    }
    const commandName = cliArgs[1] ?? "";
    const timeoutMs = kitRunTimeoutMsForCommand(commandName);
    try {
      await this.ensureStarted();
      return await this.request(cliArgs, timeoutMs);
    } catch (error) {
      this.consecutiveFailures += 1;
      this.options.onNotice?.(
        `kit run daemon failed (${this.consecutiveFailures}/3): ${error instanceof Error ? error.message : String(error)}; falling back to spawn`
      );
      this.stopChild();
      if (this.consecutiveFailures >= 3) {
        this.options.onNotice?.("kit run daemon disabled for this session; using CLI spawn");
      }
      return this.options.fallbackExec(workspaceRoot, cliArgs);
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed && this.child.exitCode == null) {
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }
    this.starting = this.startChild();
    try {
      await this.starting;
      await this.request([], 5_000, true);
      this.consecutiveFailures = 0;
    } finally {
      this.starting = undefined;
    }
  }

  private async startChild(): Promise<void> {
    this.stopChild();
    const plan = resolveKitRunDaemonSpawnPlan(this.options.workspaceRoot, this.options);
    if ("error" in plan) {
      throw new Error(plan.error);
    }
    const child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env }
    });
    this.child = child;
    child.stdout?.on("data", (chunk) => this.onStdout(String(chunk)));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text.length > 0) {
        this.options.onNotice?.(`kit run daemon stderr: ${text.slice(0, 400)}`);
      }
    });
    child.on("exit", () => {
      if (this.child === child) {
        this.child = undefined;
      }
      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("kit run daemon exited"));
        this.pending.delete(id);
      }
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("kit run daemon spawn timeout")), 5_000);
      child.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private stopChild(): void {
    if (!this.child) {
      return;
    }
    const child = this.child;
    this.child = undefined;
    if (!child.killed && child.exitCode == null) {
      child.kill("SIGTERM");
    }
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.length > 0) {
        this.dispatchLine(line);
      }
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private dispatchLine(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.options.onNotice?.(`kit run daemon ignored non-json stdout: ${line.slice(0, 200)}`);
      return;
    }
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!id) {
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.resolve({
      exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : 1,
      stdout: typeof parsed.stdout === "string" ? parsed.stdout : "",
      stderr: typeof parsed.stderr === "string" ? parsed.stderr : "",
      preempted: false,
      timedOut: false
    });
  }

  private request(cliArgs: string[], timeoutMs: number, ping = false): Promise<CommandClientExecResult> {
    const child = this.child;
    if (!child?.stdin) {
      return Promise.reject(new Error("kit run daemon stdin unavailable"));
    }
    const id = randomUUID();
    return new Promise<CommandClientExecResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.stopChild();
        resolve({ exitCode: 1, stdout: "", stderr: "kit run daemon request timeout", timedOut: true });
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      const payload = ping ? { id, ping: true } : { id, cliArgs };
      child.stdin!.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }
}

export function createDaemonAwareExecFn(options: KitRunDaemonClientOptions): {
  execFn: CommandClientExecFn;
  killInFlight: () => void;
  dispose: () => void;
} {
  const client = new KitRunDaemonClient(options);
  return {
    execFn: (workspaceRoot, cliArgs) => client.exec(workspaceRoot, cliArgs),
    killInFlight: () => client.killInFlight(),
    dispose: () => client.dispose()
  };
}
