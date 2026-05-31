import type { DashboardSectionId } from "./dashboard-section-registry.js";
import { lookupDashboardSection } from "./dashboard-section-registry.js";

/**
 * Mutation → section invalidation map (T100399).
 * Visible tab sections patch via `wcSectionPatch`; hidden hydrated sections mark `stale` until re-activated.
 */

/** Coarse mutation buckets → dashboard sections that may need patch or stale marking (T100399). */
export type DashboardMutationKind =
  | "task-queue"
  | "ideas"
  | "overview"
  | "phase-journal"
  | "status"
  | "config"
  | "cae"
  | "workspace-wide";

const MUTATION_SECTIONS: Readonly<Record<DashboardMutationKind, readonly DashboardSectionId[]>> = {
  "task-queue": ["queue", "overview", "planning-interview"],
  ideas: ["ideas"],
  overview: ["overview", "phase-roster", "plan-artifact"],
  "phase-journal": ["phase-journal", "queue"],
  status: ["status"],
  config: ["config"],
  cae: ["cae"],
  "workspace-wide": [
    "overview",
    "phase-roster",
    "ideas",
    "plan-artifact",
    "planning-interview",
    "queue",
    "phase-journal",
    "status",
    "config",
    "cae"
  ]
};

export function dashboardSectionsForMutation(kind: DashboardMutationKind): readonly DashboardSectionId[] {
  return MUTATION_SECTIONS[kind] ?? MUTATION_SECTIONS["workspace-wide"];
}

export function dashboardTabIdForSection(sectionId: DashboardSectionId): string {
  return lookupDashboardSection(sectionId)?.tabId ?? "overview";
}

/** Extract inner HTML of a `data-wc-section` wrapper from a full dashboard root render. */
export function extractDashboardSectionInnerHtml(
  rootHtml: string,
  sectionId: DashboardSectionId
): string | null {
  const needle = `data-wc-section="${sectionId}"`;
  const idx = rootHtml.indexOf(needle);
  if (idx < 0) {
    return null;
  }
  const gt = rootHtml.indexOf(">", idx);
  if (gt < 0) {
    return null;
  }
  let depth = 1;
  let i = gt + 1;
  while (i < rootHtml.length && depth > 0) {
    const nextOpen = rootHtml.indexOf("<div", i);
    const nextClose = rootHtml.indexOf("</div>", i);
    if (nextClose < 0) {
      break;
    }
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return rootHtml.slice(gt + 1, nextClose);
    }
    i = nextClose + 6;
  }
  return null;
}
