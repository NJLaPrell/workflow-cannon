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

function resolveCliJs(workspaceRoot: string): string {
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
  maxBuffer = 20 * 1024 * 1024
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cliJs = resolveCliJs(workspaceRoot);
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [cliJs, ...cliArgs],
      { cwd: workspaceRoot, maxBuffer, windowsHide: true },
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

export class CommandClient {
  constructor(private readonly workspaceRoot: string) {}

  /** `workspace-kit run <name> <json>` — parses single JSON object from stdout. */
  async run(commandName: string, args: Record<string, unknown>): Promise<KitRunResult> {
    const jsonArg = JSON.stringify(args);
    try {
      const { stdout, stderr, exitCode } = await execKit(this.workspaceRoot, ["run", commandName, jsonArg]);
      if (stderr.trim()) {
        console.warn("workspace-kit stderr:", stderr.slice(0, 500));
      }
      const text = stdout.trim();
      try {
        const parsed = JSON.parse(text) as KitRunResult;
        return parsed;
      } catch {
        return {
          ok: false,
          code: "extension-json-parse",
          message: `exit ${exitCode}; stdout: ${text.slice(0, 400)}`
        };
      }
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
      const { stdout, stderr, exitCode } = await execKit(this.workspaceRoot, ["config", ...argv]);
      return { code: exitCode, stdout, stderr };
    } catch (e) {
      return { code: 1, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
    }
  }
}
