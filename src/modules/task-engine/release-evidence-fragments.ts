import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RELEASE_EVIDENCE_FRAGMENT_ROOT = ".workspace-kit/release-evidence";

export const CLOSEOUT_VALIDATION_COMMANDS = [
  "pnpm run build",
  "pnpm run check",
  "pnpm run test",
  "pnpm run parity",
  "node scripts/check-release-metadata.mjs",
  "pnpm run pre-merge-gates"
] as const;

export type ReleaseEvidenceResolveFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseJsonObject(
  raw: string,
  label: string
): { ok: true; value: Record<string, unknown> } | ReleaseEvidenceResolveFailure {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {
        ok: false,
        code: "release-evidence-fragment-invalid",
        message: `${label} must be a JSON object.`,
        details: { label }
      };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      code: "release-evidence-fragment-invalid",
      message: `Failed to parse ${label}: ${(error as Error).message}`,
      details: { label }
    };
  }
}

function isMergeMetaKey(key: string): boolean {
  return key === "merge" || key === "fromFile" || key === "mergeDir";
}

function concatUniqueRecords(existing: Record<string, unknown>[], incoming: Record<string, unknown>[]): Record<string, unknown>[] {
  const out = [...existing];
  for (const row of incoming) {
    const key = JSON.stringify(row);
    if (!out.some((entry) => JSON.stringify(entry) === key)) {
      out.push(row);
    }
  }
  return out;
}

/** Deep-merge release-evidence partial objects; arrays of records concatenate with de-dupe. */
export function mergeReleaseEvidencePartials(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isMergeMetaKey(key)) {
      continue;
    }
    const prev = result[key];
    if (Array.isArray(value) && value.every(isRecord)) {
      const prevArr = Array.isArray(prev) ? prev.filter(isRecord) : [];
      result[key] = concatUniqueRecords(prevArr, value);
      continue;
    }
    if (isRecord(value) && isRecord(prev)) {
      result[key] = mergeReleaseEvidencePartials(prev, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function releaseEvidenceFragmentDir(workspacePath: string, releaseVersion: string): string {
  return join(workspacePath, RELEASE_EVIDENCE_FRAGMENT_ROOT, releaseVersion);
}

export type ReleaseEvidenceFragmentFs = {
  exists?: (path: string) => boolean;
  readdir?: (path: string) => string[];
  readFile?: (path: string, encoding: BufferEncoding) => string;
};

export function loadReleaseEvidenceFragmentsFromDir(
  dir: string,
  fsImpl: ReleaseEvidenceFragmentFs = {}
): { ok: true; merged: Record<string, unknown>; files: string[] } | ReleaseEvidenceResolveFailure {
  const exists = fsImpl.exists ?? existsSync;
  const readdir = fsImpl.readdir ?? readdirSync;
  const readFile = fsImpl.readFile ?? ((path: string, enc: BufferEncoding) => readFileSync(path, enc));

  if (!exists(dir)) {
    return {
      ok: false,
      code: "release-evidence-fragment-dir-missing",
      message: `Release evidence fragment directory does not exist: ${dir}`,
      details: { dir }
    };
  }

  const files = readdir(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    return {
      ok: false,
      code: "release-evidence-fragment-dir-empty",
      message: `No .json fragment files found under ${dir}`,
      details: { dir }
    };
  }

  let merged: Record<string, unknown> = {};
  for (const file of files) {
    const path = join(dir, file);
    const parsed = parseJsonObject(readFile(path, "utf8"), file);
    if (!parsed.ok) {
      return parsed;
    }
    merged = mergeReleaseEvidencePartials(merged, parsed.value);
  }

  return { ok: true, merged, files };
}

export function resolveReleaseEvidenceCommandArgs(args: {
  workspacePath: string;
  commandArgs: Record<string, unknown>;
  packageVersion?: string | null;
  fsImpl?: ReleaseEvidenceFragmentFs;
}): { ok: true; args: Record<string, unknown>; sources: string[] } | ReleaseEvidenceResolveFailure {
  const sources: string[] = [];
  let merged: Record<string, unknown> = {};
  const fsImpl = args.fsImpl ?? {};

  const fromFile = nonEmptyString(args.commandArgs.fromFile) ? args.commandArgs.fromFile.trim() : null;
  if (fromFile) {
    const readFile = fsImpl.readFile ?? ((path: string, enc: BufferEncoding) => readFileSync(path, enc));
    const exists = fsImpl.exists ?? existsSync;
    if (!exists(fromFile)) {
      return {
        ok: false,
        code: "release-evidence-from-file-missing",
        message: `fromFile does not exist: ${fromFile}`,
        details: { fromFile }
      };
    }
    const parsed = parseJsonObject(readFile(fromFile, "utf8"), fromFile);
    if (!parsed.ok) {
      return parsed;
    }
    merged = mergeReleaseEvidencePartials(merged, parsed.value);
    sources.push(`fromFile:${fromFile}`);
  }

  const mergeEnabled = args.commandArgs.merge === true;
  if (mergeEnabled) {
    const releaseVersion = nonEmptyString(args.commandArgs.releaseVersion)
      ? args.commandArgs.releaseVersion.trim()
      : nonEmptyString(args.packageVersion)
        ? args.packageVersion
        : null;
    if (!releaseVersion) {
      return {
        ok: false,
        code: "release-evidence-merge-version-required",
        message: "merge mode requires releaseVersion (or resolvable package.json version).",
        details: { missingFields: ["releaseVersion"] }
      };
    }
    const mergeDir = nonEmptyString(args.commandArgs.mergeDir)
      ? args.commandArgs.mergeDir.trim()
      : releaseEvidenceFragmentDir(args.workspacePath, releaseVersion);
    const loaded = loadReleaseEvidenceFragmentsFromDir(mergeDir, fsImpl);
    if (!loaded.ok) {
      return loaded;
    }
    merged = mergeReleaseEvidencePartials(merged, loaded.merged);
    sources.push(`mergeDir:${mergeDir}(${loaded.files.join(",")})`);
  }

  const inline: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args.commandArgs)) {
    if (!isMergeMetaKey(key)) {
      inline[key] = value;
    }
  }
  merged = mergeReleaseEvidencePartials(merged, inline);
  if (Object.keys(inline).length > 0) {
    sources.push("inline-args");
  }

  return { ok: true, args: merged, sources };
}
