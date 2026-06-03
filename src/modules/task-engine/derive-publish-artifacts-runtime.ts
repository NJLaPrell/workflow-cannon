import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DERIVE_PUBLISH_ARTIFACTS_SCHEMA_VERSION = 1 as const;

const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

type PublishReadinessRef = {
  kind: "command" | "artifact";
  value: string;
  instructionPath?: string;
};

export type PublishReadinessCheck = {
  code: string;
  state: "pass" | "fail" | "warn" | "info";
  blocking: boolean;
  summary: string;
  refs: PublishReadinessRef[];
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTag(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function buildRefs(...refs: PublishReadinessRef[]): PublishReadinessRef[] {
  return refs;
}

function readUtf8IfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasReleaseHeading(contents: string | null, version: string): boolean {
  if (!contents) {
    return false;
  }
  const heading = new RegExp(`^##\\s+\\[${escapeRegExp(version)}\\]`, "m");
  return heading.test(contents);
}

export type DerivePublishArtifactsCollectors = {
  readNpmVersion?: (packageName: string, distTag?: string) => string | null;
  readGhRelease?: (workspacePath: string, tag: string) => Record<string, unknown> | null;
  readGitTag?: (workspacePath: string, tag: string) => string | null;
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

function defaultReadGitTag(workspacePath: string, tag: string): string | null {
  try {
    const out = execFileSync("git", ["-C", workspacePath, "rev-parse", `refs/tags/${tag}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return nonEmptyString(out) ? out : null;
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
  packageName: string;
  publishArtifacts: Record<string, unknown>[];
  readinessChecks: PublishReadinessCheck[];
  degraded: string[];
} {
  const tag = normalizeTag(args.version);
  const gitTagCommit = (args.collectors?.readGitTag ?? defaultReadGitTag)(args.workspacePath, tag);
  const artifacts: Record<string, unknown>[] = [
    {
      kind: "git-tag",
      ref: tag,
      version: args.version,
      present: gitTagCommit !== null,
      commit: gitTagCommit
    }
  ];
  const degraded: string[] = [];
  const readinessChecks: PublishReadinessCheck[] = [];

  readinessChecks.push(
    RELEASE_VERSION_PATTERN.test(args.version)
      ? {
          code: "release-version-present",
          state: "pass",
          blocking: false,
          summary: `package.json release version ${args.version} is a valid semver tag candidate.`,
          refs: buildRefs(
            { kind: "artifact", value: "package.json" },
            {
              kind: "command",
              value: "pnpm exec wk run propose-release-version '{}'",
              instructionPath: "src/modules/task-engine/instructions/propose-release-version.md"
            }
          )
        }
      : {
          code: "release-version-invalid",
          state: "fail",
          blocking: true,
          summary: `package.json version '${args.version}' is missing or not valid semver.`,
          refs: buildRefs(
            { kind: "artifact", value: "package.json" },
            {
              kind: "command",
              value: "pnpm exec wk run propose-release-version '{}'",
              instructionPath: "src/modules/task-engine/instructions/propose-release-version.md"
            }
          )
        }
  );

  const rootChangelog = readUtf8IfExists(join(args.workspacePath, "CHANGELOG.md"));
  readinessChecks.push(
    hasReleaseHeading(rootChangelog, args.version)
      ? {
          code: "root-changelog-entry-present",
          state: "pass",
          blocking: false,
          summary: `CHANGELOG.md includes a ${args.version} heading.`,
          refs: buildRefs(
            { kind: "artifact", value: "CHANGELOG.md" },
            { kind: "command", value: "node scripts/check-release-diff-shape.mjs" }
          )
        }
      : {
          code: "root-changelog-entry-missing",
          state: "fail",
          blocking: true,
          summary: `CHANGELOG.md does not include a ${args.version} release heading.`,
          refs: buildRefs(
            { kind: "artifact", value: "CHANGELOG.md" },
            { kind: "command", value: "node scripts/check-release-diff-shape.mjs" }
          )
        }
  );

  const maintainerChangelog = readUtf8IfExists(join(args.workspacePath, "docs", "maintainers", "CHANGELOG.md"));
  readinessChecks.push(
    hasReleaseHeading(maintainerChangelog, args.version)
      ? {
          code: "maintainer-changelog-entry-present",
          state: "pass",
          blocking: false,
          summary: `docs/maintainers/CHANGELOG.md includes a ${args.version} heading.`,
          refs: buildRefs(
            { kind: "artifact", value: "docs/maintainers/CHANGELOG.md" },
            { kind: "command", value: "node scripts/check-release-diff-shape.mjs" }
          )
        }
      : {
          code: "maintainer-changelog-entry-missing",
          state: "fail",
          blocking: true,
          summary: `docs/maintainers/CHANGELOG.md does not include a ${args.version} release heading.`,
          refs: buildRefs(
            { kind: "artifact", value: "docs/maintainers/CHANGELOG.md" },
            { kind: "command", value: "node scripts/check-release-diff-shape.mjs" }
          )
        }
  );

  const runContractsSchema = readJsonIfExists(join(args.workspacePath, "schemas", "task-engine-run-contracts.schema.json"));
  const runContractsVersion =
    runContractsSchema &&
    isRecord(runContractsSchema.properties) &&
    isRecord(runContractsSchema.properties.packageVersion) &&
    runContractsSchema.properties.packageVersion.const;
  readinessChecks.push(
    runContractsVersion === args.version
      ? {
          code: "task-engine-run-contracts-schema-aligned",
          state: "pass",
          blocking: false,
          summary: `schemas/task-engine-run-contracts.schema.json mirrors package version ${args.version}.`,
          refs: buildRefs(
            { kind: "artifact", value: "schemas/task-engine-run-contracts.schema.json" },
            { kind: "command", value: "node scripts/check-task-engine-run-contracts.mjs" }
          )
        }
      : {
          code: "task-engine-run-contracts-schema-mismatch",
          state: "fail",
          blocking: true,
          summary:
            runContractsSchema === null
              ? "schemas/task-engine-run-contracts.schema.json is missing or unreadable."
              : `schemas/task-engine-run-contracts.schema.json packageVersion const (${String(runContractsVersion)}) does not match ${args.version}.`,
          refs: buildRefs(
            { kind: "artifact", value: "schemas/task-engine-run-contracts.schema.json" },
            { kind: "command", value: "node scripts/check-task-engine-run-contracts.mjs" }
          )
        }
  );

  const pilotSnapshot = readJsonIfExists(join(args.workspacePath, "schemas", "pilot-run-args.snapshot.json"));
  const pilotSnapshotVersion = pilotSnapshot?.sourceSchemaPackageVersion;
  readinessChecks.push(
    pilotSnapshotVersion === args.version
      ? {
          code: "pilot-run-args-snapshot-aligned",
          state: "pass",
          blocking: false,
          summary: `schemas/pilot-run-args.snapshot.json mirrors package version ${args.version}.`,
          refs: buildRefs(
            { kind: "artifact", value: "schemas/pilot-run-args.snapshot.json" },
            { kind: "command", value: "node scripts/check-pilot-run-args-snapshot.mjs" },
            { kind: "command", value: "node scripts/refresh-pilot-run-args-snapshot.mjs" }
          )
        }
      : {
          code: "pilot-run-args-snapshot-mismatch",
          state: "fail",
          blocking: true,
          summary:
            pilotSnapshot === null
              ? "schemas/pilot-run-args.snapshot.json is missing or unreadable."
              : `schemas/pilot-run-args.snapshot.json sourceSchemaPackageVersion (${String(pilotSnapshotVersion)}) does not match ${args.version}.`,
          refs: buildRefs(
            { kind: "artifact", value: "schemas/pilot-run-args.snapshot.json" },
            { kind: "command", value: "node scripts/check-pilot-run-args-snapshot.mjs" },
            { kind: "command", value: "node scripts/refresh-pilot-run-args-snapshot.mjs" }
          )
        }
  );

  readinessChecks.push(
    gitTagCommit
      ? {
          code: "git-tag-already-present",
          state: "info",
          blocking: false,
          summary: `Git tag ${tag} already exists at ${gitTagCommit}.`,
          refs: buildRefs(
            { kind: "artifact", value: `refs/tags/${tag}` },
            { kind: "command", value: `git tag -l '${tag}'` },
            {
              kind: "command",
              value: "pnpm exec wk run propose-release-version '{}'",
              instructionPath: "src/modules/task-engine/instructions/propose-release-version.md"
            }
          )
        }
      : {
          code: "git-tag-not-published",
          state: "info",
          blocking: false,
          summary: `Git tag ${tag} is not present yet.`,
          refs: buildRefs(
            { kind: "artifact", value: `refs/tags/${tag}` },
            { kind: "command", value: `git tag -l '${tag}'` }
          )
        }
  );

  const gh = (args.collectors?.readGhRelease ?? defaultReadGhRelease)(args.workspacePath, tag);
  if (gh && nonEmptyString(gh.url)) {
    artifacts.push({
      kind: "github-release",
      url: gh.url,
      tagName: nonEmptyString(gh.tagName) ? gh.tagName : tag,
      publishedAt: gh.publishedAt ?? null
    });
    readinessChecks.push({
      code: "github-release-already-published",
      state: "info",
      blocking: false,
      summary: `GitHub release for ${tag} already exists.`,
      refs: buildRefs(
        { kind: "artifact", value: String(gh.url) },
        { kind: "command", value: `gh release view ${tag} --json url,tagName,publishedAt` }
      )
    });
  } else {
    degraded.push(`GitHub release not found for ${tag} (gh auth or unpublished)`);
    readinessChecks.push({
      code: "github-release-not-published",
      state: "warn",
      blocking: false,
      summary: `GitHub release for ${tag} is not published or gh could not read it.`,
      refs: buildRefs(
        { kind: "artifact", value: `refs/tags/${tag}` },
        { kind: "command", value: `gh release view ${tag} --json url,tagName,publishedAt` }
      )
    });
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
      distTag: args.distTag ?? "latest",
      state: npmVersion === args.version ? "already-published" : "different-version-published"
    });
    readinessChecks.push(
      npmVersion === args.version
        ? {
            code: "npm-version-already-published",
            state: "info",
            blocking: false,
            summary: `${args.packageName}@${args.version} is already published on dist-tag ${args.distTag ?? "latest"}.`,
            refs: buildRefs(
              { kind: "artifact", value: `${args.packageName}@${args.version}` },
              {
                kind: "command",
                value: `npm view ${args.packageName} version --json --tag=${args.distTag ?? "latest"}`
              },
              {
                kind: "command",
                value: "pnpm exec wk run propose-release-version '{}'",
                instructionPath: "src/modules/task-engine/instructions/propose-release-version.md"
              }
            )
          }
        : {
            code: "npm-version-not-published",
            state: "info",
            blocking: false,
            summary: `${args.packageName}@${args.version} is not the published ${args.distTag ?? "latest"} version (current ${npmVersion}).`,
            refs: buildRefs(
              { kind: "artifact", value: `${args.packageName}@${args.version}` },
              {
                kind: "command",
                value: `npm view ${args.packageName} version --json --tag=${args.distTag ?? "latest"}`
              }
            )
          }
    );
  } else {
    degraded.push(`npm registry lookup failed for ${args.packageName}`);
    readinessChecks.push({
      code: "npm-version-unavailable",
      state: "warn",
      blocking: false,
      summary: `npm registry lookup could not confirm publish state for ${args.packageName}.`,
      refs: buildRefs(
        { kind: "artifact", value: args.packageName },
        {
          kind: "command",
          value: `npm view ${args.packageName} version --json --tag=${args.distTag ?? "latest"}`
        }
      )
    });
  }

  return {
    schemaVersion: DERIVE_PUBLISH_ARTIFACTS_SCHEMA_VERSION,
    fragmentKind: "publishArtifacts",
    version: args.version,
    packageName: args.packageName,
    publishArtifacts: artifacts,
    readinessChecks,
    degraded
  };
}
