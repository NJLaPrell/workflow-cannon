import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { ImprovementStateDocument, TranscriptRetryEntry } from "./improvement-state.js";

export type TranscriptSyncArgs = {
  sourcePath?: string;
  archivePath?: string;
};

export type TranscriptSkipReason =
  | "skipped-unchanged-hash"
  | "skipped-archive-conflict"
  | "skipped-file-too-large"
  | "skipped-budget-max-files"
  | "skipped-budget-total-bytes"
  | "skipped-read-error";

export type TranscriptSyncResult = {
  runId: string;
  sourcePath: string;
  archivePath: string;
  discoveredFrom: string;
  discoveryCandidatesTried: string[];
  scanned: number;
  copied: number;
  skippedExisting: number;
  skippedConflict: number;
  skippedBudget: number;
  skippedLargeFile: number;
  errors: Array<{ file: string; code: string; message: string }>;
  copiedFiles: string[];
  skipReasons: Record<string, TranscriptSkipReason>;
  budget: {
    maxFilesPerSync: number;
    maxBytesPerFile: number;
    maxTotalScanBytes: number;
    scanBytesUsed: number;
  };
  retryQueue: {
    pending: number;
    processedRetries: number;
    droppedPermanentFailures: number;
  };
};

type ImprovementTranscriptConfig = {
  sourcePath: string;
  archivePath: string;
  minIntervalMinutes: number;
  skipIfNoNewTranscripts: boolean;
  maxFilesPerSync: number;
  maxBytesPerFile: number;
  maxTotalScanBytes: number;
  discoveryPaths: string[];
};

const DEFAULT_DISCOVERY_PATHS = [".cursor/agent-transcripts", ".vscode/agent-transcripts"];

const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 60_000;

export function resolveImprovementTranscriptConfig(
  ctx: ModuleLifecycleContext,
  args: TranscriptSyncArgs
): ImprovementTranscriptConfig {
  const improvement =
    ctx.effectiveConfig?.improvement && typeof ctx.effectiveConfig.improvement === "object"
      ? (ctx.effectiveConfig.improvement as Record<string, unknown>)
      : {};
  const transcripts =
    improvement.transcripts && typeof improvement.transcripts === "object"
      ? (improvement.transcripts as Record<string, unknown>)
      : {};
  const cadence =
    improvement.cadence && typeof improvement.cadence === "object"
      ? (improvement.cadence as Record<string, unknown>)
      : {};

  const sourcePathArg = typeof args.sourcePath === "string" ? args.sourcePath.trim() : "";
  const archivePathArg = typeof args.archivePath === "string" ? args.archivePath.trim() : "";
  const sourcePathCfg =
    typeof transcripts.sourcePath === "string" ? transcripts.sourcePath.trim() : "";
  const archivePathCfg =
    typeof transcripts.archivePath === "string" ? transcripts.archivePath.trim() : "";
  const minIntervalCfg =
    typeof cadence.minIntervalMinutes === "number" && Number.isFinite(cadence.minIntervalMinutes)
      ? cadence.minIntervalMinutes
      : 15;
  const skipIfNoNewCfg =
    typeof cadence.skipIfNoNewTranscripts === "boolean" ? cadence.skipIfNoNewTranscripts : true;

  const maxFilesCfg =
    typeof transcripts.maxFilesPerSync === "number" && Number.isFinite(transcripts.maxFilesPerSync)
      ? Math.max(1, Math.floor(transcripts.maxFilesPerSync))
      : 5000;
  const maxBytesFileCfg =
    typeof transcripts.maxBytesPerFile === "number" && Number.isFinite(transcripts.maxBytesPerFile)
      ? Math.max(1024, Math.floor(transcripts.maxBytesPerFile))
      : 50_000_000;
  const maxTotalScanCfg =
    typeof transcripts.maxTotalScanBytes === "number" && Number.isFinite(transcripts.maxTotalScanBytes)
      ? Math.max(1024, Math.floor(transcripts.maxTotalScanBytes))
      : 500_000_000;

  let discoveryPaths: string[] = [];
  if (Array.isArray(transcripts.discoveryPaths)) {
    discoveryPaths = transcripts.discoveryPaths.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
  }
  if (discoveryPaths.length === 0) {
    discoveryPaths = [...DEFAULT_DISCOVERY_PATHS];
  }

  return {
    sourcePath: sourcePathArg || sourcePathCfg || "",
    archivePath: archivePathArg || archivePathCfg || "agent-transcripts",
    minIntervalMinutes: Math.max(1, Math.floor(minIntervalCfg)),
    skipIfNoNewTranscripts: skipIfNoNewCfg,
    maxFilesPerSync: maxFilesCfg,
    maxBytesPerFile: maxBytesFileCfg,
    maxTotalScanBytes: maxTotalScanCfg,
    discoveryPaths
  };
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cursor stores agent transcripts under `~/.cursor/projects/<slug>/agent-transcripts`, where `slug`
 * is the workspace root with path separators replaced by hyphens (drive letter included on Windows).
 */
export function buildCursorProjectsAgentTranscriptsPath(workspacePath: string): string {
  const home = os.homedir();
  const resolved = path.resolve(workspacePath);
  const slug = resolved.split(path.sep).filter((s) => s.length > 0).join("-");
  return path.join(home, ".cursor", "projects", slug, "agent-transcripts");
}

export async function resolveTranscriptSourceRoot(
  workspacePath: string,
  cfg: ImprovementTranscriptConfig,
  args: TranscriptSyncArgs
): Promise<{ root: string; discoveredFrom: string; tried: string[] }> {
  const sourcePathArg = typeof args.sourcePath === "string" ? args.sourcePath.trim() : "";
  if (sourcePathArg) {
    const root = path.resolve(workspacePath, sourcePathArg);
    return { root, discoveredFrom: sourcePathArg, tried: [sourcePathArg] };
  }
  if (cfg.sourcePath) {
    const root = path.resolve(workspacePath, cfg.sourcePath);
    return { root, discoveredFrom: cfg.sourcePath, tried: [cfg.sourcePath] };
  }
  const tried: string[] = [];
  for (const rel of cfg.discoveryPaths) {
    tried.push(rel);
    const abs = path.resolve(workspacePath, rel);
    if (await pathExists(abs)) {
      return { root: abs, discoveredFrom: rel, tried };
    }
  }
  const cursorGlobal = buildCursorProjectsAgentTranscriptsPath(workspacePath);
  const cursorLabel = path.join("~", ".cursor", "projects", path.basename(path.dirname(cursorGlobal)), "agent-transcripts");
  tried.push(cursorLabel);
  if (await pathExists(cursorGlobal)) {
    return { root: cursorGlobal, discoveredFrom: "cursor-global-project-agent-transcripts", tried };
  }
  const fallback = path.resolve(workspacePath, ".cursor/agent-transcripts");
  return { root: fallback, discoveredFrom: ".cursor/agent-transcripts (fallback)", tried };
}

async function listJsonlRelativePaths(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(cur: string): Promise<void> {
    const ents = await fs.readdir(cur, { withFileTypes: true });
    for (const ent of ents) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
        out.push(path.relative(root, abs));
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function statSize(filePath: string): Promise<number | null> {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch {
    return null;
  }
}

async function fileSha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

function nextBackoffMs(attempts: number): number {
  return INITIAL_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
}

export async function runSyncTranscripts(
  ctx: ModuleLifecycleContext,
  args: TranscriptSyncArgs,
  state: ImprovementStateDocument,
  now: Date = new Date()
): Promise<TranscriptSyncResult> {
  const cfg = resolveImprovementTranscriptConfig(ctx, args);
  const runId = randomUUID();
  const { root: sourceRoot, discoveredFrom, tried: discoveryCandidatesTried } =
    await resolveTranscriptSourceRoot(ctx.workspacePath, cfg, args);

  const archiveRoot = path.resolve(ctx.workspacePath, cfg.archivePath);

  const result: TranscriptSyncResult = {
    runId,
    sourcePath: path.relative(ctx.workspacePath, sourceRoot) || ".",
    archivePath: path.relative(ctx.workspacePath, archiveRoot) || ".",
    discoveredFrom,
    discoveryCandidatesTried,
    scanned: 0,
    copied: 0,
    skippedExisting: 0,
    skippedConflict: 0,
    skippedBudget: 0,
    skippedLargeFile: 0,
    errors: [],
    copiedFiles: [],
    skipReasons: {},
    budget: {
      maxFilesPerSync: cfg.maxFilesPerSync,
      maxBytesPerFile: cfg.maxBytesPerFile,
      maxTotalScanBytes: cfg.maxTotalScanBytes,
      scanBytesUsed: 0
    },
    retryQueue: { pending: 0, processedRetries: 0, droppedPermanentFailures: 0 }
  };

  let files: string[] = [];
  try {
    files = await listJsonlRelativePaths(sourceRoot);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push({
      file: result.sourcePath,
      code: "source-read-error",
      message: `${msg} (discovery tried: ${discoveryCandidatesTried.join(", ")})`
    });
    return result;
  }

  await fs.mkdir(archiveRoot, { recursive: true });

  const queue = state.transcriptRetryQueue ?? [];
  const remainingRetries: TranscriptRetryEntry[] = [];
  let scanBytes = 0;

  for (const entry of queue) {
    const due = new Date(entry.nextRetryAt).getTime() <= now.getTime();
    if (!due) {
      remainingRetries.push(entry);
      continue;
    }
    if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
      result.retryQueue.droppedPermanentFailures += 1;
      result.errors.push({
        file: entry.relativePath,
        code: "retry-exhausted",
        message: entry.lastErrorMessage
      });
      continue;
    }
    const src = path.join(sourceRoot, entry.relativePath);
    const dst = path.join(archiveRoot, entry.relativePath);
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      const sz = await statSize(src);
      if (sz !== null && sz > cfg.maxBytesPerFile) {
        remainingRetries.push({
          ...entry,
          attempts: entry.attempts + 1,
          lastErrorCode: "file-too-large",
          lastErrorMessage: `size ${sz} exceeds maxBytesPerFile`,
          nextRetryAt: new Date(now.getTime() + nextBackoffMs(entry.attempts + 1)).toISOString()
        });
        continue;
      }
      if (sz !== null) {
        scanBytes += sz;
      }
      const srcHash = await fileSha256(src);
      let dstHash: string | null = null;
      try {
        dstHash = await fileSha256(dst);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      if (dstHash === srcHash) {
        result.retryQueue.processedRetries += 1;
        continue;
      }
      if (dstHash && dstHash !== srcHash) {
        remainingRetries.push({
          ...entry,
          attempts: entry.attempts + 1,
          lastErrorCode: "archive-conflict",
          lastErrorMessage: "destination exists with different content",
          nextRetryAt: new Date(now.getTime() + nextBackoffMs(entry.attempts + 1)).toISOString()
        });
        continue;
      }
      await fs.copyFile(src, dst);
      result.copied += 1;
      result.copiedFiles.push(entry.relativePath);
      result.retryQueue.processedRetries += 1;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      remainingRetries.push({
        ...entry,
        attempts: entry.attempts + 1,
        lastErrorCode: "copy-error",
        lastErrorMessage: msg,
        nextRetryAt: new Date(now.getTime() + nextBackoffMs(entry.attempts + 1)).toISOString()
      });
    }
  }

  let budgetFiles = 0;
  for (const rel of files) {
    if (budgetFiles >= cfg.maxFilesPerSync) {
      result.skippedBudget += 1;
      result.skipReasons[rel] = "skipped-budget-max-files";
      continue;
    }
    const src = path.join(sourceRoot, rel);
    const dst = path.join(archiveRoot, rel);
    budgetFiles += 1;
    result.scanned += 1;

    try {
      const sz = await statSize(src);
      if (sz !== null && sz > cfg.maxBytesPerFile) {
        result.skippedLargeFile += 1;
        result.skipReasons[rel] = "skipped-file-too-large";
        continue;
      }
      if (sz !== null && scanBytes + sz > cfg.maxTotalScanBytes) {
        result.skippedBudget += 1;
        result.skipReasons[rel] = "skipped-budget-total-bytes";
        continue;
      }
      if (sz !== null) {
        scanBytes += sz;
      }

      await fs.mkdir(path.dirname(dst), { recursive: true });
      const srcHash = await fileSha256(src);
      let dstHash: string | null = null;
      try {
        dstHash = await fileSha256(dst);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      if (dstHash === srcHash) {
        result.skippedExisting += 1;
        result.skipReasons[rel] = "skipped-unchanged-hash";
        continue;
      }
      if (dstHash && dstHash !== srcHash) {
        result.skippedConflict += 1;
        result.skipReasons[rel] = "skipped-archive-conflict";
        continue;
      }
      await fs.copyFile(src, dst);
      result.copied += 1;
      result.copiedFiles.push(rel);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: rel, code: "copy-error", message: msg });
      remainingRetries.push({
        relativePath: rel,
        attempts: 1,
        lastErrorCode: "copy-error",
        lastErrorMessage: msg,
        nextRetryAt: new Date(now.getTime() + INITIAL_BACKOFF_MS).toISOString()
      });
      result.skipReasons[rel] = "skipped-read-error";
    }
  }

  result.budget.scanBytesUsed = scanBytes;
  state.transcriptRetryQueue = remainingRetries;
  result.retryQueue.pending = remainingRetries.length;
  result.copiedFiles.sort((a, b) => a.localeCompare(b));
  return result;
}

export function resolveCadenceDecision(
  now: Date,
  previousRunAtIso: string | null,
  minIntervalMinutes: number,
  copiedCount: number,
  skipIfNoNewTranscripts: boolean
): { shouldRunGenerate: boolean; reason: string } {
  if (copiedCount === 0 && skipIfNoNewTranscripts) {
    return { shouldRunGenerate: false, reason: "skipped-no-new-transcripts" };
  }
  if (!previousRunAtIso) {
    return { shouldRunGenerate: true, reason: "run-first-ingest" };
  }
  const prev = new Date(previousRunAtIso);
  if (!Number.isFinite(prev.getTime())) {
    return { shouldRunGenerate: true, reason: "run-invalid-last-ingest-at" };
  }
  const elapsedMs = now.getTime() - prev.getTime();
  const requiredMs = minIntervalMinutes * 60 * 1000;
  if (elapsedMs < requiredMs) {
    return { shouldRunGenerate: false, reason: "skipped-min-interval" };
  }
  return { shouldRunGenerate: true, reason: "run-min-interval-satisfied" };
}
