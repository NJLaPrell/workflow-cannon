import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  PlanningStateEventKindV1,
  PlanningStateEventV1
} from "../task-state-events/planning-event-payloads.js";
import { isGitTaskStateCanonicalAuthority } from "./task-state-canonical-authority.js";

/** Planning domains that publish/apply on git-event-log (Phase 119 + 120). */
export const ALL_PLANNING_SYNC_DOMAINS = [
  "phase_catalog",
  "workspace_status",
  "phase_notes",
  "phase_note_suggestions",
  "ideas",
  "module_state"
] as const;

export type PlanningSyncDomainId = (typeof ALL_PLANNING_SYNC_DOMAINS)[number];

const DOMAIN_SET = new Set<string>(ALL_PLANNING_SYNC_DOMAINS);

/** `phase_journal` expands to notes + suggestions (operator alias). */
const PHASE_JOURNAL_ALIASES = new Set(["phase_journal", "phaseJournal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeDomainEntry(raw: unknown): PlanningSyncDomainId[] {
  if (typeof raw !== "string") {
    return [];
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  if (PHASE_JOURNAL_ALIASES.has(trimmed)) {
    return ["phase_notes", "phase_note_suggestions"];
  }
  if (DOMAIN_SET.has(trimmed)) {
    return [trimmed as PlanningSyncDomainId];
  }
  throw new Error(
    `planning.canonicalSync.domains: unknown domain id '${trimmed}' (allowed: ${ALL_PLANNING_SYNC_DOMAINS.join(", ")}, phase_journal)`
  );
}

/** Raw config array from effective config (undefined when omitted). */
export function readPlanningSyncDomainsConfig(
  config?: Record<string, unknown> | null
): PlanningSyncDomainId[] | undefined {
  const planning = config?.planning;
  if (!isRecord(planning)) {
    return undefined;
  }
  const canonicalSync = planning.canonicalSync;
  if (!isRecord(canonicalSync)) {
    return undefined;
  }
  const domains = canonicalSync.domains;
  if (domains === undefined) {
    return undefined;
  }
  if (!Array.isArray(domains)) {
    throw new Error("planning.canonicalSync.domains must be an array of domain id strings");
  }
  const out = new Set<PlanningSyncDomainId>();
  for (const entry of domains) {
    for (const id of normalizeDomainEntry(entry)) {
      out.add(id);
    }
  }
  return [...out].sort();
}

export function resolveEnabledPlanningSyncDomains(
  ctx: Pick<ModuleLifecycleContext, "effectiveConfig">
): PlanningSyncDomainId[] {
  const configured = readPlanningSyncDomainsConfig(ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (configured !== undefined) {
    return configured;
  }
  return [...ALL_PLANNING_SYNC_DOMAINS];
}

export function isPlanningSyncDomainEnabled(
  ctx: Pick<ModuleLifecycleContext, "effectiveConfig">,
  domainId: PlanningSyncDomainId | string
): boolean {
  if (!isGitTaskStateCanonicalAuthority(ctx as ModuleLifecycleContext)) {
    return false;
  }
  const enabled = new Set<string>(resolveEnabledPlanningSyncDomains(ctx));
  if (PHASE_JOURNAL_ALIASES.has(domainId)) {
    return enabled.has("phase_notes") && enabled.has("phase_note_suggestions");
  }
  return enabled.has(domainId);
}

export function planningEventKindToSyncDomain(kind: PlanningStateEventKindV1): PlanningSyncDomainId {
  if (kind.startsWith("planning.phase_catalog.")) {
    return "phase_catalog";
  }
  if (kind === "planning.workspace_status.updated") {
    return "workspace_status";
  }
  if (kind.startsWith("planning.phase_note.")) {
    return "phase_notes";
  }
  if (kind.startsWith("planning.phase_note_suggestion.")) {
    return "phase_note_suggestions";
  }
  if (kind.startsWith("planning.idea.")) {
    return "ideas";
  }
  if (kind === "planning.module_state.updated") {
    return "module_state";
  }
  throw new Error(`planning-canonical-sync-domains: unmapped planning event kind ${kind}`);
}

export function isPlanningEventSyncEnabled(
  ctx: Pick<ModuleLifecycleContext, "effectiveConfig">,
  event: Pick<PlanningStateEventV1, "kind">
): boolean {
  if (!isGitTaskStateCanonicalAuthority(ctx as ModuleLifecycleContext)) {
    return false;
  }
  const domain = planningEventKindToSyncDomain(event.kind);
  return isPlanningSyncDomainEnabled(ctx, domain);
}

export function filterPlanningEventsByEnabledDomains(
  ctx: Pick<ModuleLifecycleContext, "effectiveConfig">,
  events: PlanningStateEventV1[]
): PlanningStateEventV1[] {
  if (!isGitTaskStateCanonicalAuthority(ctx as ModuleLifecycleContext)) {
    return events;
  }
  return events.filter((event) => isPlanningEventSyncEnabled(ctx, event));
}

/** True when git-event-log authority and at least one planning domain publishes for this command. */
export function isPlanningGitSyncPublishActive(
  ctx: ModuleLifecycleContext,
  domainId: PlanningSyncDomainId
): boolean {
  return isGitTaskStateCanonicalAuthority(ctx) && isPlanningSyncDomainEnabled(ctx, domainId);
}

export function isAnyPlanningEventGitSyncPublishActive(
  ctx: ModuleLifecycleContext,
  events: PlanningStateEventV1[]
): boolean {
  if (!isGitTaskStateCanonicalAuthority(ctx)) {
    return false;
  }
  return events.some((event) => isPlanningEventSyncEnabled(ctx, event));
}

export function enabledPlanningSyncDomainSet(
  ctx: Pick<ModuleLifecycleContext, "effectiveConfig">
): ReadonlySet<PlanningSyncDomainId> {
  return new Set(resolveEnabledPlanningSyncDomains(ctx));
}
