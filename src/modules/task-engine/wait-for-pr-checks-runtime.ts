import { execFileSync } from "node:child_process";

export const WAIT_FOR_PR_CHECKS_SCHEMA_VERSION = 1 as const;

export type PrCheckRow = {
  name: string;
  state: string;
  link?: string;
  workflow?: string;
};

export type WaitForPrChecksTerminalState = "passed" | "failed" | "timeout" | "no-checks-yet";

export type WaitForPrChecksResult = {
  schemaVersion: typeof WAIT_FOR_PR_CHECKS_SCHEMA_VERSION;
  pr: number;
  state: WaitForPrChecksTerminalState;
  failedChecks: Array<{ name: string; state: string; link?: string }>;
  elapsedSec: number;
  pollCount: number;
  checks: PrCheckRow[];
};

const TERMINAL_SUCCESS = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const PENDING_STATES = new Set(["PENDING", "IN_PROGRESS", "QUEUED", "WAITING"]);

export function parsePrChecksJson(raw: string | null): PrCheckRow[] | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const rows: PrCheckRow[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
    const state = typeof r.state === "string" && r.state.trim() ? r.state.trim().toUpperCase() : null;
    if (!name || !state) {
      continue;
    }
    rows.push({
      name,
      state,
      ...(typeof r.link === "string" && r.link.trim() ? { link: r.link.trim() } : {}),
      ...(typeof r.workflow === "string" && r.workflow.trim() ? { workflow: r.workflow.trim() } : {})
    });
  }
  return rows;
}

export function evaluatePrChecks(rows: PrCheckRow[] | null): {
  state: "pending" | "passed" | "failed";
  failedChecks: Array<{ name: string; state: string; link?: string }>;
} {
  if (!rows || rows.length === 0) {
    return { state: "pending", failedChecks: [] };
  }
  const failed: Array<{ name: string; state: string; link?: string }> = [];
  for (const row of rows) {
    if (PENDING_STATES.has(row.state)) {
      return { state: "pending", failedChecks: [] };
    }
    if (!TERMINAL_SUCCESS.has(row.state)) {
      failed.push({ name: row.name, state: row.state, ...(row.link ? { link: row.link } : {}) });
    }
  }
  if (failed.length > 0) {
    return { state: "failed", failedChecks: failed };
  }
  return { state: "passed", failedChecks: [] };
}

export type GhChecksRunner = (
  workspacePath: string,
  pr: number,
  requiredOnly: boolean
) => { ok: true; raw: string } | { ok: false; code: "gh-unavailable" | "no-checks-yet" | "gh-error"; message?: string };

export function defaultGhChecksRunner(
  workspacePath: string,
  pr: number,
  requiredOnly: boolean
): ReturnType<GhChecksRunner> {
  const args = ["pr", "checks", String(pr), "--json", "name,state,link,workflow"];
  if (requiredOnly) {
    args.push("--required");
  }
  try {
    const raw = execFileSync("gh", args, {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GH_PAGER: "", PAGER: "" }
    });
    return { ok: true, raw };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer | string };
    const code = err.status;
    const stderr = err.stderr ? String(err.stderr) : "";
    if (code === 8) {
      return { ok: false, code: "no-checks-yet", message: stderr || "checks not reported yet" };
    }
    return { ok: false, code: "gh-error", message: stderr || String(e) };
  }
}

export function waitForPrChecks(args: {
  workspacePath: string;
  pr: number;
  timeoutSec: number;
  intervalSec: number;
  requiredOnly: boolean;
  runGh?: GhChecksRunner;
  nowMs?: () => number;
  sleepMs?: (ms: number) => void;
}): WaitForPrChecksResult {
  const runGh = args.runGh ?? defaultGhChecksRunner;
  const nowMs = args.nowMs ?? (() => Date.now());
  const sleepMs =
    args.sleepMs ??
    ((ms: number) => {
      if (ms <= 0) {
        return;
      }
      const sec = Math.max(1, Math.ceil(ms / 1000));
      execFileSync("sleep", [String(sec)], { stdio: "ignore" });
    });

  const started = nowMs();
  const deadline = started + args.timeoutSec * 1000;
  let pollCount = 0;
  let lastRows: PrCheckRow[] = [];

  while (nowMs() < deadline) {
    pollCount += 1;
    const gh = runGh(args.workspacePath, args.pr, args.requiredOnly);
    if (!gh.ok) {
      if (gh.code === "gh-unavailable") {
        return {
          schemaVersion: WAIT_FOR_PR_CHECKS_SCHEMA_VERSION,
          pr: args.pr,
          state: "failed",
          failedChecks: [{ name: "gh-cli", state: "UNAVAILABLE" }],
          elapsedSec: Math.round((nowMs() - started) / 1000),
          pollCount,
          checks: []
        };
      }
      if (gh.code === "no-checks-yet") {
        sleepMs(args.intervalSec * 1000);
        continue;
      }
      return {
        schemaVersion: WAIT_FOR_PR_CHECKS_SCHEMA_VERSION,
        pr: args.pr,
        state: "failed",
        failedChecks: [{ name: "gh-cli", state: "ERROR" }],
        elapsedSec: Math.round((nowMs() - started) / 1000),
        pollCount,
        checks: lastRows
      };
    }

    const rows = parsePrChecksJson(gh.raw);
    lastRows = rows ?? [];
    const evalResult = evaluatePrChecks(rows);
    if (evalResult.state === "pending") {
      sleepMs(args.intervalSec * 1000);
      continue;
    }
    if (evalResult.state === "failed") {
      return {
        schemaVersion: WAIT_FOR_PR_CHECKS_SCHEMA_VERSION,
        pr: args.pr,
        state: "failed",
        failedChecks: evalResult.failedChecks,
        elapsedSec: Math.round((nowMs() - started) / 1000),
        pollCount,
        checks: lastRows
      };
    }
    return {
      schemaVersion: WAIT_FOR_PR_CHECKS_SCHEMA_VERSION,
      pr: args.pr,
      state: "passed",
      failedChecks: [],
      elapsedSec: Math.round((nowMs() - started) / 1000),
      pollCount,
      checks: lastRows
    };
  }

  return {
    schemaVersion: WAIT_FOR_PR_CHECKS_SCHEMA_VERSION,
    pr: args.pr,
    state: lastRows.length === 0 ? "no-checks-yet" : "timeout",
    failedChecks: [],
    elapsedSec: Math.round((nowMs() - started) / 1000),
    pollCount,
    checks: lastRows
  };
}
