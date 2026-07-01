/**
 * Warm workspace-kit run daemon — newline-delimited JSON on stdin/stdout.
 * Extension spawns once per workspace to avoid repeated Node/module bootstrap.
 *
 * Request:  {"id":"<uuid>","cliArgs":["run","<command>","<json>"]}
 * Response: {"id":"<uuid>","exitCode":0,"stdout":"...","stderr":"..."}
 * Ping:     {"id":"<uuid>","ping":true} → {"id":"<uuid>","pong":true,"exitCode":0,"stdout":"","stderr":""}
 */

import readline from "node:readline";
import { handleRunCommand, type RunCommandExitCodes } from "./run-command.js";
import { createCachedRegistryRouterResolver } from "./kit-run-daemon-cache.js";

const EXIT_CODES: RunCommandExitCodes = {
  success: 0,
  validationFailure: 1,
  usageError: 2,
  internalError: 3
};

export type KitRunDaemonRequest = {
  id?: string;
  cliArgs?: string[];
  ping?: boolean;
};

export type KitRunDaemonResponse = {
  id: string | null;
  exitCode: number;
  stdout: string;
  stderr: string;
  pong?: boolean;
  error?: string;
};

function writeResponse(response: KitRunDaemonResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export async function runKitRunDaemonMain(cwd: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  // One cache per daemon process: memoizes registry/router/effective-config across
  // requests and rebuilds only when a config input changes (see kit-run-daemon-cache.ts).
  const resolveRegistryRouter = createCachedRegistryRouterResolver();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let req: KitRunDaemonRequest;
    try {
      req = JSON.parse(trimmed) as KitRunDaemonRequest;
    } catch (error) {
      writeResponse({
        id: null,
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        error: "invalid-request-json"
      });
      continue;
    }

    const id = typeof req.id === "string" && req.id.trim().length > 0 ? req.id.trim() : null;
    if (!id) {
      writeResponse({
        id: null,
        exitCode: 2,
        stdout: "",
        stderr: "request id is required",
        error: "missing-request-id"
      });
      continue;
    }

    if (req.ping === true) {
      writeResponse({ id, pong: true, exitCode: 0, stdout: "", stderr: "" });
      continue;
    }

    const cliArgs = Array.isArray(req.cliArgs) ? req.cliArgs.map((x) => String(x)) : null;
    if (!cliArgs || cliArgs.length < 2 || cliArgs[0] !== "run") {
      writeResponse({
        id,
        exitCode: 2,
        stdout: "",
        stderr: "cliArgs must be [\"run\", <command>, <json>?]",
        error: "invalid-cli-args"
      });
      continue;
    }

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    try {
      const exitCode = await handleRunCommand(
        cwd,
        cliArgs,
        {
          writeLine: (message) => stdoutLines.push(message),
          writeError: (message) => stderrLines.push(message)
        },
        EXIT_CODES,
        { resolveRegistryRouter }
      );
      writeResponse({
        id,
        exitCode,
        stdout: stdoutLines.join("\n"),
        stderr: stderrLines.join("\n")
      });
    } catch (error) {
      writeResponse({
        id,
        exitCode: EXIT_CODES.internalError,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        error: "daemon-invocation-failed"
      });
    }
  }
}
