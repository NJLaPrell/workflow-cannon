import { execFileSync } from "node:child_process";

export const DERIVE_PUBLISH_ARTIFACTS_SCHEMA_VERSION = 1 as const;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTag(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export type DerivePublishArtifactsCollectors = {
  readNpmVersion?: (packageName: string, distTag?: string) => string | null;
  readGhRelease?: (workspacePath: string, tag: string) => Record<string, unknown> | null;
};

function defaultReadNpmVersion(packageName: string, distTag = "latest"): string | null {
  try {
    const out = execFileSync("npm", ["view", packageName, "version", "--json", `--tag=${distTag}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const parsed: unknown = JSON.parse(out);
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0]!.trim();
    }
    return nonEmptyString(out) ? out : null;
  } catch {
    return null;
  }
}

function defaultReadGhRelease(workspacePath: string, tag: string): Record<string, unknown> | null {
  try {
    const out = execFileSync("gh", ["release", "view", tag, "--json", "url,tagName,publishedAt"], {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GH_PAGER: "", PAGER: "" }
    }).trim();
    const parsed: unknown = JSON.parse(out);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function derivePublishArtifactsFragment(args: {
  workspacePath: string;
  version: string;
  packageName: string;
  distTag?: string;
  collectors?: DerivePublishArtifactsCollectors;
}): {
  schemaVersion: typeof DERIVE_PUBLISH_ARTIFACTS_SCHEMA_VERSION;
  fragmentKind: "publishArtifacts";
  version: string;
  publishArtifacts: Record<string, unknown>[];
  degraded: string[];
} {
  const tag = normalizeTag(args.version);
  const artifacts: Record<string, unknown>[] = [
    {
      kind: "git-tag",
      ref: tag,
      version: args.version
    }
  ];
  const degraded: string[] = [];

  const gh = (args.collectors?.readGhRelease ?? defaultReadGhRelease)(args.workspacePath, tag);
  if (gh && nonEmptyString(gh.url)) {
    artifacts.push({
      kind: "github-release",
      url: gh.url,
      tagName: nonEmptyString(gh.tagName) ? gh.tagName : tag,
      publishedAt: gh.publishedAt ?? null
    });
  } else {
    degraded.push(`GitHub release not found for ${tag} (gh auth or unpublished)`);
  }

  const npmVersion = (args.collectors?.readNpmVersion ?? defaultReadNpmVersion)(
    args.packageName,
    args.distTag ?? "latest"
  );
  if (npmVersion) {
    artifacts.push({
      kind: "npm",
      package: args.packageName,
      version: npmVersion,
      distTag: args.distTag ?? "latest"
    });
  } else {
    degraded.push(`npm registry lookup failed for ${args.packageName}`);
  }

  return {
    schemaVersion: DERIVE_PUBLISH_ARTIFACTS_SCHEMA_VERSION,
    fragmentKind: "publishArtifacts",
    version: args.version,
    publishArtifacts: artifacts,
    degraded
  };
}
