#!/usr/bin/env node
/**
 * Reference GitHub → workspace-kit runner (Phase 55). Not installed as a global bin;
 * invoke after build: `node tools/github-invocation/run-github-delivery.mjs` from repo root.
 *
 * Maintainer docs: docs/maintainers/runbooks/github-workflow-cannon-invocation.md
 */

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyGithubWebhookSignatureSha256,
  getRepositoryFullName,
  getGithubDeliveryMeta,
  getInvocationCommentBody,
  resolveRouteKind,
  isRepositoryAllowed,
  extractTaskIdsFromText,
  buildAuditRecord
} from "../../dist/core/github-invocation.js";
import { parsePolicyApprovalFromEnv } from "../../dist/core/policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO_ROOT, "dist", "cli.js");

/** @type {Map<string, number>} */
const debounceUntil = new Map();

function parseArgs(argv) {
  const out = { cwd: process.cwd(), dryRun: false, payloadPath: null, rawBodyPath: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--cwd" && argv[i + 1]) out.cwd = path.resolve(argv[++i]);
    else if (a === "--payload" && argv[i + 1]) out.payloadPath = path.resolve(argv[++i]);
    else if (a === "--raw-body" && argv[i + 1]) out.rawBodyPath = path.resolve(argv[++i]);
  }
  return out;
}

async function loadPayload(args) {
  if (args.payloadPath) {
    return JSON.parse(await readFile(args.payloadPath, "utf8"));
  }
  const p = process.env.GITHUB_EVENT_PATH;
  if (p) {
    return JSON.parse(await readFile(p, "utf8"));
  }
  throw new Error("No payload: pass --payload <file> or set GITHUB_EVENT_PATH");
}

async function loadRawBody(args) {
  if (args.rawBodyPath) {
    return await readFile(args.rawBodyPath);
  }
  if (process.env.GITHUB_WEBHOOK_PAYLOAD_RAW_PATH) {
    return await readFile(process.env.GITHUB_WEBHOOK_PAYLOAD_RAW_PATH);
  }
  return null;
}

function headerMap() {
  return {
    "x-github-delivery": process.env.GITHUB_DELIVERY_ID,
    "X-GitHub-Delivery": process.env.GITHUB_DELIVERY_ID,
    "x-github-event": process.env.GITHUB_EVENT_NAME,
    "X-GitHub-Event": process.env.GITHUB_EVENT_NAME,
    "x-hub-signature-256": process.env.GITHUB_WEBHOOK_SIGNATURE
  };
}

function resolveEventName(headers, payload) {
  return (
    process.env.GITHUB_EVENT_NAME ||
    headers["x-github-event"] ||
    headers["X-GitHub-Event"] ||
    (typeof payload.action === "string" ? `synthetic.${payload.action}` : "unknown")
  );
}

function resolveEffectiveGithubInvocation(cwd) {
  const res = spawnSync(process.execPath, [CLI, "run", "resolve-config", "{}"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (res.status !== 0) {
    throw new Error(res.stderr || "resolve-config failed");
  }
  const parsed = JSON.parse(res.stdout.trim());
  const kit = parsed.data?.effective?.kit;
  const gi = kit?.githubInvocation ?? {};
  return {
    enabled: Boolean(gi.enabled),
    allowedRepositories: Array.isArray(gi.allowedRepositories) ? gi.allowedRepositories : [],
    eventPlaybookMap:
      typeof gi.eventPlaybookMap === "object" &&
      gi.eventPlaybookMap !== null &&
      !Array.isArray(gi.eventPlaybookMap)
        ? /** @type {Record<string, string>} */ (gi.eventPlaybookMap)
        : {},
    commentDebounceSeconds: Number.isInteger(gi.commentDebounceSeconds) ? gi.commentDebounceSeconds : 0,
    planOnlyRunCommands: Array.isArray(gi.planOnlyRunCommands)
      ? gi.planOnlyRunCommands
      : ["get-next-actions", "list-tasks", "get-task"],
    sensitiveRunCommands: Array.isArray(gi.sensitiveRunCommands)
      ? gi.sensitiveRunCommands
      : ["run-transition"]
  };
}

function debounceKey(repo, payload) {
  const n =
    payload.issue?.number ?? payload.pull_request?.number ?? payload.number;
  if (n === undefined) return null;
  return `${repo}#${n}`;
}

function emit(record) {
  console.log(JSON.stringify(buildAuditRecord(record)));
}

async function main() {
  const args = parseArgs(process.argv);
  let payload;
  try {
    payload = await loadPayload(args);
  } catch (e) {
    emit({
      githubDeliveryId: "n/a",
      githubEvent: "unknown",
      repositoryFullName: null,
      routeKind: "unresolved",
      decision: "parse-error",
      taskIdsReferenced: [],
      detail: e instanceof Error ? e.message : String(e)
    });
    process.exit(1);
  }

  const headers = headerMap();
  const { deliveryId } = getGithubDeliveryMeta(headers, payload);
  const eventName = resolveEventName(headers, payload);
  const repoFull = getRepositoryFullName(payload);
  const commentText = getInvocationCommentBody(payload, eventName);
  const taskIds = extractTaskIdsFromText(commentText);

  const rawBodyBuf = await loadRawBody(args);
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  const skipSig = process.env.GITHUB_ACTIONS === "true";

  if (!skipSig) {
    if (!rawBodyBuf || !secret) {
      emit({
        githubDeliveryId: deliveryId,
        githubEvent: eventName,
        repositoryFullName: repoFull,
        routeKind: "unresolved",
        decision: "signature-invalid",
        taskIdsReferenced: taskIds,
        detail:
          "Webhook mode requires GITHUB_WEBHOOK_SECRET, raw payload bytes (--raw-body or GITHUB_WEBHOOK_PAYLOAD_RAW_PATH), and GITHUB_WEBHOOK_SIGNATURE (x-hub-signature-256)"
      });
      process.exit(2);
    }
    const sig = headers["x-hub-signature-256"];
    if (!verifyGithubWebhookSignatureSha256(rawBodyBuf, sig, secret)) {
      emit({
        githubDeliveryId: deliveryId,
        githubEvent: eventName,
        repositoryFullName: repoFull,
        routeKind: "unresolved",
        decision: "signature-invalid",
        taskIdsReferenced: taskIds
      });
      process.exit(2);
    }
  }

  let gi;
  try {
    gi = resolveEffectiveGithubInvocation(args.cwd);
  } catch (e) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind: "unresolved",
      decision: "parse-error",
      taskIdsReferenced: taskIds,
      detail: e instanceof Error ? e.message : String(e)
    });
    process.exit(1);
  }

  if (!gi.enabled) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind: "unresolved",
      decision: "disabled",
      taskIdsReferenced: taskIds
    });
    process.exit(0);
  }

  if (!isRepositoryAllowed(repoFull, gi.allowedRepositories)) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind: "unresolved",
      decision: "repo-denied",
      taskIdsReferenced: taskIds
    });
    process.exit(3);
  }

  const routeKind = resolveRouteKind({
    eventName,
    commentBody: commentText,
    eventPlaybookMap: gi.eventPlaybookMap
  });

  if (routeKind === null) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind: "unresolved",
      decision: "parse-error",
      taskIdsReferenced: taskIds,
      detail: "No slash command and no eventPlaybookMap entry for this event"
    });
    process.exit(0);
  }

  if (routeKind === "none") {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind: "none",
      decision: "none-route",
      taskIdsReferenced: taskIds
    });
    process.exit(0);
  }

  const dk = debounceKey(repoFull, payload);
  if (dk && gi.commentDebounceSeconds > 0) {
    const now = Date.now();
    const prev = debounceUntil.get(dk) ?? 0;
    if (now - prev < gi.commentDebounceSeconds * 1000) {
      emit({
        githubDeliveryId: deliveryId,
        githubEvent: eventName,
        repositoryFullName: repoFull,
        routeKind,
        decision: "debounced",
        taskIdsReferenced: taskIds
      });
      process.exit(0);
    }
    debounceUntil.set(dk, now);
  }

  if (routeKind === "plan") {
    const cmd = process.env.WORKSPACE_KIT_GITHUB_PLAN_COMMAND ?? "get-next-actions";
    if (!gi.planOnlyRunCommands.includes(cmd)) {
      emit({
        githubDeliveryId: deliveryId,
        githubEvent: eventName,
        repositoryFullName: repoFull,
        routeKind,
        decision: "policy-denied",
        taskIdsReferenced: taskIds,
        detail: `plan command ${cmd} not in kit.githubInvocation.planOnlyRunCommands`
      });
      process.exit(4);
    }
    const runArgs = process.env.WORKSPACE_KIT_GITHUB_PLAN_ARGS_JSON ?? "{}";
    if (args.dryRun) {
      emit({
        githubDeliveryId: deliveryId,
        githubEvent: eventName,
        repositoryFullName: repoFull,
        routeKind,
        decision: "dry-run",
        taskIdsReferenced: taskIds,
        workspaceKitCommand: `run ${cmd} ${runArgs}`
      });
      process.exit(0);
    }
    const res = spawnSync(process.execPath, [CLI, "run", cmd, runArgs], {
      cwd: args.cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: res.status === 0 ? "invoked" : "parse-error",
      taskIdsReferenced: taskIds,
      workspaceKitCommand: `run ${cmd}`,
      detail: res.status === 0 ? undefined : `exit ${res.status}`
    });
    process.exit(res.status === 0 ? 0 : 5);
  }

  const policy = parsePolicyApprovalFromEnv({
    ...process.env,
    WORKSPACE_KIT_POLICY_APPROVAL: process.env.WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL
  });
  const runArgsJson = process.env.WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON ?? "";
  const sub = process.env.WORKSPACE_KIT_GITHUB_RUN_COMMAND ?? "run-transition";

  if (!policy || !runArgsJson.trim()) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: "policy-denied",
      taskIdsReferenced: taskIds,
      detail:
        "Mutating routes require WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL (JSON) and WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON (full run JSON args)"
    });
    process.exit(0);
  }

  if (!gi.sensitiveRunCommands.includes(sub)) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: "policy-denied",
      taskIdsReferenced: taskIds,
      detail: `Command ${sub} not in kit.githubInvocation.sensitiveRunCommands`
    });
    process.exit(4);
  }

  let parsedArgs;
  try {
    parsedArgs = JSON.parse(runArgsJson);
  } catch {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: "parse-error",
      taskIdsReferenced: taskIds,
      detail: "Invalid WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON"
    });
    process.exit(1);
  }

  if (typeof parsedArgs !== "object" || parsedArgs === null || Array.isArray(parsedArgs)) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: "parse-error",
      taskIdsReferenced: taskIds,
      detail: "WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON must be a JSON object"
    });
    process.exit(1);
  }

  if (!("policyApproval" in parsedArgs)) {
    parsedArgs = { ...parsedArgs, policyApproval: policy };
  }

  const mergedJson = JSON.stringify(parsedArgs);

  if (args.dryRun) {
    emit({
      githubDeliveryId: deliveryId,
      githubEvent: eventName,
      repositoryFullName: repoFull,
      routeKind,
      decision: "dry-run",
      taskIdsReferenced: taskIds,
      workspaceKitCommand: `run ${sub} <args redacted>`
    });
    process.exit(0);
  }

  const res = spawnSync(process.execPath, [CLI, "run", sub, mergedJson], {
    cwd: args.cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  emit({
    githubDeliveryId: deliveryId,
    githubEvent: eventName,
    repositoryFullName: repoFull,
    routeKind,
    decision: res.status === 0 ? "invoked" : "parse-error",
    taskIdsReferenced: taskIds,
    workspaceKitCommand: `run ${sub}`,
    detail: res.status === 0 ? undefined : `exit ${res.status}`
  });
  process.exit(res.status === 0 ? 0 : 5);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
