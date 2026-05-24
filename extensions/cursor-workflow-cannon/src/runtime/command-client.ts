import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DashboardAgentStatusKind } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import {
  isKitRefreshRunCommand,
  kitRefreshCoalesceKey,
  kitRefreshPausedResult,
  kitRunLaneForCommand
} from "./kit-refresh-run-commands.js";

export type KitRunResult = {
  ok: boolean;
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CommandClientExecResult = { exitCode: number; stdout: string; stderr: string };
export type CommandClientExecFn = (workspaceRoot: string, cliArgs: string[]) => Promise<CommandClientExecResult>;

export type CommandClientActivityInput = {
  kind: DashboardAgentStatusKind;
  label?: string;
  taskId?: string;
  command?: string;
  phaseKey?: string;
  prNumber?: number;
  version?: string;
  details?: Record<string, unknown>;
  ttlSeconds?: number;
};

type CommandClientOptions = {
  cliPathOverride?: string;
  extensionRoot?: string;
  execFn?: CommandClientExecFn;
  timeoutMs?: number;
  /**
   * Return a path to `node` (or `node` / `nodejs` to use PATH). Used so the CLI runs with the same
   * Node as `pnpm install` / native addons — not the editor's `process.execPath` (Electron), which
   * breaks better-sqlite3 ABI.
   */
  resolveNodeExecutable?: () => string | undefined;
  /** Optional trace hooks (wired from extension activate → Workflow Cannon output). */
  onKitRunStart?: (commandName: string, args: Record<string, unknown>) => number;
  onKitRunEnd?: (
    commandName: string,
    startedAt: number,
    result: { ok: boolean; code?: string; message?: string }
  ) => void;
  onKitRunNotice?: (message: string) => void;
};

export type RuntimeStampExecutionPlan =
  | { kind: "missing"; stampPath: string }
  | { kind: "invalid"; stampPath: string; message: string }
  | { kind: "launcher"; stampPath: string; executable: string; argsPrefix: string[] }
  | { kind: "stamped-node"; stampPath: string; executable: string; argsPrefix: string[] };

export type NativeSqliteProbeDiagnostic = {
  ok: boolean;
  kind?: string;
  message?: string;
};

export type NodeExecutableDiagnostic = {
  path: string;
  exists: boolean;
  version?: string;
  arch?: string;
  platform?: string;
  execPath?: string;
  modules?: string;
  identityError?: string;
  nativeSqlite?: NativeSqliteProbeDiagnostic;
};

const WORKFLOW_CANNON_NODE_MAJOR = "22";
const RUNTIME_STAMP_RELATIVE_PATH = path.join(".workspace-kit", "runtime.json");
const RUNTIME_LAUNCHER_RELATIVE_PATH = path.join(".workspace-kit", "bin", process.platform === "win32" ? "wk.cmd" : "wk");

function structuredRuntimeStampFailure(code: string, message: string, details: Record<string, unknown>): CommandClientExecResult {
  return {
    exitCode: 1,
    stdout: `${JSON.stringify({
      ok: false,
      code,
      message,
      remediation: {
        command: "workspace-kit init --force",
        paths: [RUNTIME_STAMP_RELATIVE_PATH, RUNTIME_LAUNCHER_RELATIVE_PATH]
      },
      details
    })}\n`,
    stderr: ""
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolveRuntimeStampExecutionPlan(workspaceRoot: string): RuntimeStampExecutionPlan {
  const stampPath = path.join(workspaceRoot, RUNTIME_STAMP_RELATIVE_PATH);
  if (!fs.existsSync(stampPath)) {
    return { kind: "missing", stampPath };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(stampPath, "utf8"));
  } catch (error) {
    return {
      kind: "invalid",
      stampPath,
      message: `Runtime stamp is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", stampPath, message: "Runtime stamp must be a JSON object" };
  }
  const value = raw as Record<string, unknown>;
  const nodeExecutable = nonEmptyString(value.nodeExecutable);
  const packageRoot = nonEmptyString(value.packageRoot);
  if (!nodeExecutable || !packageRoot) {
    return { kind: "invalid", stampPath, message: "Runtime stamp must include nodeExecutable and packageRoot" };
  }
  if (!fs.existsSync(nodeExecutable)) {
    return { kind: "invalid", stampPath, message: `Stamped Node executable does not exist: ${nodeExecutable}` };
  }
  const launcherPath = path.join(workspaceRoot, RUNTIME_LAUNCHER_RELATIVE_PATH);
  if (fs.existsSync(launcherPath)) {
    return { kind: "launcher", stampPath, executable: launcherPath, argsPrefix: [] };
  }
  const cliPath = path.join(path.resolve(packageRoot), "dist", "cli.js");
  if (!fs.existsSync(cliPath)) {
    return { kind: "invalid", stampPath, message: `Stamped workspace-kit CLI does not exist: ${cliPath}` };
  }
  return { kind: "stamped-node", stampPath, executable: nodeExecutable, argsPrefix: [cliPath] };
}

/** Pick Node binary for spawning workspace-kit; never uses extension-host `process.execPath` by default. */
export function pickNodeExecutable(
  resolve?: () => string | undefined,
  workspaceRoot?: string,
  nativeProbeRoots?: string[],
  runtimeRoots?: string[]
): string {
  const candidates = buildNodeExecutableCandidates(resolve, runtimeRoots);
  if (workspaceRoot && findBetterSqliteProbeRoot(workspaceRoot, nativeProbeRoots)) {
    const diagnostics = inspectNodeExecutableCandidates(resolve, workspaceRoot, nativeProbeRoots, runtimeRoots);
    const preferredNativeCompatible = diagnostics.find(
      (candidate) => candidate.exists && isPreferredNodeMajor(candidate.version) && candidate.nativeSqlite?.ok
    );
    if (preferredNativeCompatible) return preferredNativeCompatible.path;
    const nativeCompatible = diagnostics.find((candidate) => candidate.exists && candidate.nativeSqlite?.ok);
    if (nativeCompatible) return nativeCompatible.path;
  }
  return candidates[0] ?? "node";
}

function buildNodeExecutableCandidates(resolve?: () => string | undefined, runtimeRoots?: string[]): string[] {
  const fromResolver = resolve?.()?.trim();
  const candidates: string[] = [];
  addNodeCandidate(candidates, fromResolver);
  const fromEnv = process.env.WORKSPACE_KIT_NODE?.trim();
  addNodeCandidate(candidates, fromEnv);
  for (const p of discoverNvmNodeExecutables(runtimeRoots)) {
    addNodeCandidate(candidates, p);
  }
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const winCandidates = [
      programFiles ? path.join(programFiles, "nodejs", "node.exe") : "",
      programFilesX86 ? path.join(programFilesX86, "nodejs", "node.exe") : ""
    ];
    for (const p of winCandidates) {
      addNodeCandidate(candidates, p);
    }
  } else {
    for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
      addNodeCandidate(candidates, p);
    }
  }
  addNodeCandidate(candidates, "node");
  return candidates;
}

function addNodeCandidate(candidates: string[], candidate?: string): void {
  const value = candidate?.trim();
  if (!value) return;
  if (value !== "node" && value !== "nodejs" && !fs.existsSync(value)) return;
  if (!candidates.includes(value)) candidates.push(value);
}

function discoverNvmNodeExecutables(runtimeRoots?: string[]): string[] {
  const nvmRoot = process.env.NVM_DIR?.trim() || path.join(os.homedir(), ".nvm");
  const versionsRoot = path.join(nvmRoot, "versions", "node");
  const discovered: string[] = [];
  const versions = listNvmVersionDirs(versionsRoot);

  for (const spec of readRuntimeNodeVersionSpecs(runtimeRoots)) {
    for (const nodePath of findNvmNodesForVersionSpec(versionsRoot, versions, spec)) {
      addNodeCandidate(discovered, nodePath);
    }
  }

  addNodeCandidate(discovered, process.env.NVM_BIN ? path.join(process.env.NVM_BIN, "node") : undefined);
  for (const version of versions) {
    addNodeCandidate(discovered, path.join(versionsRoot, version, "bin", "node"));
  }
  return discovered;
}

function readRuntimeNodeVersionSpecs(runtimeRoots?: string[]): string[] {
  const specs: string[] = [];
  const seenRoots = new Set<string>();
  for (const root of runtimeRoots ?? []) {
    const normalizedRoot = root.trim();
    if (!normalizedRoot || seenRoots.has(normalizedRoot)) continue;
    seenRoots.add(normalizedRoot);
    for (const fileName of [".node-version", ".nvmrc"]) {
      const filePath = path.join(normalizedRoot, fileName);
      if (!fs.existsSync(filePath)) continue;
      const spec = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.trim();
      if (spec && !spec.startsWith("#") && !specs.includes(spec)) specs.push(spec);
    }
  }
  if (!specs.includes(WORKFLOW_CANNON_NODE_MAJOR)) specs.push(WORKFLOW_CANNON_NODE_MAJOR);
  return specs;
}

function listNvmVersionDirs(versionsRoot: string): string[] {
  if (!fs.existsSync(versionsRoot)) return [];
  return fs
    .readdirSync(versionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareNodeVersionsDesc);
}

function findNvmNodesForVersionSpec(versionsRoot: string, versions: string[], spec: string): string[] {
  const normalized = spec.trim().replace(/^node-/, "").replace(/^v/, "");
  const parts = normalized.split(".");
  const matching = versions.filter((version) => {
    const candidate = version.replace(/^v/, "");
    if (parts.length === 1) return candidate.startsWith(`${parts[0]}.`);
    if (parts.length === 2) return candidate.startsWith(`${parts[0]}.${parts[1]}.`);
    return candidate === normalized;
  });
  return matching.map((version) => path.join(versionsRoot, version, "bin", "node"));
}

function compareNodeVersionsDesc(left: string, right: string): number {
  const l = left.replace(/^v/, "").split(".").map((part) => Number(part));
  const r = right.replace(/^v/, "").split(".").map((part) => Number(part));
  for (let i = 0; i < 3; i += 1) {
    const diff = (r[i] ?? 0) - (l[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function hasBetterSqliteDependency(probeRoot: string): boolean {
  return fs.existsSync(path.join(probeRoot, "node_modules", "better-sqlite3"));
}

function findBetterSqliteProbeRoot(workspaceRoot: string, nativeProbeRoots?: string[]): string | undefined {
  const roots = [workspaceRoot, ...(nativeProbeRoots ?? [])];
  const seen = new Set<string>();
  for (const root of roots) {
    const normalized = root.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (hasBetterSqliteDependency(normalized)) return normalized;
  }
  return undefined;
}

export function inspectNodeExecutableCandidates(
  resolve?: () => string | undefined,
  workspaceRoot?: string,
  nativeProbeRoots?: string[],
  runtimeRoots?: string[]
): NodeExecutableDiagnostic[] {
  const nativeProbeRoot = workspaceRoot ? findBetterSqliteProbeRoot(workspaceRoot, nativeProbeRoots) : undefined;
  return buildNodeExecutableCandidates(resolve, runtimeRoots).map((nodeBin) => {
    const identity = inspectNodeIdentity(nodeBin);
    return {
      path: nodeBin,
      ...identity,
      nativeSqlite:
        nativeProbeRoot && identity.exists ? probeBetterSqliteWithNode(nodeBin, nativeProbeRoot) : undefined
    };
  });
}

function isPreferredNodeMajor(version?: string): boolean {
  return version?.replace(/^v/, "").split(".", 1)[0] === WORKFLOW_CANNON_NODE_MAJOR;
}

function inspectNodeIdentity(nodeBin: string): Omit<NodeExecutableDiagnostic, "path" | "nativeSqlite"> {
  if (nodeBin !== "node" && nodeBin !== "nodejs" && !fs.existsSync(nodeBin)) {
    return { exists: false };
  }
  try {
    const stdout = execFileSync(
      nodeBin,
      [
        "-p",
        "JSON.stringify({version:process.version,arch:process.arch,platform:process.platform,execPath:process.execPath,modules:process.versions.modules})"
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5_000 }
    );
    const data = JSON.parse(stdout.trim()) as {
      version?: string;
      arch?: string;
      platform?: string;
      execPath?: string;
      modules?: string;
    };
    return { exists: true, ...data };
  } catch (err) {
    return { exists: true, identityError: errorText(err) };
  }
}

function probeBetterSqliteWithNode(nodeBin: string, workspaceRoot: string): NativeSqliteProbeDiagnostic {
  try {
    // `require('better-sqlite3')` only loads the JS wrapper; the native `.node` binding is
    // dlopen'd lazily inside the Database constructor. Instantiate an in-memory database so
    // architecture/ABI mismatches actually surface during the probe.
    execFileSync(
      nodeBin,
      ["-e", "const D=require('better-sqlite3'); const d=new D(':memory:'); d.close();"],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5_000
      }
    );
    return { ok: true };
  } catch (err) {
    const message = errorText(err);
    return { ok: false, kind: classifyNativeSqliteErrorMessage(message), message: message.slice(0, 500) };
  }
}

function errorText(err: unknown): string {
  const e = err as { message?: unknown; stderr?: unknown; stdout?: unknown };
  const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : typeof e.stderr === "string" ? e.stderr : "";
  const stdout = Buffer.isBuffer(e.stdout) ? e.stdout.toString("utf8") : typeof e.stdout === "string" ? e.stdout : "";
  return [stderr.trim(), stdout.trim(), typeof e.message === "string" ? e.message : String(err)]
    .filter(Boolean)
    .join("; ");
}

export function classifyNativeSqliteErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (/incompatible architecture[\s\S]*?have ['"]?([^,'")\s]+)['"]?, need ['"]?([^,'")\s]+)['"]?/i.test(message)) {
    return "architecture-mismatch";
  }
  if (message.includes("NODE_MODULE_VERSION") || lower.includes("was compiled against a different node.js")) {
    return "abi-mismatch";
  }
  if (lower.includes("cannot find module") || lower.includes("module not found") || lower.includes("enoent")) {
    return "missing-binding";
  }
  if (lower.includes("better_sqlite3.node") || lower.includes("better-sqlite3")) {
    return "native-load-failed";
  }
  return "unknown";
}

function looksLikeNativeSqliteError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("better-sqlite3") ||
    lower.includes("better_sqlite3.node") ||
    lower.includes("node_module_version") ||
    lower.includes("incompatible architecture")
  );
}

export function formatNodeExecutableDiagnostics(diagnostics: NodeExecutableDiagnostic[]): string {
  const rendered = diagnostics
    .slice(0, 8)
    .map((candidate) => {
      const identity = candidate.version
        ? `${candidate.version} arch=${candidate.arch ?? "unknown"} platform=${candidate.platform ?? "unknown"} abi=${candidate.modules ?? "unknown"}`
        : candidate.identityError
          ? `identity failed: ${candidate.identityError}`
          : candidate.exists
            ? "identity unavailable"
            : "missing";
      const native = candidate.nativeSqlite
        ? candidate.nativeSqlite.ok
          ? "better-sqlite3 ok"
          : `better-sqlite3 ${candidate.nativeSqlite.kind ?? "failed"}: ${candidate.nativeSqlite.message ?? "load failed"}`
        : "better-sqlite3 not probed";
      return `${candidate.path} (${identity}; ${native})`;
    })
    .join(" | ");
  return `${rendered}. Set workflowCannon.nodeExecutable or WORKSPACE_KIT_NODE to a Node 22 executable that can load Workflow Cannon's node_modules, then rebuild with pnpm rebuild better-sqlite3 if needed.`;
}

export function resolveCliJs(workspaceRoot: string, cliPathOverride?: string, extensionRoot?: string): string {
  if (cliPathOverride && fs.existsSync(cliPathOverride)) {
    return cliPathOverride;
  }
  const candidates = [
    extensionRoot
      ? path.join(extensionRoot, "node_modules", "@workflow-cannon", "workspace-kit", "dist", "cli.js")
      : "",
    path.join(workspaceRoot, "dist", "cli.js"),
    path.join(workspaceRoot, "node_modules", "@workflow-cannon", "workspace-kit", "dist", "cli.js")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  throw new Error(
    "workspace-kit CLI not found. Build the kit (pnpm run build) or install @workflow-cannon/workspace-kit."
  );
}

function inferCliPackageRoot(cliJs: string): string {
  return path.dirname(path.dirname(cliJs));
}

function execKit(
  workspaceRoot: string,
  cliArgs: string[],
  maxBuffer = 20 * 1024 * 1024,
  timeoutMs = 30_000,
  cliPathOverride?: string,
  resolveNodeExecutable?: () => string | undefined,
  extensionRoot?: string
): Promise<CommandClientExecResult> {
  if (!cliPathOverride) {
    const runtimePlan = resolveRuntimeStampExecutionPlan(workspaceRoot);
    if (runtimePlan.kind === "invalid") {
      return Promise.resolve(
        structuredRuntimeStampFailure("extension-runtime-stamp-invalid", runtimePlan.message, {
          stampPath: runtimePlan.stampPath
        })
      );
    }
    if (runtimePlan.kind === "launcher" || runtimePlan.kind === "stamped-node") {
      return new Promise((resolve, reject) => {
        execFile(
          runtimePlan.executable,
          [...runtimePlan.argsPrefix, ...cliArgs],
          { cwd: workspaceRoot, maxBuffer, windowsHide: true, timeout: timeoutMs },
          (err, stdout, stderr) => {
            const out = String(stdout ?? "");
            const errOut = String(stderr ?? "");
            if (err) {
              if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                reject(err);
                return;
              }
              const code = typeof err.code === "number" ? err.code : 1;
              resolve({ exitCode: code, stdout: out, stderr: errOut });
              return;
            }
            resolve({ exitCode: 0, stdout: out, stderr: errOut });
          }
        );
      });
    }
  }
  const cliJs = resolveCliJs(workspaceRoot, cliPathOverride, extensionRoot);
  const cliPackageRoot = inferCliPackageRoot(cliJs);
  const runtimeRoots = [cliPackageRoot, extensionRoot].filter((root): root is string => Boolean(root));
  const nodeBin = pickNodeExecutable(resolveNodeExecutable, workspaceRoot, [cliPackageRoot], runtimeRoots);
  return new Promise((resolve, reject) => {
    execFile(
      nodeBin,
      [cliJs, ...cliArgs],
      { cwd: workspaceRoot, maxBuffer, windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        const out = String(stdout ?? "");
        const errOut = String(stderr ?? "");
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(err);
            return;
          }
          const code = typeof err.code === "number" ? err.code : 1;
          resolve({ exitCode: code, stdout: out, stderr: errOut });
          return;
        }
        resolve({ exitCode: 0, stdout: out, stderr: errOut });
      }
    );
  });
}

export function parseRunCommandOutput(stdout: string, exitCode: number, stderr = ""): KitRunResult {
  const text = stdout.trim();
  const stderrText = stderr.trim();
  try {
    return JSON.parse(text) as KitRunResult;
  } catch {
    const suspectedPackageManagerBanner = looksLikePackageManagerBanner(stdout);
    const hint = suspectedPackageManagerBanner
      ? "stdout looks contaminated by a package-manager banner; use pnpm exec wk or node dist/cli.js for parse-sensitive calls"
      : "capture full stdout and JSON.parse the whole value";
    return {
      ok: false,
      code: "extension-json-parse",
      message: `exit ${exitCode}; ${hint}; stdout: ${text.slice(0, 400)}${stderrText ? `; stderr: ${stderrText.slice(0, 800)}` : ""}`,
      remediation: {
        cleanInvocations: ["pnpm exec wk run <command> '<json>'", "node dist/cli.js run <command> '<json>'"]
      },
      details: {
        suspectedPackageManagerBanner,
        stderr: stderrText.slice(0, 2000)
      }
    };
  }
}

function looksLikePackageManagerBanner(stdout: string): boolean {
  const text = stdout.trimStart();
  if (!text.startsWith(">")) return false;
  const firstJson = text.search(/[{\[]/);
  const banner = firstJson >= 0 ? text.slice(0, firstJson) : text;
  return /^>\s+.+/m.test(banner) && /^>\s+.+/m.test(banner.split("\n").slice(1).join("\n"));
}

type RefreshSlot = {
  work: () => Promise<KitRunResult>;
  waiters: Array<{
    resolve: (value: KitRunResult) => void;
    reject: (reason: unknown) => void;
  }>;
};

export class CommandClient {
  private readonly timeoutMs: number;
  private readonly cliPathOverride?: string;
  private readonly extensionRoot?: string;
  private readonly resolveNodeExecutable?: () => string | undefined;
  private readonly execFn: CommandClientExecFn;
  private readonly onKitRunStart?: (commandName: string, args: Record<string, unknown>) => number;
  private readonly onKitRunEnd?: (
    commandName: string,
    startedAt: number,
    result: { ok: boolean; code?: string; message?: string }
  ) => void;
  private readonly onKitRunNotice?: (message: string) => void;
  /** When true, dashboard refresh reads return immediately without hitting the CLI queue. */
  private refreshPaused = false;

  /** Dual-lane queue: mutations drain before refresh batches; refresh jobs coalesce by key. */
  private mutationEntries: Array<{
    work: () => Promise<KitRunResult>;
    resolve: (value: KitRunResult) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private refreshSlots = new Map<string, RefreshSlot>();
  private laneDrainScheduled = false;
  private laneDraining = false;

  constructor(private readonly workspaceRoot: string, options?: CommandClientOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.cliPathOverride = options?.cliPathOverride;
    this.extensionRoot = options?.extensionRoot;
    this.resolveNodeExecutable = options?.resolveNodeExecutable;
    this.onKitRunStart = options?.onKitRunStart;
    this.onKitRunEnd = options?.onKitRunEnd;
    this.onKitRunNotice = options?.onKitRunNotice;
    this.execFn =
      options?.execFn ??
      ((root, cliArgs) =>
        execKit(
          root,
          cliArgs,
          20 * 1024 * 1024,
          this.timeoutMs,
          this.cliPathOverride,
          this.resolveNodeExecutable,
          this.extensionRoot
        ));
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /** Pause dashboard refresh kit reads so drawer / phase mutations are not queued behind them. */
  setRefreshPaused(paused: boolean): void {
    this.refreshPaused = paused;
  }

  isRefreshPaused(): boolean {
    return this.refreshPaused;
  }

  private enqueueLane(commandName: string, work: () => Promise<KitRunResult>): Promise<KitRunResult> {
    const lane = kitRunLaneForCommand(commandName);
    if (lane === "mutation") {
      return new Promise<KitRunResult>((resolve, reject) => {
        this.mutationEntries.push({ work, resolve, reject });
        this.scheduleLaneDrain();
      });
    }
    const refreshKey = kitRefreshCoalesceKey(commandName);
    return new Promise<KitRunResult>((resolve, reject) => {
      let slot = this.refreshSlots.get(refreshKey);
      if (!slot) {
        slot = { work, waiters: [] };
        this.refreshSlots.set(refreshKey, slot);
      } else {
        slot.work = work;
      }
      slot.waiters.push({ resolve, reject });
      this.scheduleLaneDrain();
    });
  }

  private scheduleLaneDrain(): void {
    if (this.laneDrainScheduled) {
      return;
    }
    this.laneDrainScheduled = true;
    queueMicrotask(() => {
      this.laneDrainScheduled = false;
      void this.drainLaneQueue();
    });
  }

  private async drainLaneQueue(): Promise<void> {
    if (this.laneDraining) {
      return;
    }
    this.laneDraining = true;
    try {
      while (this.mutationEntries.length > 0 || this.refreshSlots.size > 0) {
        while (this.mutationEntries.length > 0) {
          const entry = this.mutationEntries.shift()!;
          try {
            entry.resolve(await entry.work());
          } catch (error) {
            entry.reject(error);
          }
        }
        const refreshKeys = [...this.refreshSlots.keys()];
        for (const refreshKey of refreshKeys) {
          const slot = this.refreshSlots.get(refreshKey);
          if (!slot) {
            continue;
          }
          this.refreshSlots.delete(refreshKey);
          if (this.refreshPaused) {
            const paused = kitRefreshPausedResult();
            for (const waiter of slot.waiters) {
              waiter.resolve(paused);
            }
            continue;
          }
          try {
            const result = await slot.work();
            for (const waiter of slot.waiters) {
              waiter.resolve(result);
            }
          } catch (error) {
            for (const waiter of slot.waiters) {
              waiter.reject(error);
            }
          }
        }
      }
    } finally {
      this.laneDraining = false;
      if (this.mutationEntries.length > 0 || this.refreshSlots.size > 0) {
        void this.drainLaneQueue();
      }
    }
  }

  /** `workspace-kit run <name> <json>` — parses single JSON object from stdout. */
  async run(commandName: string, args: Record<string, unknown>): Promise<KitRunResult> {
    if (this.refreshPaused && isKitRefreshRunCommand(commandName)) {
      return kitRefreshPausedResult();
    }
    return this.enqueueLane(commandName, () => {
      if (this.refreshPaused && isKitRefreshRunCommand(commandName)) {
        return Promise.resolve(kitRefreshPausedResult());
      }
      return this.runOnce(commandName, args);
    });
  }

  /** Single serialized `workspace-kit run` invocation (do not call directly). */
  private async runOnce(commandName: string, args: Record<string, unknown>): Promise<KitRunResult> {
    const startedAt = this.onKitRunStart?.(commandName, args) ?? Date.now();
    const jsonArg = JSON.stringify(args);
    try {
      const { stdout, stderr, exitCode } = await this.execFn(this.workspaceRoot, [
        "run",
        commandName,
        jsonArg
      ]);
      if (stderr.trim()) {
        this.onKitRunNotice?.(`stderr ${commandName}: ${stderr.trim().slice(0, 400)}`);
      }
      const parsed = parseRunCommandOutput(stdout, exitCode, stderr);
      if (!parsed.ok && exitCode !== 0 && looksLikeNativeSqliteError(`${stderr}\n${stdout}`)) {
        let nativeProbeRoots: string[] | undefined;
        let runtimeRoots: string[] | undefined;
        try {
          const cliPackageRoot = inferCliPackageRoot(
            resolveCliJs(this.workspaceRoot, this.cliPathOverride, this.extensionRoot)
          );
          nativeProbeRoots = [cliPackageRoot];
          runtimeRoots = [cliPackageRoot, this.extensionRoot].filter((root): root is string => Boolean(root));
        } catch {
          nativeProbeRoots = undefined;
          runtimeRoots = this.extensionRoot ? [this.extensionRoot] : undefined;
        }
        const diagnostics = inspectNodeExecutableCandidates(
          this.resolveNodeExecutable,
          this.workspaceRoot,
          nativeProbeRoots,
          runtimeRoots
        );
        const fail = {
          ok: false as const,
          code: "extension-native-sqlite-runtime-incompatible",
          message: formatNodeExecutableDiagnostics(diagnostics),
          details: { nodeCandidates: diagnostics }
        };
        this.onKitRunEnd?.(commandName, startedAt, fail);
        return fail;
      }
      this.onKitRunEnd?.(commandName, startedAt, parsed);
      return parsed;
    } catch (e) {
      const fail = {
        ok: false as const,
        code: "extension-exec-error",
        message: e instanceof Error ? e.message : String(e)
      };
      this.onKitRunEnd?.(commandName, startedAt, fail);
      return fail;
    }
  }

  async recordActivity(input: CommandClientActivityInput): Promise<void> {
    const out = await this.run("set-agent-activity", {
      ...input,
      source: "vscode-extension"
    });
    if (!out.ok) {
      this.onKitRunNotice?.(`activity record failed: ${String(out.message ?? out.code ?? "unknown")}`);
    }
  }

  async clearActivity(args: Record<string, unknown> = {}): Promise<void> {
    const out = await this.run("clear-agent-activity", {
      ...args,
      source: "vscode-extension"
    });
    if (!out.ok) {
      this.onKitRunNotice?.(`activity clear failed: ${String(out.message ?? out.code ?? "unknown")}`);
    }
  }

  /** Raw `workspace-kit config …`. */
  async config(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr, exitCode } = await this.execFn(this.workspaceRoot, ["config", ...argv]);
      return { code: exitCode, stdout, stderr };
    } catch (e) {
      return { code: 1, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
    }
  }
}
