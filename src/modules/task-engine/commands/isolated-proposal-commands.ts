import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { spawnSync } from "node:child_process";
import type { TaskStore } from "../persistence/store.js";
import { gatherCheckoutFingerprint, runGit } from "../coordination/workspace-edit-lease.js";
import {
  allocateProposalId,
  createOrAttachProposalWorktree,
  defaultProposalWorktreePath,
  listProposalFiles,
  normalizeProposalId,
  proposalChangedFiles,
  proposalFilePath,
  readProposalFile,
  removeProposalWorktree,
  resolveProposalDir,
  resolveProposalMutationIntentIds,
  summarizeProposal,
  writeProposalAtomic,
  type IsolatedProposalV1,
  type IsolatedProposalValidationEvidence
} from "../coordination/isolated-proposals.js";

function readStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readTaskIds(args: Record<string, unknown>, fallbackTaskId: string | null): string[] {
  const taskIdsRaw = args.taskIds;
  const taskIds =
    Array.isArray(taskIdsRaw) && taskIdsRaw.length > 0
      ? [...new Set(taskIdsRaw.filter((v) => typeof v === "string").map((v) => (v as string).trim()).filter(Boolean))]
      : fallbackTaskId
        ? [fallbackTaskId]
        : [];
  return taskIds.sort((a, b) => a.localeCompare(b));
}

function parseValidationEvidenceRows(raw: unknown): IsolatedProposalValidationEvidence[] {
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
    const summary = typeof rec.summary === "string" && rec.summary.trim() ? rec.summary.trim() : undefined;
    const ranAtRaw = rec.ranAt;
    const ranAt = typeof ranAtRaw === "string" && !Number.isNaN(Date.parse(ranAtRaw)) ? new Date(ranAtRaw).toISOString() : null;
    if (!command || !ranAt || (status !== "passed" && status !== "failed" && status !== "warn")) {
      continue;
    }
    out.push({ command, status, ranAt, ...(summary ? { summary } : {}) });
  }
  return out.sort((a, b) => a.ranAt.localeCompare(b.ranAt) || a.command.localeCompare(b.command));
}

function loadProposalById(workspacePath: string, proposalId: string):
  | { ok: true; proposalDir: string; proposal: IsolatedProposalV1 }
  | ModuleCommandResult {
  const proposalDir = resolveProposalDir(workspacePath);
  if (!proposalDir) {
    return { ok: false, code: "isolated-proposal-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const proposalPath = proposalFilePath(proposalDir, proposalId);
  const loaded = readProposalFile(proposalPath);
  if (loaded.ok !== true) {
    return {
      ok: false,
      code: "isolated-proposal-not-found",
      message: `Isolated proposal '${proposalId}' not found`
    };
  }
  return { ok: true, proposalDir, proposal: loaded.proposal };
}

function ensureTaskIdsExist(taskStore: TaskStore, taskIds: string[]): string[] {
  return taskIds.filter((taskId) => !taskStore.getTask(taskId));
}

export function runCreateIsolatedProposalCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  taskStore: TaskStore
): ModuleCommandResult {
  const proposalDir = resolveProposalDir(ctx.workspacePath);
  if (!proposalDir) {
    return { ok: false, code: "isolated-proposal-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const taskIdArg = readStringArg(args, "taskId");
  const taskIds = readTaskIds(args, taskIdArg);
  if (taskIds.length === 0) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "create-isolated-proposal requires taskId or taskIds[]"
    };
  }
  const missingTaskIds = ensureTaskIdsExist(taskStore, taskIds);
  if (missingTaskIds.length > 0) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Unknown task id(s): ${missingTaskIds.join(", ")}`,
      data: { schemaVersion: 1, missingTaskIds }
    };
  }

  const proposalIdArg = normalizeProposalId(args.proposalId) ?? allocateProposalId();
  if (listProposalFiles(proposalDir).some((filePath) => filePath.endsWith(`${proposalIdArg}.json`))) {
    return {
      ok: false,
      code: "duplicate-proposal-id",
      message: `Proposal '${proposalIdArg}' already exists`
    };
  }
  const fp = gatherCheckoutFingerprint(ctx.workspacePath);
  const baseBranch = readStringArg(args, "baseBranch") ?? fp.branch ?? "HEAD";
  const proposalBranch = readStringArg(args, "proposalBranch") ?? `proposal/${taskIds[0]}-${proposalIdArg.slice(-8)}`;
  const worktreePath = readStringArg(args, "worktreePath") ?? defaultProposalWorktreePath(ctx.workspacePath, proposalIdArg);
  const title = readStringArg(args, "title") ?? `Isolated proposal for ${taskIds.join(", ")}`;
  const createdBy = readStringArg(args, "createdBy") ?? readStringArg(args, "actor");

  const attached = createOrAttachProposalWorktree({
    workspacePath: ctx.workspacePath,
    proposalBranch,
    baseBranch,
    worktreePath
  });
  if (!attached.ok) {
    return {
      ok: false,
      code: "isolated-proposal-worktree-failed",
      message: attached.message
    };
  }

  const now = new Date().toISOString();
  const proposal: IsolatedProposalV1 = {
    schemaVersion: 1,
    proposalId: proposalIdArg,
    status: "active",
    title,
    taskIds,
    baseBranch,
    proposalBranch,
    worktreePath,
    createdBy: createdBy ?? null,
    sourceBranch: fp.branch,
    sourceHeadSha: fp.headSha,
    createdAt: now,
    changedFiles: proposalChangedFiles(ctx.workspacePath, baseBranch, proposalBranch),
    validationEvidence: parseValidationEvidenceRows(args.validationEvidence),
    taskMutationIntentIds: []
  };
  proposal.taskMutationIntentIds = resolveProposalMutationIntentIds(ctx.workspacePath, proposal);
  writeProposalAtomic(proposalDir, proposal);

  return {
    ok: true,
    code: "isolated-proposal-created",
    message: `Created isolated proposal '${proposal.proposalId}'`,
    data: {
      schemaVersion: 1,
      proposal: summarizeProposal(proposal)
    }
  };
}

export function runListIsolatedProposalsCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalDir = resolveProposalDir(ctx.workspacePath);
  if (!proposalDir) {
    return { ok: true, code: "isolated-proposals-listed", message: "No git workspace; no proposals available", data: { schemaVersion: 1, proposals: [], count: 0 } };
  }
  const includeDiscarded = args.includeDiscarded === true;
  const taskIdFilter = readStringArg(args, "taskId");
  const proposals: IsolatedProposalV1[] = [];
  const malformed: Array<{ filePath: string; message: string; proposalId: string | null }> = [];
  for (const filePath of listProposalFiles(proposalDir)) {
    const loaded = readProposalFile(filePath);
    if (!loaded.ok) {
      malformed.push({ filePath, message: loaded.message, proposalId: loaded.proposalId });
      continue;
    }
    if (!includeDiscarded && loaded.proposal.status !== "active") {
      continue;
    }
    if (taskIdFilter && !loaded.proposal.taskIds.includes(taskIdFilter)) {
      continue;
    }
    const refreshed: IsolatedProposalV1 = {
      ...loaded.proposal,
      changedFiles: proposalChangedFiles(ctx.workspacePath, loaded.proposal.baseBranch, loaded.proposal.proposalBranch)
    };
    refreshed.taskMutationIntentIds = resolveProposalMutationIntentIds(ctx.workspacePath, refreshed);
    writeProposalAtomic(proposalDir, refreshed);
    proposals.push(refreshed);
  }
  proposals.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.proposalId.localeCompare(b.proposalId));
  const summaries = proposals.map(summarizeProposal);
  return {
    ok: true,
    code: "isolated-proposals-listed",
    message: `Listed ${summaries.length} isolated proposal(s)`,
    data: {
      schemaVersion: 1,
      count: summaries.length,
      proposals: summaries,
      malformedCount: malformed.length,
      malformed: malformed.slice(0, 20)
    }
  };
}

export function runDiscardIsolatedProposalCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "discard-isolated-proposal requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const proposal = loadedProposal.proposal;
  if (proposal.status === "discarded") {
    return {
      ok: true,
      code: "isolated-proposal-discarded",
      message: `Proposal '${proposalId}' already discarded`,
      data: { schemaVersion: 1, proposal: summarizeProposal(proposal), idempotent: true }
    };
  }
  const removed = removeProposalWorktree(ctx.workspacePath, proposal.worktreePath);
  if (!removed.ok) {
    return {
      ok: false,
      code: "isolated-proposal-discard-failed",
      message: removed.message ?? "Failed to remove proposal worktree"
    };
  }
  const next: IsolatedProposalV1 = {
    ...proposal,
    status: "discarded",
    discardedAt: new Date().toISOString(),
    changedFiles: proposalChangedFiles(ctx.workspacePath, proposal.baseBranch, proposal.proposalBranch)
  };
  next.taskMutationIntentIds = resolveProposalMutationIntentIds(ctx.workspacePath, next);
  writeProposalAtomic(loadedProposal.proposalDir, next);
  return {
    ok: true,
    code: "isolated-proposal-discarded",
    message: `Discarded isolated proposal '${proposalId}'`,
    data: { schemaVersion: 1, proposal: summarizeProposal(next) }
  };
}

export function runRecoverIsolatedProposalCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "recover-isolated-proposal requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const proposal = loadedProposal.proposal;
  const worktreePath = readStringArg(args, "worktreePath") ?? proposal.worktreePath;
  const attached = createOrAttachProposalWorktree({
    workspacePath: ctx.workspacePath,
    proposalBranch: proposal.proposalBranch,
    baseBranch: proposal.baseBranch,
    worktreePath
  });
  if (!attached.ok) {
    return { ok: false, code: "isolated-proposal-recover-failed", message: attached.message };
  }
  const next: IsolatedProposalV1 = {
    ...proposal,
    status: "active",
    worktreePath,
    recoveredAt: new Date().toISOString(),
    changedFiles: proposalChangedFiles(ctx.workspacePath, proposal.baseBranch, proposal.proposalBranch)
  };
  next.taskMutationIntentIds = resolveProposalMutationIntentIds(ctx.workspacePath, next);
  writeProposalAtomic(loadedProposal.proposalDir, next);
  return {
    ok: true,
    code: "isolated-proposal-recovered",
    message: `Recovered isolated proposal '${proposalId}'`,
    data: { schemaVersion: 1, proposal: summarizeProposal(next) }
  };
}

export function runViewIsolatedProposalDiffCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "view-isolated-proposal-diff requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const proposal = loadedProposal.proposal;
  const changedFiles = proposalChangedFiles(ctx.workspacePath, proposal.baseBranch, proposal.proposalBranch);
  const includePatch = args.includePatch === true;
  const patch = includePatch
    ? runGit(ctx.workspacePath, ["diff", `${proposal.baseBranch}...${proposal.proposalBranch}`])
    : { code: 0, stdout: "", stderr: "" };
  if (includePatch && patch.code !== 0) {
    return { ok: false, code: "isolated-proposal-diff-failed", message: patch.stderr || patch.stdout || "git diff failed" };
  }
  const next: IsolatedProposalV1 = {
    ...proposal,
    changedFiles,
    taskMutationIntentIds: resolveProposalMutationIntentIds(ctx.workspacePath, proposal)
  };
  writeProposalAtomic(loadedProposal.proposalDir, next);
  return {
    ok: true,
    code: "isolated-proposal-diff",
    message: `Loaded diff metadata for proposal '${proposalId}'`,
    data: {
      schemaVersion: 1,
      proposal: summarizeProposal(next),
      changedFiles,
      diffRange: `${proposal.baseBranch}...${proposal.proposalBranch}`,
      ...(includePatch ? { patch: patch.stdout } : {})
    }
  };
}

export function runApplyIsolatedProposalCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "apply-isolated-proposal requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const proposal = loadedProposal.proposal;
  const dryRun = args.dryRun !== false;
  const currentBranch = gatherCheckoutFingerprint(ctx.workspacePath).branch ?? "(detached)";
  const changedFiles = proposalChangedFiles(ctx.workspacePath, proposal.baseBranch, proposal.proposalBranch);
  if (dryRun) {
    return {
      ok: true,
      code: "isolated-proposal-apply-dry-run",
      message: `Dry run: proposal '${proposalId}' is ready to merge`,
      data: {
        schemaVersion: 1,
        proposal: summarizeProposal({ ...proposal, changedFiles }),
        targetBranch: currentBranch,
        mergeCommand: `git merge --no-ff ${proposal.proposalBranch}`,
        changedFiles
      }
    };
  }
  const merged = runGit(ctx.workspacePath, ["merge", "--no-ff", proposal.proposalBranch]);
  if (merged.code !== 0) {
    return {
      ok: false,
      code: "isolated-proposal-apply-failed",
      message: merged.stderr || merged.stdout || "git merge failed",
      data: {
        schemaVersion: 1,
        targetBranch: currentBranch,
        proposalBranch: proposal.proposalBranch
      }
    };
  }
  return {
    ok: true,
    code: "isolated-proposal-applied",
    message: `Merged proposal branch '${proposal.proposalBranch}' into '${currentBranch}'`,
    data: {
      schemaVersion: 1,
      proposal: summarizeProposal({ ...proposal, changedFiles }),
      targetBranch: currentBranch
    }
  };
}

export function runOpenIsolatedProposalPrCommand(ctx: ModuleLifecycleContext, args: Record<string, unknown>): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "open-isolated-proposal-pr requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const proposal = loadedProposal.proposal;
  const baseBranch = readStringArg(args, "baseBranch") ?? proposal.baseBranch;
  const title = readStringArg(args, "title") ?? `[${proposal.taskIds.join(", ")}] ${proposal.title}`;
  const body = readStringArg(args, "body") ?? `## Summary\n- Isolated proposal: ${proposal.proposalId}\n`;
  const dryRun = args.dryRun !== false;
  const pushCommand = `git push -u origin ${proposal.proposalBranch}`;
  const prCommand = `gh pr create --base ${baseBranch} --head ${proposal.proposalBranch} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;
  if (dryRun) {
    return {
      ok: true,
      code: "isolated-proposal-open-pr-dry-run",
      message: `Dry run: proposal '${proposalId}' is ready for PR`,
      data: {
        schemaVersion: 1,
        proposal: summarizeProposal(proposal),
        pushCommand,
        prCommand
      }
    };
  }
  const pushed = runGit(ctx.workspacePath, ["push", "-u", "origin", proposal.proposalBranch]);
  if (pushed.code !== 0) {
    return {
      ok: false,
      code: "isolated-proposal-open-pr-push-failed",
      message: pushed.stderr || pushed.stdout || "git push failed",
      data: { schemaVersion: 1, proposal: summarizeProposal(proposal) }
    };
  }
  const created = runGit(ctx.workspacePath, [
    "rev-parse",
    "--verify",
    "HEAD"
  ]);
  if (created.code !== 0) {
    return {
      ok: false,
      code: "isolated-proposal-open-pr-failed",
      message: created.stderr || created.stdout || "git workspace not ready for PR creation",
      data: { schemaVersion: 1, proposal: summarizeProposal(proposal), pushCommand, prCommand }
    };
  }
  const pr = spawnSync(
    "gh",
    ["pr", "create", "--base", baseBranch, "--head", proposal.proposalBranch, "--title", title, "--body", body],
    { cwd: ctx.workspacePath, encoding: "utf8" }
  );
  if (pr.status !== 0) {
    return {
      ok: false,
      code: "isolated-proposal-open-pr-failed",
      message: pr.stderr || pr.stdout || "gh pr create failed",
      data: { schemaVersion: 1, proposal: summarizeProposal(proposal), pushCommand, prCommand }
    };
  }
  return {
    ok: true,
    code: "isolated-proposal-pr-opened",
    message: `Opened PR for proposal '${proposalId}'`,
    data: { schemaVersion: 1, proposal: summarizeProposal(proposal), prUrl: pr.stdout.trim() || null }
  };
}

export function runRecordIsolatedProposalValidationCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const proposalId = normalizeProposalId(args.proposalId);
  if (!proposalId) {
    return { ok: false, code: "invalid-run-args", message: "record-isolated-proposal-validation requires proposalId" };
  }
  const loaded = loadProposalById(ctx.workspacePath, proposalId);
  if (loaded.ok !== true) {
    return loaded;
  }
  const loadedProposal = loaded as { ok: true; proposalDir: string; proposal: IsolatedProposalV1 };
  const command = readStringArg(args, "command");
  const statusRaw = args.status;
  const status =
    statusRaw === "passed" || statusRaw === "failed" || statusRaw === "warn"
      ? statusRaw
      : null;
  const summary = readStringArg(args, "summary");
  if (!command || !status) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "record-isolated-proposal-validation requires command and status(passed|failed|warn)"
    };
  }
  const nextEvidence: IsolatedProposalValidationEvidence = {
    command,
    status,
    ranAt: new Date().toISOString(),
    ...(summary ? { summary } : {})
  };
  const next: IsolatedProposalV1 = {
    ...loadedProposal.proposal,
    validationEvidence: [...loadedProposal.proposal.validationEvidence, nextEvidence].sort(
      (a, b) => a.ranAt.localeCompare(b.ranAt) || a.command.localeCompare(b.command)
    )
  };
  next.taskMutationIntentIds = resolveProposalMutationIntentIds(ctx.workspacePath, next);
  writeProposalAtomic(loadedProposal.proposalDir, next);
  return {
    ok: true,
    code: "isolated-proposal-validation-recorded",
    message: `Recorded validation evidence for proposal '${proposalId}'`,
    data: { schemaVersion: 1, proposal: summarizeProposal(next) }
  };
}

