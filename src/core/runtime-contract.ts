import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH = ".workspace-kit/runtime.json";
export const WORKSPACE_KIT_RUNTIME_LAUNCHER_RELATIVE_PATH = ".workspace-kit/bin/wk";
export const WORKSPACE_KIT_RUNTIME_CONTRACT_SCHEMA_VERSION = 1;
export const WORKSPACE_KIT_REQUIRED_NODE_MAJOR = 22;

export type WorkspaceKitRuntimeStampV1 = {
  schemaVersion: 1;
  nodeExecutable: string;
  nodeVersion: string;
  arch: string;
  platform: string;
  abi: string;
  packageRoot: string;
  checkedAt: string;
};

export type RuntimeContractIssueCode =
  | "runtime-stamp-missing"
  | "runtime-stamp-invalid-json"
  | "runtime-stamp-invalid-shape"
  | "runtime-launcher-missing"
  | "runtime-launcher-not-executable"
  | "runtime-node-missing"
  | "runtime-node-wrong-major"
  | "runtime-arch-mismatch"
  | "runtime-abi-mismatch"
  | "runtime-platform-mismatch"
  | "runtime-package-root-missing"
  | "runtime-host-arch-mismatch"
  | "runtime-sqlite-load-failed";

export type RuntimeContractIssue = {
  code: RuntimeContractIssueCode;
  message: string;
  expected?: string | number;
  actual?: string | number | null;
};

export type RuntimeStampReadResult =
  | { ok: true; stamp: WorkspaceKitRuntimeStampV1; stampPath: string }
  | { ok: false; stampPath: string; issues: RuntimeContractIssue[] };

export type RuntimeVerificationResult = {
  ok: boolean;
  stamp: WorkspaceKitRuntimeStampV1 | null;
  issues: RuntimeContractIssue[];
};

export type NativeSqliteSmokeResult =
  | { ok: true }
  | { ok: false; issue: RuntimeContractIssue };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nodeMajor(version: string): number | null {
  const normalized = version.trim().replace(/^v/, "");
  const majorText = normalized.split(".", 1)[0];
  const major = Number(majorText);
  return Number.isInteger(major) ? major : null;
}

export function runtimeStampPath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH);
}

export function runtimeLauncherPath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_KIT_RUNTIME_LAUNCHER_RELATIVE_PATH);
}

export function generateWorkspaceKitLauncherContent(): string {
  return `#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
workspace_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
stamp_path="$workspace_root/${WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH}"
if [ ! -f "$stamp_path" ]; then
  echo "workspace-kit launcher: missing runtime stamp at $stamp_path; run workspace-kit init or setup repair" >&2
  exit 1
fi
node_executable=$(sed -n 's/^[[:space:]]*"nodeExecutable"[[:space:]]*:[[:space:]]*"\\(.*\\)"[,]*[[:space:]]*$/\\1/p' "$stamp_path" | head -n 1)
package_root=$(sed -n 's/^[[:space:]]*"packageRoot"[[:space:]]*:[[:space:]]*"\\(.*\\)"[,]*[[:space:]]*$/\\1/p' "$stamp_path" | head -n 1)
if [ -z "$node_executable" ] || [ -z "$package_root" ]; then
  echo "workspace-kit launcher: malformed runtime stamp at $stamp_path" >&2
  exit 1
fi
if [ ! -x "$node_executable" ]; then
  echo "workspace-kit launcher: stamped Node executable is missing or not executable: $node_executable" >&2
  exit 1
fi
cli_path="$package_root/dist/cli.js"
if [ ! -f "$cli_path" ]; then
  echo "workspace-kit launcher: CLI not found at $cli_path" >&2
  exit 1
fi
exec "$node_executable" "$cli_path" "$@"
`;
}

export function writeRuntimeLauncher(workspacePath: string): string {
  const launcherPath = runtimeLauncherPath(workspacePath);
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(launcherPath, generateWorkspaceKitLauncherContent(), { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);
  return launcherPath;
}

export function runtimePackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function currentRuntimeIdentity(packageRoot = runtimePackageRoot(), checkedAt = new Date().toISOString()): WorkspaceKitRuntimeStampV1 {
  return {
    schemaVersion: WORKSPACE_KIT_RUNTIME_CONTRACT_SCHEMA_VERSION,
    nodeExecutable: process.execPath,
    nodeVersion: process.version,
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules ?? "unknown",
    packageRoot: path.resolve(packageRoot),
    checkedAt
  };
}

export function parseRuntimeStamp(raw: unknown): { ok: true; stamp: WorkspaceKitRuntimeStampV1 } | { ok: false; issues: RuntimeContractIssue[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, issues: [{ code: "runtime-stamp-invalid-shape", message: "Runtime stamp must be an object" }] };
  }
  const stampObject = raw as Record<string, unknown>;
  const issues: RuntimeContractIssue[] = [];
  if (stampObject.schemaVersion !== WORKSPACE_KIT_RUNTIME_CONTRACT_SCHEMA_VERSION) {
    issues.push({
      code: "runtime-stamp-invalid-shape",
      message: "Runtime stamp schemaVersion must be 1",
      expected: WORKSPACE_KIT_RUNTIME_CONTRACT_SCHEMA_VERSION,
      actual: typeof stampObject.schemaVersion === "number" ? stampObject.schemaVersion : null
    });
  }
  const nodeExecutable = nonEmptyString(stampObject.nodeExecutable);
  const nodeVersion = nonEmptyString(stampObject.nodeVersion);
  const arch = nonEmptyString(stampObject.arch);
  const platform = nonEmptyString(stampObject.platform);
  const abi = nonEmptyString(stampObject.abi);
  const packageRoot = nonEmptyString(stampObject.packageRoot);
  const checkedAt = nonEmptyString(stampObject.checkedAt);
  const requiredFields = { nodeExecutable, nodeVersion, arch, platform, abi, packageRoot, checkedAt };
  for (const [fieldName, fieldValue] of Object.entries(requiredFields)) {
    if (!fieldValue) {
      issues.push({ code: "runtime-stamp-invalid-shape", message: `Runtime stamp missing ${fieldName}` });
    }
  }
  if (checkedAt && Number.isNaN(Date.parse(checkedAt))) {
    issues.push({ code: "runtime-stamp-invalid-shape", message: "Runtime stamp checkedAt must be an ISO timestamp", actual: checkedAt });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    stamp: {
      schemaVersion: 1,
      nodeExecutable: nodeExecutable!,
      nodeVersion: nodeVersion!,
      arch: arch!,
      platform: platform!,
      abi: abi!,
      packageRoot: path.resolve(packageRoot!),
      checkedAt: checkedAt!
    }
  };
}

export function readRuntimeStamp(workspacePath: string): RuntimeStampReadResult {
  const stampPath = runtimeStampPath(workspacePath);
  if (!fs.existsSync(stampPath)) {
    return { ok: false, stampPath, issues: [{ code: "runtime-stamp-missing", message: "Runtime stamp is missing" }] };
  }
  let rawText: string;
  try {
    rawText = fs.readFileSync(stampPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      stampPath,
      issues: [{ code: "runtime-stamp-missing", message: `Runtime stamp could not be read: ${(error as Error).message}` }]
    };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText) as unknown;
  } catch {
    return { ok: false, stampPath, issues: [{ code: "runtime-stamp-invalid-json", message: "Runtime stamp is not valid JSON" }] };
  }
  const parsed = parseRuntimeStamp(parsedJson);
  return parsed.ok ? { ok: true, stamp: parsed.stamp, stampPath } : { ok: false, stampPath, issues: parsed.issues };
}

export function writeRuntimeStamp(workspacePath: string, stamp = currentRuntimeIdentity()): WorkspaceKitRuntimeStampV1 {
  const stampPath = runtimeStampPath(workspacePath);
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  const normalizedStamp: WorkspaceKitRuntimeStampV1 = { ...stamp, packageRoot: path.resolve(stamp.packageRoot) };
  fs.writeFileSync(stampPath, `${JSON.stringify(normalizedStamp, null, 2)}\n`, "utf8");
  return normalizedStamp;
}

export function smokeTestNativeSqlite(packageRoot: string): NativeSqliteSmokeResult {
  try {
    const packageRequire = createRequire(path.join(path.resolve(packageRoot), "package.json"));
    const Database = packageRequire("better-sqlite3") as { new (source: string): { close(): void } };
    const database = new Database(":memory:");
    database.close();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "runtime-sqlite-load-failed",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export function verifyRuntimeStamp(
  stamp: WorkspaceKitRuntimeStampV1,
  options: {
    requiredNodeMajor?: number;
    currentIdentity?: WorkspaceKitRuntimeStampV1;
    checkNativeSqlite?: boolean;
  } = {}
): RuntimeVerificationResult {
  const requiredNodeMajor = options.requiredNodeMajor ?? WORKSPACE_KIT_REQUIRED_NODE_MAJOR;
  const currentIdentity = options.currentIdentity ?? currentRuntimeIdentity(stamp.packageRoot);
  const issues: RuntimeContractIssue[] = [];
  if (!fs.existsSync(stamp.nodeExecutable)) {
    issues.push({ code: "runtime-node-missing", message: "Stamped Node executable does not exist", actual: stamp.nodeExecutable });
  }
  const actualMajor = nodeMajor(stamp.nodeVersion);
  if (actualMajor !== requiredNodeMajor) {
    issues.push({
      code: "runtime-node-wrong-major",
      message: `Workflow Cannon requires Node ${requiredNodeMajor}`,
      expected: requiredNodeMajor,
      actual: actualMajor
    });
  }
  if (stamp.arch !== currentIdentity.arch) {
    issues.push({ code: "runtime-arch-mismatch", message: "Runtime stamp architecture differs from current runtime", expected: stamp.arch, actual: currentIdentity.arch });
  }
  if (stamp.platform !== currentIdentity.platform) {
    issues.push({ code: "runtime-platform-mismatch", message: "Runtime stamp platform differs from current runtime", expected: stamp.platform, actual: currentIdentity.platform });
  }
  if (stamp.abi !== currentIdentity.abi) {
    issues.push({ code: "runtime-abi-mismatch", message: "Runtime stamp ABI differs from current runtime", expected: stamp.abi, actual: currentIdentity.abi });
  }
  if (!fs.existsSync(stamp.packageRoot)) {
    issues.push({ code: "runtime-package-root-missing", message: "Runtime stamp packageRoot does not exist", actual: stamp.packageRoot });
  }
  const hostArch = os.arch();
  if (stamp.arch !== hostArch) {
    issues.push({
      code: "runtime-host-arch-mismatch",
      message:
        "Runtime stamp architecture does not match host architecture; Node may be running under emulation (e.g. Rosetta). Install/run under a Node built for the host architecture.",
      expected: hostArch,
      actual: stamp.arch
    });
  }
  if (options.checkNativeSqlite === true && fs.existsSync(stamp.packageRoot)) {
    const smoke = smokeTestNativeSqlite(stamp.packageRoot);
    if (!smoke.ok) {
      issues.push(smoke.issue);
    }
  }
  return { ok: issues.length === 0, stamp, issues };
}

export function verifyRuntimeStampFile(
  workspacePath: string,
  options: Parameters<typeof verifyRuntimeStamp>[1] = {}
): RuntimeVerificationResult {
  const read = readRuntimeStamp(workspacePath);
  if (!read.ok) {
    return { ok: false, stamp: null, issues: read.issues };
  }
  return verifyRuntimeStamp(read.stamp, options);
}
