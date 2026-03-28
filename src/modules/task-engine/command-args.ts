import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { TaskPriority } from "./types.js";

/**
 * Read a string arg, returning undefined if absent or non-string.
 * Never trims — use readTrimmedString when whitespace cleanup is needed.
 */
export function readStringArg(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const raw = args[key];
  return typeof raw === "string" ? raw : undefined;
}

/** Read a string arg, trim it, and return undefined if empty after trim. */
export function readTrimmedString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const raw = args[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read a string arg with a default when absent.
 * Returns the default if the arg is not a string or (when trimIfPresent) is
 * empty after trim.
 */
export function readStringWithDefault(
  args: Record<string, unknown>,
  key: string,
  defaultValue: string
): string {
  const raw = args[key];
  if (typeof raw !== "string") return defaultValue;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

/** Resolve the actor from args.actor, falling back to ctx.resolvedActor. */
export function resolveActor(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext
): string | undefined {
  if (typeof args.actor === "string") return args.actor;
  return ctx.resolvedActor !== undefined ? ctx.resolvedActor : undefined;
}

/** Read a priority arg, returning undefined if not a valid P1/P2/P3 string. */
export function readPriority(
  args: Record<string, unknown>,
  key: string = "priority"
): TaskPriority | undefined {
  const raw = args[key];
  if (typeof raw === "string" && (raw === "P1" || raw === "P2" || raw === "P3")) {
    return raw as TaskPriority;
  }
  return undefined;
}

/** Read an optional string array, filtering out non-strings. */
export function readStringArray(
  args: Record<string, unknown>,
  key: string
): string[] | undefined {
  const raw = args[key];
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((x): x is string => typeof x === "string");
}

/** Read an optional record-like arg (object, not array, not null). */
export function readRecordArg(
  args: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const raw = args[key];
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

/** Read a numeric arg with a default, clamping to a max. */
export function readBoundedInt(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number,
  max: number
): number {
  const raw = args[key];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), max);
  }
  return defaultValue;
}

/** Read clientMutationId for idempotency. */
export function readIdempotencyValue(
  args: Record<string, unknown>
): string | undefined {
  const raw = args.clientMutationId;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
