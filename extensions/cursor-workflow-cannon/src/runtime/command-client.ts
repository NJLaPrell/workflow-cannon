import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DashboardAgentStatusKind } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";

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
  execFn?: CommandClientExecFn;
  timeoutMs?: number;
  /**
   * Return a path to `node` (or `node` / `nodejs` to use PATH). Used so the CLI runs with the same
   * Node as `pnpm install` / native addons — not the editor's `process.execPath` (Electron), which
   * breaks better-sqlite3 ABI.
   */
  resolveNodeExecutable?: () => string | undefined;
};

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

/** Pick Node binary for spawning workspace-kit; never uses extension-host `process.execPath` by default. */
export function pickNodeExecutable(
  resolve?: () => string | undefined,
  workspaceRoot?: string,
  nativeProbeRoots?: string[]
): string {
  const candidates = buildNodeExecutableCandidates(resolve, workspaceRoot);
  if (workspaceRoot && findBetterSqliteProbeRoot(workspaceRoot, nativeProbeRoots)) {
    const nativeCompatible = inspectNodeExecutableCandidates(resolve, workspaceRoot, nativeProbeRoots).find(
      (candidate) => candidate.exists && candidate.nativeSqlite?.ok
    );
    if (nativeCompatible) return nativeCompatible.path;
  }
  return candidates[0] ?? "node";
}

function buildNodeExecutableCandidates(resolve?: () => string | undefined, workspaceRoot?: string): string[] {
  const fromResolver = resolve?.()?.trim();
  const candidates: string[] = [];
  addNodeCandidate(candidates, fromResolver);
  const fromEnv = process.env.WORKSPACE_KIT_NODE?.trim();
  addNodeCandidate(candidates, fromEnv);
  for (const p of discoverNvmNodeExecutables(workspaceRoot)) {
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

function discoverNvmNodeExecutables(workspaceRoot?: string): string[] {
  const nvmRoot = process.env.NVM_DIR?.trim() || path.join(os.homedir(), ".nvm");
  const versionsRoot = path.join(nvmRoot, "versions", "node");
  const discovered: string[] = [];
  const versions = listNvmVersionDirs(versionsRoot);

  for (const spec of readWorkspaceNodeVersionSpecs(workspaceRoot)) {
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

function readWorkspaceNodeVersionSpecs(workspaceRoot?: string): string[] {
  if (!workspaceRoot) return [];
  const specs: string[] = [];
  for (const fileName of [".node-version", ".nvmrc"]) {
    const filePath = path.join(workspaceRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    const spec = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.trim();
    if (spec && !spec.startsWith("#")) specs.push(spec);
  }
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
  nativeProbeRoots?: string[]
): NodeExecutableDiagnostic[] {
  const nativeProbeRoot = workspaceRoot ? findBetterSqliteProbeRoot(workspaceRoot, nativeProbeRoots) : undefined;
  return buildNodeExecutableCandidates(resolve, workspaceRoot).map((nodeBin) => {
    const identity = inspectNodeIdentity(nodeBin);
    return {
      path: nodeBin,
      ...identity,
      nativeSqlite:
        nativeProbeRoot && identity.exists ? probeBetterSqliteWithNode(nodeBin, nativeProbeRoot) : undefined
    };
  });
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
    execFileSync(nodeBin, ["-e", "require('better-sqlite3')"], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000
    });
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
  return `${rendered}. Set workflowCannon.nodeExecutable or WORKSPACE_KIT_NODE to the Node executable that installed node_modules, then rebuild with pnpm rebuild better-sqlite3 if needed.`;
}

function resolveCliJs(workspaceRoot: string, cliPathOverride?: string): string {
  if (cliPathOverride && fs.existsSync(cliPathOverride)) {
    return cliPathOverride;
  }
  const candidates = [
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
  resolveNodeExecutable?: () => string | undefined
): Promise<CommandClientExecResult> {
  const cliJs = resolveCliJs(workspaceRoot, cliPathOverride);
  const nodeBin = pickNodeExecutable(resolveNodeExecutable, workspaceRoot, [inferCliPackageRoot(cliJs)]);
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

export class CommandClient {
  private readonly timeoutMs: number;
  private readonly cliPathOverride?: string;
  private readonly resolveNodeExecutable?: () => string | undefined;
  private readonly execFn: CommandClientExecFn;

  constructor(private readonly workspaceRoot: string, options?: CommandClientOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.cliPathOverride = options?.cliPathOverride;
    this.resolveNodeExecutable = options?.resolveNodeExecutable;
    this.execFn =
      options?.execFn ??
      ((root, cliArgs) =>
        execKit(
          root,
          cliArgs,
          20 * 1024 * 1024,
          this.timeoutMs,
          this.cliPathOverride,
          this.resolveNodeExecutable
        ));
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /** `workspace-kit run <name> <json>` — parses single JSON object from stdout. */
  async run(commandName: string, args: Record<string, unknown>): Promise<KitRunResult> {
    const jsonArg = JSON.stringify(args);
    try {
      const { stdout, stderr, exitCode } = await this.execFn(this.workspaceRoot, [
        "run",
        commandName,
        jsonArg
      ]);
      if (stderr.trim()) {
        console.warn("workspace-kit stderr:", stderr.slice(0, 500));
      }
      const parsed = parseRunCommandOutput(stdout, exitCode, stderr);
      if (!parsed.ok && exitCode !== 0 && looksLikeNativeSqliteError(`${stderr}\n${stdout}`)) {
        let nativeProbeRoots: string[] | undefined;
        try {
          nativeProbeRoots = [inferCliPackageRoot(resolveCliJs(this.workspaceRoot, this.cliPathOverride))];
        } catch {
          nativeProbeRoots = undefined;
        }
        const diagnostics = inspectNodeExecutableCandidates(
          this.resolveNodeExecutable,
          this.workspaceRoot,
          nativeProbeRoots
        );
        return {
          ok: false,
          code: "extension-native-sqlite-runtime-incompatible",
          message: formatNodeExecutableDiagnostics(diagnostics),
          details: { nodeCandidates: diagnostics }
        };
      }
      return parsed;
    } catch (e) {
      return {
        ok: false,
        code: "extension-exec-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
  }

  async recordActivity(input: CommandClientActivityInput): Promise<void> {
    const out = await this.run("set-agent-activity", {
      ...input,
      source: "vscode-extension"
    });
    if (!out.ok) {
      console.warn("workspace-kit activity record failed:", String(out.message ?? out.code ?? "unknown"));
    }
  }

  async clearActivity(args: Record<string, unknown> = {}): Promise<void> {
    const out = await this.run("clear-agent-activity", {
      ...args,
      source: "vscode-extension"
    });
    if (!out.ok) {
      console.warn("workspace-kit activity clear failed:", String(out.message ?? out.code ?? "unknown"));
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
