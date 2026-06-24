import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runGit, resolveGitCommonDir } from "./workspace-edit-lease.js";
import { listIntentFiles, readIntentFile } from "./task-mutation-intents.js";

const PROPOSAL_FILE_SUFFIX = ".json";
const PROPOSAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export type IsolatedProposalStatus = "active" | "discarded";

export type IsolatedProposalValidationEvidence = {
  command: string;
  status: "passed" | "failed" | "warn";
  summary?: string;
  ranAt: string;
};

export type IsolatedProposalAction = {
  id: "view_diff" | "apply" | "open_pr" | "discard";
  label: string;
  command: string;
  args: Record<string, unknown>;
};

export type IsolatedProposalV1 = {
  schemaVersion: 1;
  proposalId: string;
  status: IsolatedProposalStatus;
  title: string;
  taskIds: string[];
  baseBranch: string;
  proposalBranch: string;
  worktreePath: string;
  createdBy: string | null;
  sourceBranch: string | null;
  sourceHeadSha: string | null;
  createdAt: string;
  discardedAt?: string;
  recoveredAt?: string;
  changedFiles: string[];
  validationEvidence: IsolatedProposalValidationEvidence[];
  taskMutationIntentIds: string[];
};

export type IsolatedProposalSummary = {
  proposalId: string;
  status: IsolatedProposalStatus;
  title: string;
  taskIds: string[];
  baseBranch: string;
  proposalBranch: string;
  worktreePath: string;
  changedFiles: string[];
  validationEvidenceCount: number;
  taskMutationIntentCount: number;
  createdAt: string;
  discardedAt?: string;
  recoveredAt?: string;
  actions: IsolatedProposalAction[];
};

export function normalizeProposalId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!PROPOSAL_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function allocateProposalId(): string {
  return `proposal-${randomUUID()}`;
}

export function proposalDirFromCommonDir(gitCommonDir: string): string {
  return path.join(gitCommonDir, "workflow-cannon", "proposals");
}

export function resolveProposalDir(workspacePath: string): string | null {
  const commonDir = resolveGitCommonDir(workspacePath);
  if (!commonDir) {
    return null;
  }
  return proposalDirFromCommonDir(commonDir);
}

export function proposalFilePath(proposalDir: string, proposalId: string): string {
  return path.join(proposalDir, `${proposalId}${PROPOSAL_FILE_SUFFIX}`);
}

function parseIsoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const stamp = Date.parse(raw);
  if (Number.isNaN(stamp)) {
    return null;
  }
  return new Date(stamp).toISOString();
}

function parseValidationEvidence(raw: unknown): IsolatedProposalValidationEvidence[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: IsolatedProposalValidationEvidence[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const rec = row as Record<string, unknown>;
    const command = typeof rec.command === "string" ? rec.command.trim() : "";
    const status = rec.status;
    const ranAt = parseIsoOrNull(rec.ranAt);
    if (!command || !ranAt || (status !== "passed" && status !== "failed" && status !== "warn")) {
      continue;
    }
    const summary = typeof rec.summary === "string" && rec.summary.trim() ? rec.summary.trim() : undefined;
    out.push({ command, status, ranAt, ...(summary ? { summary } : {}) });
  }
  return out.sort((a, b) => a.ranAt.localeCompare(b.ranAt) || a.command.localeCompare(b.command));
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...new Set(raw.filter((v) => typeof v === "string").map((v) => (v as string).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function readProposalFile(filePath: string):
  | { ok: true; proposal: IsolatedProposalV1 }
  | { ok: false; message: string; proposalId: string | null } {
  let body = "";
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return { ok: false, message: `Unable to read proposal file: ${(error as Error).message}`, proposalId: null };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, message: "Proposal file is not valid JSON", proposalId: null };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Proposal file must be a JSON object", proposalId: null };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    return { ok: false, message: `Unsupported schemaVersion: ${String(obj.schemaVersion)}`, proposalId: null };
  }
  const proposalId = normalizeProposalId(obj.proposalId);
  if (!proposalId) {
    return { ok: false, message: "proposalId is missing or invalid", proposalId: null };
  }
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : null;
  const baseBranch = typeof obj.baseBranch === "string" && obj.baseBranch.trim() ? obj.baseBranch.trim() : null;
  const proposalBranch = typeof obj.proposalBranch === "string" && obj.proposalBranch.trim() ? obj.proposalBranch.trim() : null;
  const worktreePath = typeof obj.worktreePath === "string" && obj.worktreePath.trim() ? obj.worktreePath.trim() : null;
  const createdAt = parseIsoOrNull(obj.createdAt);
  const status = obj.status;
  if (
    !title ||
    !baseBranch ||
    !proposalBranch ||
    !worktreePath ||
    !createdAt ||
    (status !== "active" && status !== "discarded")
  ) {
    return { ok: false, message: "Proposal file is missing required fields", proposalId };
  }
  const parsed: IsolatedProposalV1 = {
    schemaVersion: 1,
    proposalId,
    status,
    title,
    taskIds: parseStringArray(obj.taskIds),
    baseBranch,
    proposalBranch,
    worktreePath: path.normalize(worktreePath),
    createdBy: typeof obj.createdBy === "string" && obj.createdBy.trim() ? obj.createdBy.trim() : null,
    sourceBranch: typeof obj.sourceBranch === "string" && obj.sourceBranch.trim() ? obj.sourceBranch.trim() : null,
    sourceHeadSha: typeof obj.sourceHeadSha === "string" && obj.sourceHeadSha.trim() ? obj.sourceHeadSha.trim() : null,
    createdAt,
    changedFiles: parseStringArray(obj.changedFiles),
    validationEvidence: parseValidationEvidence(obj.validationEvidence),
    taskMutationIntentIds: parseStringArray(obj.taskMutationIntentIds)
  };
  const discardedAt = parseIsoOrNull(obj.discardedAt);
  const recoveredAt = parseIsoOrNull(obj.recoveredAt);
  if (discardedAt) {
    parsed.discardedAt = discardedAt;
  }
  if (recoveredAt) {
    parsed.recoveredAt = recoveredAt;
  }
  return { ok: true, proposal: parsed };
}

export function listProposalFiles(proposalDir: string): string[] {
  if (!fs.existsSync(proposalDir)) {
    return [];
  }
  return fs
    .readdirSync(proposalDir)
    .filter((entry) => entry.endsWith(PROPOSAL_FILE_SUFFIX))
    .map((entry) => path.join(proposalDir, entry))
    .sort();
}

export function writeProposalAtomic(proposalDir: string, proposal: IsolatedProposalV1): void {
  fs.mkdirSync(proposalDir, { recursive: true });
  const finalPath = proposalFilePath(proposalDir, proposal.proposalId);
  const tmpPath = path.join(proposalDir, `.${proposal.proposalId}.${randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, finalPath);
}

export function defaultProposalWorktreePath(workspacePath: string, proposalId: string): string {
  const parent = path.dirname(workspacePath);
  const leaf = path.basename(workspacePath);
  const candidates = [
    path.join(parent, `${leaf}-${proposalId}`),
    path.join(os.tmpdir(), `wk-${proposalId}`)
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return `${candidates[0]}-${Date.now()}`;
}

function gitBranchExists(workspacePath: string, branch: string): boolean {
  const resolved = runGit(workspacePath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  return resolved.code === 0;
}

export function createOrAttachProposalWorktree(input: {
  workspacePath: string;
  proposalBranch: string;
  baseBranch: string;
  worktreePath: string;
}): { ok: true } | { ok: false; message: string } {
  const worktreePath = path.normalize(input.worktreePath);
  if (fs.existsSync(worktreePath) && fs.readdirSync(worktreePath).length > 0) {
    return { ok: false, message: `Refusing to use non-empty worktree path '${worktreePath}'` };
  }
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const addArgs = gitBranchExists(input.workspacePath, input.proposalBranch)
    ? ["worktree", "add", worktreePath, input.proposalBranch]
    : ["worktree", "add", "-b", input.proposalBranch, worktreePath, input.baseBranch];
  const added = runGit(input.workspacePath, addArgs);
  if (added.code !== 0) {
    return { ok: false, message: added.stderr || added.stdout || "git worktree add failed" };
  }
  return { ok: true };
}

export function removeProposalWorktree(workspacePath: string, worktreePath: string): {
  ok: boolean;
  message: string | null;
} {
  const removed = runGit(workspacePath, ["worktree", "remove", "--force", worktreePath]);
  if (removed.code !== 0) {
    return { ok: false, message: removed.stderr || removed.stdout || "git worktree remove failed" };
  }
  return { ok: true, message: null };
}

export function proposalChangedFiles(workspacePath: string, baseBranch: string, proposalBranch: string): string[] {
  const diff = runGit(workspacePath, ["diff", "--name-only", `${baseBranch}...${proposalBranch}`]);
  if (diff.code !== 0) {
    return [];
  }
  return diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function summarizeProposal(proposal: IsolatedProposalV1): IsolatedProposalSummary {
  return {
    proposalId: proposal.proposalId,
    status: proposal.status,
    title: proposal.title,
    taskIds: [...proposal.taskIds],
    baseBranch: proposal.baseBranch,
    proposalBranch: proposal.proposalBranch,
    worktreePath: proposal.worktreePath,
    changedFiles: [...proposal.changedFiles],
    validationEvidenceCount: proposal.validationEvidence.length,
    taskMutationIntentCount: proposal.taskMutationIntentIds.length,
    createdAt: proposal.createdAt,
    ...(proposal.discardedAt ? { discardedAt: proposal.discardedAt } : {}),
    ...(proposal.recoveredAt ? { recoveredAt: proposal.recoveredAt } : {}),
    actions: [
      {
        id: "view_diff",
        label: "View Diff",
        command: "view-isolated-proposal-diff",
        args: { proposalId: proposal.proposalId }
      },
      {
        id: "apply",
        label: "Apply",
        command: "apply-isolated-proposal",
        args: { proposalId: proposal.proposalId, dryRun: true }
      },
      {
        id: "open_pr",
        label: "Open PR",
        command: "open-isolated-proposal-pr",
        args: { proposalId: proposal.proposalId, dryRun: true }
      },
      {
        id: "discard",
        label: "Discard",
        command: "discard-isolated-proposal",
        args: { proposalId: proposal.proposalId }
      }
    ]
  };
}

export function resolveProposalMutationIntentIds(
  workspacePath: string,
  proposal: Pick<IsolatedProposalV1, "proposalBranch" | "worktreePath" | "taskIds">
): string[] {
  const intentDir = resolveGitCommonDir(workspacePath);
  if (!intentDir) {
    return [];
  }
  const queueDir = path.join(intentDir, "workflow-cannon", "intents");
  if (!fs.existsSync(queueDir)) {
    return [];
  }
  const taskIdSet = new Set(proposal.taskIds);
  const matches = new Set<string>();
  for (const filePath of listIntentFiles(queueDir)) {
    const parsed = readIntentFile(filePath);
    if (!parsed.ok) {
      continue;
    }
    const intent = parsed.intent;
    if (intent.branch === proposal.proposalBranch || intent.worktreePath === proposal.worktreePath) {
      matches.add(intent.intentId);
      continue;
    }
    if (intent.taskId && taskIdSet.has(intent.taskId)) {
      matches.add(intent.intentId);
    }
  }
  return [...matches].sort((a, b) => a.localeCompare(b));
}
