import { execFileSync } from "node:child_process";

import { missingDeliveryEvidenceFieldsV1, validateDeliveryEvidenceMetadata } from "./delivery-evidence.js";
import type { EvaluateDeliveryEvidenceOptions } from "./delivery-evidence.js";

export const HARVEST_DELIVERY_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type HarvestSignalStatus = {
  git: "ok" | "unavailable";
  github: "ok" | "degraded" | "unavailable";
};

export type HarvestDeliveryEvidencePreview = {
  schemaVersion: typeof HARVEST_DELIVERY_EVIDENCE_SCHEMA_VERSION;
  deliveryEvidence: Record<string, unknown>;
  missingFields: string[];
  signalStatus: HarvestSignalStatus;
  remediationCommands: string[];
  validation: ReturnType<typeof validateDeliveryEvidenceMetadata>;
};

function runGit(workspacePath: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", workspacePath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}

function runGhJson(workspacePath: string, args: string[]): Record<string, unknown> | null {
  try {
    const out = execFileSync("gh", args, {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GH_PAGER: "", PAGER: "" }
    }).trim();
    if (!out) {
      return null;
    }
    const parsed: unknown = JSON.parse(out);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function mapGhChecks(prView: Record<string, unknown>): Array<{ name: string; conclusion: string }> {
  const rollup = prView.statusCheckRollup;
  if (!Array.isArray(rollup)) {
    return [];
  }
  const checks: Array<{ name: string; conclusion: string }> = [];
  for (const row of rollup) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : typeof r.context === "string" ? r.context : null;
    if (!name) {
      continue;
    }
    const state = typeof r.state === "string" ? r.state : typeof r.conclusion === "string" ? r.conclusion : "unknown";
    checks.push({ name, conclusion: state.toLowerCase() });
  }
  return checks;
}

export function harvestDeliveryEvidencePreview(args: {
  workspacePath: string;
  branchName?: string | null;
  baseBranch?: string | null;
  mergeSha?: string | null;
  validationCommands?: Array<{ command: string; result?: string; exitCode?: number }>;
  policyOptions?: EvaluateDeliveryEvidenceOptions;
}): HarvestDeliveryEvidencePreview {
  const remediationCommands: string[] = [];
  const signalStatus: HarvestSignalStatus = { git: "unavailable", github: "unavailable" };

  const inside = runGit(args.workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    remediationCommands.push("Run from a git checkout at the workspace root.");
    const deliveryEvidence: Record<string, unknown> = { schemaVersion: 1 };
    return {
      schemaVersion: HARVEST_DELIVERY_EVIDENCE_SCHEMA_VERSION,
      deliveryEvidence,
      missingFields: missingDeliveryEvidenceFieldsV1(deliveryEvidence),
      signalStatus,
      remediationCommands,
      validation: validateDeliveryEvidenceMetadata(deliveryEvidence, args.policyOptions)
    };
  }

  signalStatus.git = "ok";
  const branchName =
    args.branchName?.trim() ||
    runGit(args.workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]) ||
    "";
  let mergeSha = args.mergeSha?.trim() || runGit(args.workspacePath, ["rev-parse", "HEAD"]) || "";

  let baseBranch = args.baseBranch?.trim() || "";
  let prUrl: string | undefined;
  let prNumber: number | undefined;
  let checks: Array<{ name: string; conclusion: string }> = [];

  const prView =
    branchName && branchName !== "HEAD"
      ? runGhJson(args.workspacePath, [
          "pr",
          "view",
          "--head",
          branchName,
          "--json",
          "url,number,baseRefName,state,mergeCommit,statusCheckRollup"
        ])
      : null;

  if (prView) {
    signalStatus.github = "ok";
    if (typeof prView.url === "string" && prView.url.trim()) {
      prUrl = prView.url.trim();
    }
    const num = positiveInteger(prView.number);
    if (num) {
      prNumber = num;
    }
    if (!baseBranch && typeof prView.baseRefName === "string" && prView.baseRefName.trim()) {
      baseBranch = prView.baseRefName.trim();
    }
    const mergeCommit = prView.mergeCommit;
    if (mergeCommit && typeof mergeCommit === "object" && !Array.isArray(mergeCommit)) {
      const oid = (mergeCommit as Record<string, unknown>).oid;
      if (typeof oid === "string" && oid.trim()) {
        mergeSha = oid.trim();
      }
    }
    checks = mapGhChecks(prView);
  } else if (branchName) {
    signalStatus.github = "degraded";
    remediationCommands.push(
      `GH_PAGER=cat gh pr view --head ${branchName} --json url,number,baseRefName,statusCheckRollup`
    );
    remediationCommands.push("Ensure gh auth login and the task branch has an open or merged PR.");
  }

  if (!baseBranch) {
    const upstream = runGit(args.workspacePath, ["rev-parse", "--abbrev-ref", `${branchName}@{upstream}`]);
    if (upstream && upstream.includes("/")) {
      baseBranch = upstream.split("/").slice(1).join("/");
    }
  }

  const validationCommands =
    args.validationCommands && args.validationCommands.length > 0
      ? args.validationCommands.map((row) => ({
          command: row.command,
          ...(typeof row.exitCode === "number"
            ? { exitCode: row.exitCode }
            : { result: row.result ?? "success" })
        }))
      : [];

  if (validationCommands.length === 0) {
    remediationCommands.push(
      'pnpm exec wk run recommend-validation \'{"taskId":"<T###>"}\' — then re-run harvest with recorded commands or run checks locally first.'
    );
  }

  if (checks.length === 0 && prNumber) {
    remediationCommands.push(`GH_PAGER=cat gh pr checks ${prNumber} --json name,state,bucket`);
  }

  const deliveryEvidence: Record<string, unknown> = {
    schemaVersion: 1,
    ...(branchName ? { branchName } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(baseBranch ? { baseBranch } : {}),
    ...(mergeSha ? { mergeSha } : {}),
    ...(checks.length > 0 ? { checks } : {}),
    ...(validationCommands.length > 0 ? { validationCommands } : {})
  };

  const missingFields = missingDeliveryEvidenceFieldsV1(deliveryEvidence);
  const validation = validateDeliveryEvidenceMetadata(deliveryEvidence, args.policyOptions);

  return {
    schemaVersion: HARVEST_DELIVERY_EVIDENCE_SCHEMA_VERSION,
    deliveryEvidence,
    missingFields,
    signalStatus,
    remediationCommands,
    validation
  };
}
