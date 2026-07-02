export type PlanArtifactDisplayState =
  | "new"
  | "needs_revision"
  | "reviewed"
  | "accepted"
  | "finalized"
  | "scheduled"
  | "delivered"
  | "superseded";

export type PlanArtifactStateBucket = {
  key: PlanArtifactDisplayState;
  label: string;
  defaultOpen: boolean;
};

export const PLAN_STATE_BUCKETS: readonly PlanArtifactStateBucket[] = [
  { key: "new", label: "Draft", defaultOpen: true },
  { key: "needs_revision", label: "Needs revision", defaultOpen: false },
  { key: "reviewed", label: "Reviewed", defaultOpen: true },
  { key: "accepted", label: "Accepted", defaultOpen: true },
  { key: "finalized", label: "Finalized", defaultOpen: true },
  { key: "scheduled", label: "Scheduled", defaultOpen: false },
  { key: "delivered", label: "Delivered", defaultOpen: false },
  { key: "superseded", label: "Superseded", defaultOpen: false }
] as const;

function numberOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Workflow status used for plan card actions (review/accept/finalize gates). */
export function planArtifactEffectiveStatus(row: Record<string, unknown>): string {
  const lifecycleStatusRaw = String(row.lifecycleStatus ?? "").trim().toLowerCase();
  if (lifecycleStatusRaw.length > 0) {
    return lifecycleStatusRaw;
  }
  const statusRaw = String(row.status ?? "").trim().toLowerCase();
  if (statusRaw === "reviewed") {
    return numberOrZero(row.blockerCount) > 0 ? "needs_revision" : "approval_ready";
  }
  return statusRaw;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true;
}

/** Display bucket for plan section rollups and status pills. */
export function derivePlanArtifactDisplayState(row: Record<string, unknown>): PlanArtifactDisplayState {
  const effectiveStatus = planArtifactEffectiveStatus(row);
  if (effectiveStatus === "superseded") {
    return "superseded";
  }
  if (isTruthyFlag(row.executed)) {
    return "delivered";
  }
  if (isTruthyFlag(row.tasksGenerated) && !isTruthyFlag(row.executed)) {
    return "scheduled";
  }
  if (effectiveStatus === "finalized") {
    return "finalized";
  }
  if (effectiveStatus === "accepted") {
    return "accepted";
  }
  if (effectiveStatus === "approval_ready") {
    return "reviewed";
  }
  if (effectiveStatus === "needs_revision") {
    return "needs_revision";
  }
  return "new";
}

export function planArtifactDisplayStateMeta(
  state: PlanArtifactDisplayState
): { label: string; className: string } {
  switch (state) {
    case "superseded":
      return { label: "Superseded", className: "wc-plan-status-muted" };
    case "delivered":
      return { label: "Delivered", className: "wc-plan-status-done" };
    case "scheduled":
      return { label: "Scheduled", className: "wc-plan-status-info" };
    case "finalized":
      return { label: "Finalized", className: "wc-plan-status-done" };
    case "accepted":
      return { label: "Accepted", className: "wc-plan-status-accent" };
    case "reviewed":
      return { label: "Reviewed", className: "wc-plan-status-info" };
    case "needs_revision":
      return { label: "Needs revision", className: "wc-plan-status-warn" };
    case "new":
    default:
      return { label: "Draft", className: "wc-plan-status-draft" };
  }
}

export function planArtifactTitleKey(row: Record<string, unknown>): string {
  const title = String(row.title ?? "").trim();
  return title.length > 0 ? title.toLowerCase() : "untitled plan";
}

export function planArtifactTitleLabel(row: Record<string, unknown>): string {
  const title = String(row.title ?? "").trim();
  return title.length > 0 ? title : "Untitled Plan";
}

/** Stable ASCII slug for UI state keys (`plan-title-{state}-{slug}`). */
export function planTitleSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

export type PlanTitleGroup = {
  titleKey: string;
  titleLabel: string;
  rows: Record<string, unknown>[];
};

export function groupPlanRowsByTitle(rows: readonly Record<string, unknown>[]): PlanTitleGroup[] {
  const byKey = new Map<string, PlanTitleGroup>();
  for (const row of rows) {
    const titleKey = planArtifactTitleKey(row);
    const existing = byKey.get(titleKey);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    byKey.set(titleKey, {
      titleKey,
      titleLabel: planArtifactTitleLabel(row),
      rows: [row]
    });
  }
  const groups = [...byKey.values()];
  groups.sort((a, b) => a.titleLabel.localeCompare(b.titleLabel));
  for (const group of groups) {
    group.rows.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  }
  return groups;
}

export function bucketPlanRowsByDisplayState(
  rows: readonly Record<string, unknown>[]
): Map<PlanArtifactDisplayState, Record<string, unknown>[]> {
  const buckets = new Map<PlanArtifactDisplayState, Record<string, unknown>[]>();
  for (const bucket of PLAN_STATE_BUCKETS) {
    buckets.set(bucket.key, []);
  }
  for (const row of rows) {
    const state = derivePlanArtifactDisplayState(row);
    buckets.get(state)?.push(row);
  }
  return buckets;
}
