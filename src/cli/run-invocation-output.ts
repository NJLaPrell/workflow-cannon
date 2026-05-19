import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

export function createRunInvocationId(): string {
  return randomUUID();
}

/** Pick a writable path; if `requested` exists, use `name.1`, `name.2`, … before extension tail. */
export function resolveAvailableOutputFilePath(
  workspacePath: string,
  requestedPath: string
): { absolutePath: string; outputFilePath: string } {
  const absolutePath = path.resolve(workspacePath, requestedPath);
  if (!fs.existsSync(absolutePath)) {
    return {
      absolutePath,
      outputFilePath: normalizeOutputFilePathForEnvelope(workspacePath, absolutePath)
    };
  }
  let n = 1;
  while (fs.existsSync(`${absolutePath}.${n}`)) {
    n += 1;
  }
  const resolved = `${absolutePath}.${n}`;
  return {
    absolutePath: resolved,
    outputFilePath: normalizeOutputFilePathForEnvelope(workspacePath, resolved)
  };
}

function normalizeOutputFilePathForEnvelope(workspacePath: string, absolutePath: string): string {
  const rel = path.relative(workspacePath, absolutePath);
  return rel.length > 0 && !rel.startsWith("..") ? rel : absolutePath;
}

export function attachInvocationEnvelope(
  body: Record<string, unknown>,
  invocationId: string,
  outputFilePath?: string
): Record<string, unknown> {
  return {
    ...body,
    invocationId,
    ...(outputFilePath ? { outputFilePath } : {})
  };
}

export async function emitRunInvocationJson(
  writeLine: (message: string) => void,
  workspacePath: string,
  body: Record<string, unknown>,
  options: {
    invocationId: string;
    outputFileRequest?: string;
    persistRunLog?: {
      effectiveConfig?: Record<string, unknown>;
      command: string;
      commandArgs: Record<string, unknown>;
      startedAt: string;
    };
  }
): Promise<void> {
  let outputFilePath: string | undefined;
  let absoluteWritePath: string | undefined;
  if (options.outputFileRequest) {
    const resolved = resolveAvailableOutputFilePath(workspacePath, options.outputFileRequest);
    outputFilePath = resolved.outputFilePath;
    absoluteWritePath = resolved.absolutePath;
  }
  const envelope = attachInvocationEnvelope(body, options.invocationId, outputFilePath);
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  writeLine(json.trimEnd());
  if (absoluteWritePath) {
    await fsPromises.mkdir(path.dirname(absoluteWritePath), { recursive: true });
    await fsPromises.writeFile(absoluteWritePath, json, "utf8");
  }
  if (options.persistRunLog) {
    const { appendRunLogRow } = await import("../core/state/kit-run-log-sqlite.js");
    appendRunLogRow({
      workspacePath,
      effectiveConfig: options.persistRunLog.effectiveConfig,
      invocationId: options.invocationId,
      command: options.persistRunLog.command,
      commandArgs: options.persistRunLog.commandArgs,
      response: envelope,
      startedAt: options.persistRunLog.startedAt,
      finishedAt: new Date().toISOString()
    });
  }
}
