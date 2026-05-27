import path from "node:path";
import {
  TASK_STATE_EVENTS_DIR_RELATIVE,
  TASK_STATE_MANIFEST_RELATIVE,
  TASK_STATE_ROOT_DIR
} from "./constants.js";
import { formatEventSegmentFilename } from "./layout.js";
import type { TaskStateGitManifestV1 } from "./types.js";
import { validateTaskStateGitManifest } from "./validate-manifest.js";
import { gitLsTreeNames, gitShowText, type GitRunResult, runGit } from "./git-io.js";

export type TaskStateBranchLayout = {
  ref: string;
  tipSha: string;
  manifest: TaskStateGitManifestV1;
  eventSegmentPaths: string[];
};

function parseManifestJson(text: string): TaskStateGitManifestV1 | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const validated = validateTaskStateGitManifest(parsed);
    return validated.ok ? validated.data : null;
  } catch {
    return null;
  }
}

export function readTaskStateBranchLayout(
  cwd: string,
  ref: string,
  tipSha: string
): { ok: true; layout: TaskStateBranchLayout } | { ok: false; code: string; message: string } {
  const manifestText = gitShowText(cwd, ref, TASK_STATE_MANIFEST_RELATIVE);
  if (!manifestText) {
    return {
      ok: false,
      code: "task-state-manifest-missing",
      message: `No ${TASK_STATE_MANIFEST_RELATIVE} at ${ref}`
    };
  }
  const manifest = parseManifestJson(manifestText);
  if (!manifest) {
    return {
      ok: false,
      code: "task-state-manifest-invalid",
      message: `Manifest at ${ref}:${TASK_STATE_MANIFEST_RELATIVE} failed validation`
    };
  }

  const listed = gitLsTreeNames(cwd, ref, TASK_STATE_EVENTS_DIR_RELATIVE);
  const segmentSuffix = ".jsonl";
  const eventSegmentPaths = listed
    .filter((p) => p.startsWith(`${TASK_STATE_EVENTS_DIR_RELATIVE}/`) && p.endsWith(segmentSuffix))
    .sort();

  if (eventSegmentPaths.length === 0 && manifest.head.latestSegmentPath) {
    const headPath = manifest.head.latestSegmentPath.startsWith(`${TASK_STATE_ROOT_DIR}/`)
      ? manifest.head.latestSegmentPath
      : path.posix.join(TASK_STATE_ROOT_DIR, manifest.head.latestSegmentPath);
    if (gitShowText(cwd, ref, headPath)) {
      eventSegmentPaths.push(headPath);
    }
  }

  return {
    ok: true,
    layout: { ref, tipSha, manifest, eventSegmentPaths }
  };
}

export function readEventSegmentsJsonl(
  cwd: string,
  ref: string,
  segmentPaths: string[]
): { ok: true; lines: string[] } | { ok: false; code: string; message: string } {
  const lines: string[] = [];
  for (const segmentPath of segmentPaths) {
    const text = gitShowText(cwd, ref, segmentPath);
    if (text === null) {
      return {
        ok: false,
        code: "task-state-event-segment-missing",
        message: `Missing event segment ${ref}:${segmentPath}`
      };
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      lines.push(trimmed);
    }
  }
  return { ok: true, lines };
}

export function segmentPathsThroughHead(manifest: TaskStateGitManifestV1): string[] {
  const latest = manifest.head.latestSegmentPath;
  if (!latest) {
    return [];
  }
  const normalized = latest.startsWith(`${TASK_STATE_ROOT_DIR}/`) ? latest : path.posix.join(TASK_STATE_ROOT_DIR, latest);
  const base = path.posix.basename(normalized);
  const match = /^(\d+)\.jsonl$/.exec(base);
  if (!match) {
    return [normalized];
  }
  const maxIndex = Number.parseInt(match[1] ?? "0", 10);
  const paths: string[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    paths.push(path.posix.join(TASK_STATE_EVENTS_DIR_RELATIVE, formatEventSegmentFilename(i)));
  }
  return paths;
}

export function gitRefTipSha(cwd: string, ref: string): string | null {
  const r = runGit(cwd, ["rev-parse", ref]);
  return r.ok && r.stdout.trim() ? r.stdout.trim() : null;
}

export type { GitRunResult };
