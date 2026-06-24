import type {
  KickoffScopeFinding,
  KickoffScopeManifestResult,
  KickoffTaskInput
} from "./types.js";

/** Workspace-relative path prefixes accepted for kickoff scope extraction. */
export const KICKOFF_SCOPE_PATH_PREFIX_RE = /^(src|extensions|schemas|\.ai|\.cursor)\//;

const EMBEDDED_PATH_RE =
  /\b((?:src|extensions|schemas|\.ai|\.cursor)\/[^\s,;'"`)\]]+)/g;

const BACKTICK_PATH_RE = /`([^`]+)`/g;

function normalizeScopePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed || !KICKOFF_SCOPE_PATH_PREFIX_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function addPath(paths: Set<string>, raw: string): boolean {
  const normalized = normalizeScopePath(raw);
  if (!normalized) {
    return false;
  }
  paths.add(normalized);
  return true;
}

function extractEmbeddedPaths(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(EMBEDDED_PATH_RE)) {
    const candidate = match[1];
    if (candidate) {
      found.push(candidate);
    }
  }
  return found;
}

function extractBacktickPaths(text: string): Array<{ raw: string; inner: string }> {
  const found: Array<{ raw: string; inner: string }> = [];
  for (const match of text.matchAll(BACKTICK_PATH_RE)) {
    const inner = match[1]?.trim() ?? "";
    if (inner) {
      found.push({ raw: match[0], inner });
    }
  }
  return found;
}

function readMetadataScopePaths(metadata: Record<string, unknown> | undefined): unknown[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const scopePaths = metadata.scopePaths;
  return Array.isArray(scopePaths) ? scopePaths : [];
}

function looksPathLike(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  if (/[/\\]/.test(normalized)) {
    return true;
  }
  return /\.[a-zA-Z0-9]+$/.test(normalized);
}

function collectParseSkippedFindings(
  label: string,
  candidates: Array<{ raw: string; inner: string }>,
  findings: KickoffScopeFinding[]
): void {
  for (const { inner } of candidates) {
    if (KICKOFF_SCOPE_PATH_PREFIX_RE.test(inner.replace(/\\/g, "/"))) {
      continue;
    }
    if (looksPathLike(inner)) {
      findings.push({
        code: "kickoff-scope-path-parse-skipped",
        path: inner,
        message: `${label}: skipped path-like backtick value that does not match kickoff scope prefixes`
      });
    }
  }
}

/** Build deduped sorted scope paths plus conservative parse-skipped findings. */
export function buildScopePathManifest(task: KickoffTaskInput): KickoffScopeManifestResult {
  const paths = new Set<string>();
  const findings: KickoffScopeFinding[] = [];

  for (const entry of readMetadataScopePaths(task.metadata as Record<string, unknown> | undefined)) {
    if (typeof entry !== "string" || !entry.trim()) {
      findings.push({
        code: "kickoff-scope-path-parse-skipped",
        message: "metadata.scopePaths: skipped non-string or empty entry"
      });
      continue;
    }
    if (!addPath(paths, entry)) {
      findings.push({
        code: "kickoff-scope-path-parse-skipped",
        path: entry,
        message: "metadata.scopePaths: skipped entry outside kickoff scope prefixes"
      });
    }
  }

  for (const line of task.technicalScope ?? []) {
    if (typeof line !== "string" || !line.trim()) {
      continue;
    }
    const backticks = extractBacktickPaths(line);
    for (const { inner } of backticks) {
      addPath(paths, inner);
    }
    collectParseSkippedFindings("technicalScope", backticks, findings);
    for (const embedded of extractEmbeddedPaths(line)) {
      addPath(paths, embedded);
    }
  }

  if (typeof task.description === "string" && task.description.trim()) {
    const backticks = extractBacktickPaths(task.description);
    for (const { inner } of backticks) {
      addPath(paths, inner);
    }
    collectParseSkippedFindings("description", backticks, findings);
  }

  return {
    paths: [...paths].sort((a, b) => a.localeCompare(b)),
    findings
  };
}

/** Extract deduped sorted workspace-relative scope paths from task fields. */
export function extractScopePaths(task: KickoffTaskInput): string[] {
  return buildScopePathManifest(task).paths;
}
