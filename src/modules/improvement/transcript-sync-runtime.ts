import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";

export type TranscriptSyncArgs = {
  sourcePath?: string;
  archivePath?: string;
};

export type TranscriptSyncResult = {
  sourcePath: string;
  archivePath: string;
  scanned: number;
  copied: number;
  skippedExisting: number;
  skippedConflict: number;
  errors: Array<{ file: string; code: string; message: string }>;
  copiedFiles: string[];
};

type ImprovementTranscriptConfig = {
  sourcePath: string;
  archivePath: string;
  minIntervalMinutes: number;
  skipIfNoNewTranscripts: boolean;
};

function resolveImprovementTranscriptConfig(
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

  return {
    sourcePath: sourcePathArg || sourcePathCfg || ".cursor/agent-transcripts",
    archivePath: archivePathArg || archivePathCfg || "agent-transcripts",
    minIntervalMinutes: Math.max(1, Math.floor(minIntervalCfg)),
    skipIfNoNewTranscripts: skipIfNoNewCfg
  };
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

async function fileSha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function runSyncTranscripts(
  ctx: ModuleLifecycleContext,
  args: TranscriptSyncArgs
): Promise<TranscriptSyncResult> {
  const cfg = resolveImprovementTranscriptConfig(ctx, args);
  const sourceRoot = path.resolve(ctx.workspacePath, cfg.sourcePath);
  const archiveRoot = path.resolve(ctx.workspacePath, cfg.archivePath);

  const result: TranscriptSyncResult = {
    sourcePath: path.relative(ctx.workspacePath, sourceRoot) || ".",
    archivePath: path.relative(ctx.workspacePath, archiveRoot) || ".",
    scanned: 0,
    copied: 0,
    skippedExisting: 0,
    skippedConflict: 0,
    errors: [],
    copiedFiles: []
  };

  let files: string[] = [];
  try {
    files = await listJsonlRelativePaths(sourceRoot);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push({
      file: result.sourcePath,
      code: "source-read-error",
      message: msg
    });
    return result;
  }

  result.scanned = files.length;
  await fs.mkdir(archiveRoot, { recursive: true });

  for (const rel of files) {
    const src = path.join(sourceRoot, rel);
    const dst = path.join(archiveRoot, rel);
    try {
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
        continue;
      }
      if (dstHash && dstHash !== srcHash) {
        result.skippedConflict += 1;
        continue;
      }
      await fs.copyFile(src, dst);
      result.copied += 1;
      result.copiedFiles.push(rel);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: rel, code: "copy-error", message: msg });
    }
  }

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

