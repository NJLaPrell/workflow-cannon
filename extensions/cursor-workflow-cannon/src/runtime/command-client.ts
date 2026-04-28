import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type KitRunResult = {
  ok: boolean;
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CommandClientExecResult = { exitCode: number; stdout: string; stderr: string };
export type CommandClientExecFn = (workspaceRoot: string, cliArgs: string[]) => Promise<CommandClientExecResult>;

type CommandClientOptions = {
  cliPathOverride?: string;
  execFn?: CommandClientExecFn;
  timeoutMs?: number;
  /**
   * Return a path to `node` (or `node` / `nodejs` to use PATH). Used so the CLI runs with the same
   * Node as `pnpm install` / native addons — not the editor's `process.execPath` (Electron), which
   * breaks better-sqlite3 ABI.
   */
  resolveNodeExecutable?: () => string | undefined;
};

/** Pick Node binary for spawning workspace-kit; never uses extension-host `process.execPath` by default. */
export function pickNodeExecutable(resolve?: () => string | undefined): string {
  const fromResolver = resolve?.()?.trim();
  if (fromResolver) {
    if (fromResolver === "node" || fromResolver === "nodejs") return fromResolver;
    if (fs.existsSync(fromResolver)) return fromResolver;
  }
  const fromEnv = process.env.WORKSPACE_KIT_NODE?.trim();
  if (fromEnv) {
    if (fromEnv === "node" || fromEnv === "nodejs") return fromEnv;
    if (fs.existsSync(fromEnv)) return fromEnv;
  }
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const winCandidates = [
      programFiles ? path.join(programFiles, "nodejs", "node.exe") : "",
      programFilesX86 ? path.join(programFilesX86, "nodejs", "node.exe") : ""
    ];
    for (const p of winCandidates) {
      if (p && fs.existsSync(p)) return p;
    }
  } else {
    for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return "node";
}

function resolveCliJs(workspaceRoot: string, cliPathOverride?: string): string {
  if (cliPathOverride && fs.existsSync(cliPathOverride)) {
    return cliPathOverride;
  }
  const candidates = [
    path.join(workspaceRoot, "dist", "cli.js"),
    path.join(workspaceRoot, "node_modules", "@workflow-cannon", "workspace-kit", "dist", "cli.js")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  throw new Error(
    "workspace-kit CLI not found. Build the kit (pnpm run build) or install @workflow-cannon/workspace-kit."
  );
}

function execKit(
  workspaceRoot: string,
  cliArgs: string[],
  maxBuffer = 20 * 1024 * 1024,
  timeoutMs = 30_000,
  cliPathOverride?: string,
  resolveNodeExecutable?: () => string | undefined
): Promise<CommandClientExecResult> {
  const cliJs = resolveCliJs(workspaceRoot, cliPathOverride);
  const nodeBin = pickNodeExecutable(resolveNodeExecutable);
  return new Promise((resolve, reject) => {
    execFile(
      nodeBin,
      [cliJs, ...cliArgs],
      { cwd: workspaceRoot, maxBuffer, windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        const out = String(stdout ?? "");
        const errOut = String(stderr ?? "");
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(err);
            return;
          }
          const code = typeof err.code === "number" ? err.code : 1;
          resolve({ exitCode: code, stdout: out, stderr: errOut });
          return;
        }
        resolve({ exitCode: 0, stdout: out, stderr: errOut });
      }
    );
  });
}

export function parseRunCommandOutput(stdout: string, exitCode: number): KitRunResult {
  const text = stdout.trim();
  try {
    return JSON.parse(text) as KitRunResult;
  } catch {
    const suspectedPackageManagerBanner = looksLikePackageManagerBanner(stdout);
    const hint = suspectedPackageManagerBanner
      ? "stdout looks contaminated by a package-manager banner; use pnpm exec wk or node dist/cli.js for parse-sensitive calls"
      : "capture full stdout and JSON.parse the whole value";
    return {
      ok: false,
      code: "extension-json-parse",
      message: `exit ${exitCode}; ${hint}; stdout: ${text.slice(0, 400)}`,
      remediation: {
        cleanInvocations: ["pnpm exec wk run <command> '<json>'", "node dist/cli.js run <command> '<json>'"]
      },
      details: {
        suspectedPackageManagerBanner
      }
    };
  }
}

function looksLikePackageManagerBanner(stdout: string): boolean {
  const text = stdout.trimStart();
  if (!text.startsWith(">")) return false;
  const firstJson = text.search(/[{\[]/);
  const banner = firstJson >= 0 ? text.slice(0, firstJson) : text;
  return /^>\s+.+/m.test(banner) && /^>\s+.+/m.test(banner.split("\n").slice(1).join("\n"));
}

export class CommandClient {
  private readonly timeoutMs: number;
  private readonly cliPathOverride?: string;
  private readonly resolveNodeExecutable?: () => string | undefined;
  private readonly execFn: CommandClientExecFn;

  constructor(private readonly workspaceRoot: string, options?: CommandClientOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.cliPathOverride = options?.cliPathOverride;
    this.resolveNodeExecutable = options?.resolveNodeExecutable;
    this.execFn =
      options?.execFn ??
      ((root, cliArgs) =>
        execKit(
          root,
          cliArgs,
          20 * 1024 * 1024,
          this.timeoutMs,
          this.cliPathOverride,
          this.resolveNodeExecutable
        ));
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /** `workspace-kit run <name> <json>` — parses single JSON object from stdout. */
  async run(commandName: string, args: Record<string, unknown>): Promise<KitRunResult> {
    const jsonArg = JSON.stringify(args);
    try {
      const { stdout, stderr, exitCode } = await this.execFn(this.workspaceRoot, [
        "run",
        commandName,
        jsonArg
      ]);
      if (stderr.trim()) {
        console.warn("workspace-kit stderr:", stderr.slice(0, 500));
      }
      return parseRunCommandOutput(stdout, exitCode);
    } catch (e) {
      return {
        ok: false,
        code: "extension-exec-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /** Raw `workspace-kit config …`. */
  async config(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr, exitCode } = await this.execFn(this.workspaceRoot, ["config", ...argv]);
      return { code: exitCode, stdout, stderr };
    } catch (e) {
      return { code: 1, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
    }
  }
}
