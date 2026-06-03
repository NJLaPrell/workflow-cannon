import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { parsePolicyApproval } from "../../core/policy.js";
import { releaseEvidenceFragmentDir } from "./release-evidence-fragments.js";
import { readPackageMetadata } from "./release-evidence-manifest.js";

type ScriptChangeReplacement = {
  description: string;
  oldText: string;
  newText: string;
};

type ScriptChange = {
  path: string;
  replacements: ScriptChangeReplacement[];
};

type ScriptSuccess = {
  ok: true;
  code: string;
  data: {
    workspacePath: string;
    version: string;
    date: string;
    dryRun: boolean;
    changes: ScriptChange[];
  };
};

type ScriptFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type ScriptResult = ScriptSuccess | ScriptFailure;

type ReleaseArtifactRef = {
  kind: "artifact" | "command";
  value: string;
  instructionPath?: string;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolvePackageRoot(): string {
  return join(fileURLToPath(new URL("../../..", import.meta.url)));
}

function normalizeVersion(args: Record<string, unknown>, workspacePath: string): string | null {
  if (nonEmptyString(args.version)) {
    return args.version.trim();
  }
  return readPackageMetadata(workspacePath).version;
}

function normalizeDate(args: Record<string, unknown>): string {
  if (nonEmptyString(args.date)) {
    return args.date.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

function buildRerunCommand(version: string, date: string, dryRun: boolean): string {
  const payload: Record<string, unknown> = { version, date };
  if (!dryRun) {
    payload.dryRun = false;
    payload.policyApproval = { confirmed: true, rationale: "<human-approved rationale>" };
  }
  return `pnpm exec wk run prepare-release-artifacts '${JSON.stringify(payload)}'`;
}

function buildChangedArtifactRows(version: string, date: string, changes: ScriptChange[]): Record<string, unknown>[] {
  return changes.map((change) => ({
    path: change.path,
    refs: [
      { kind: "artifact", value: change.path },
      {
        kind: "command",
        value: buildRerunCommand(version, date, true),
        instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md"
      }
    ] satisfies ReleaseArtifactRef[],
    replacements: change.replacements.map((replacement) => ({
      description: replacement.description,
      oldText: replacement.oldText,
      newText: replacement.newText
    }))
  }));
}

function buildReleaseArtifactFragment(version: string, date: string, changes: ScriptChange[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    fragmentKind: "preparedArtifacts",
    releaseVersion: version,
    date,
    createdAt: new Date().toISOString(),
    changedArtifacts: buildChangedArtifactRows(version, date, changes)
  };
}

function parseScriptResult(raw: string): ScriptResult {
  const parsed = JSON.parse(raw) as ScriptResult;
  if (!parsed || typeof parsed !== "object" || typeof parsed.ok !== "boolean") {
    throw new Error("prepare-release-artifacts script returned invalid JSON payload");
  }
  return parsed;
}

function runPrepareReleaseArtifactsScript(
  workspacePath: string,
  version: string,
  date: string,
  dryRun: boolean
): ScriptResult {
  const scriptPath = join(resolvePackageRoot(), "scripts", "prepare-release-artifacts.mjs");
  const argv = [scriptPath, "--workspace", workspacePath, "--version", version, "--date", date];
  if (dryRun) {
    argv.push("--dry-run");
  }
  try {
    const stdout = execFileSync(process.execPath, argv, {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return parseScriptResult(stdout);
  } catch (error) {
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string" ? ((error as { stdout: string }).stdout) : "";
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? ((error as { stderr: string }).stderr) : "";
    const raw = stdout.trim() || stderr.trim();
    if (raw.startsWith("{")) {
      return parseScriptResult(raw);
    }
    return {
      ok: false,
      code: "prepare-release-artifacts-script-failed",
      message: raw || (error as Error).message,
      details: { scriptPath }
    };
  }
}

export async function runPrepareReleaseArtifactsCommand(
  ctx: ModuleLifecycleContext,
  rawArgs: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = rawArgs.dryRun !== false;
  const version = normalizeVersion(rawArgs, ctx.workspacePath);
  if (!version) {
    return {
      ok: false,
      code: "prepare-release-artifacts-missing-version",
      message: "prepare-release-artifacts requires version or a resolvable package.json version.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md" }
    };
  }
  const date = normalizeDate(rawArgs);

  if (!dryRun && !parsePolicyApproval(rawArgs)) {
    return {
      ok: false,
      code: "prepare-release-artifacts-policy-approval-required",
      message: "prepare-release-artifacts apply mode requires JSON policyApproval.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md" }
    };
  }

  const result = runPrepareReleaseArtifactsScript(ctx.workspacePath, version, date, dryRun);
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      data: result.details ? { details: result.details } : undefined,
      remediation: { instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md" }
    };
  }

  const fragment = buildReleaseArtifactFragment(version, date, result.data.changes);
  const fragmentDir = releaseEvidenceFragmentDir(ctx.workspacePath, version);
  const fragmentRelativePath = join(".workspace-kit", "release-evidence", version, "prepared-artifacts.json").replaceAll("\\", "/");
  if (!dryRun) {
    mkdirSync(fragmentDir, { recursive: true });
    writeFileSync(join(fragmentDir, "prepared-artifacts.json"), `${JSON.stringify(fragment, null, 2)}\n`, "utf8");
  }

  return {
    ok: true,
    code: dryRun ? "prepare-release-artifacts-dry-run" : "prepare-release-artifacts-applied",
    message: dryRun
      ? `Dry run prepared ${result.data.changes.length} release artifact update(s)`
      : `Prepared ${result.data.changes.length} release artifact update(s)`,
    data: {
      dryRun,
      workspacePath: result.data.workspacePath,
      version,
      date,
      changes: result.data.changes,
      releaseEvidenceFragment: fragment,
      releaseEvidenceFragmentPath: fragmentRelativePath,
      releaseEvidenceFragmentWritten: !dryRun,
      releaseEvidenceRefs: buildChangedArtifactRows(version, date, result.data.changes).map((entry) => ({
        path: entry.path,
        refs: entry.refs
      }))
    },
    remediation: { instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md" }
  };
}