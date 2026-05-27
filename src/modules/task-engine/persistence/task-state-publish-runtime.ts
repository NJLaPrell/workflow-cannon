import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import { publishTaskStateEvents } from "../task-state-git/publish-task-state-events.js";

function parseEventsArg(raw: unknown): TaskStateEventV1[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  return raw as TaskStateEventV1[];
}

function parseExpectedTaskVersions(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function runTaskStatePublish(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const events = parseEventsArg(args.events);
  const expectedHeadSha =
    typeof args.expectedHeadSha === "string" && args.expectedHeadSha.trim()
      ? args.expectedHeadSha.trim()
      : null;
  const expectedTaskVersions = parseExpectedTaskVersions(args.expectedTaskVersions);
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : undefined;
  const maxAttempts =
    typeof args.maxAttempts === "number" && Number.isInteger(args.maxAttempts)
      ? args.maxAttempts
      : undefined;

  if (!events) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "events must be a non-empty array of TaskStateEventV1 objects"
    };
  }
  if (!expectedHeadSha) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "expectedHeadSha is required (tip observed after fetch)"
    };
  }
  if (!expectedTaskVersions) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "expectedTaskVersions must be an object mapping taskId to version number"
    };
  }

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-publish-dry-run",
      message: `Dry run: would publish ${events.length} event(s) to canonical git branch`,
      data: {
        schemaVersion: 1,
        dryRun: true,
        eventCount: events.length,
        expectedHeadSha,
        expectedTaskVersions,
        branch: branch ?? null
      }
    };
  }

  const result = await publishTaskStateEvents({
    workspacePath: ctx.workspacePath,
    branch,
    events,
    expectedHeadSha,
    expectedTaskVersions,
    maxAttempts,
    push: args.push !== false
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      data: result.data
    };
  }

  return {
    ok: true,
    code: "task-state-published",
    message: `Published ${result.publishedEvents.length} event(s) to ${result.branch}`,
    data: {
      schemaVersion: 1,
      headSha: result.headSha,
      branch: result.branch,
      attempts: result.attempts,
      publishedEvents: result.publishedEvents
    }
  };
}
