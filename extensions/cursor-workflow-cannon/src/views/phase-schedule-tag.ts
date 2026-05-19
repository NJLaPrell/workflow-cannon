/**
 * Workspace phase schedule tags: Delivered, Current, Next, Future — shared by roster, queue buckets, status tab.
 */

import {
  parseLeadingDigitsOrdinal,
  parseLeadingPhaseOrdinalFromKey
} from "./phase-roster-display.js";

export type PhaseScheduleTagKind = "delivered" | "current" | "next" | "future";

export type PhaseScheduleFocus = {
  currentKitPhase?: string | null;
  nextKitPhase?: string | null;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function phaseScheduleTagLabel(kind: PhaseScheduleTagKind): string {
  switch (kind) {
    case "delivered":
      return "Delivered";
    case "current":
      return "Current";
    case "next":
      return "Next";
    case "future":
      return "Future";
    default:
      return "";
  }
}

export function phaseScheduleTagClassName(kind: PhaseScheduleTagKind): string {
  return "wc-phase-tag wc-phase-tag-" + kind;
}

/** Classify a phase key relative to workspace current / next pointers. */
export function resolvePhaseScheduleTag(
  phaseKey: string | null | undefined,
  focus: PhaseScheduleFocus
): PhaseScheduleTagKind | null {
  if (phaseKey === null || phaseKey === undefined) {
    return null;
  }
  const key = String(phaseKey).trim();
  if (key.length === 0) {
    return null;
  }
  const curKey =
    typeof focus.currentKitPhase === "string" ? focus.currentKitPhase.trim() : "";
  const nxtKey = typeof focus.nextKitPhase === "string" ? focus.nextKitPhase.trim() : "";
  if (curKey.length > 0 && key === curKey) {
    return "current";
  }
  if (nxtKey.length > 0 && key === nxtKey) {
    return "next";
  }
  const tn = parseLeadingPhaseOrdinalFromKey(key);
  const curOrd = parseLeadingDigitsOrdinal(focus.currentKitPhase);
  const nxtOrd = parseLeadingDigitsOrdinal(focus.nextKitPhase);
  if (tn !== null && curOrd !== null && tn < curOrd) {
    return "delivered";
  }
  if (tn !== null && nxtOrd !== null && tn > nxtOrd) {
    return "future";
  }
  if (tn !== null && curOrd !== null && tn > curOrd) {
    return "future";
  }
  return "future";
}

export function renderPhaseScheduleTagHtml(kind: PhaseScheduleTagKind): string {
  return (
    '<span class="' +
    phaseScheduleTagClassName(kind) +
    '">' +
    escapeHtml(phaseScheduleTagLabel(kind)) +
    "</span>"
  );
}

export function renderPhaseBucketSummaryLabelHtml(args: {
  phaseKey: string | null;
  count: number;
  focus: PhaseScheduleFocus;
  /** Optional read-only deliverables text (queue phase bucket summaries). */
  deliverablesSuffixHtml?: string;
}): string {
  const count = typeof args.count === "number" && args.count >= 0 ? args.count : 0;
  const deliverables = args.deliverablesSuffixHtml ?? "";
  if (args.phaseKey === null || String(args.phaseKey).trim() === "") {
    return (
      '<span class="phase-bucket-summary-label">' +
      '<span class="phase-bucket-summary-phase">Not Phased</span> ' +
      '<span class="phase-bucket-summary-count muted">(' +
      String(count) +
      ")</span>" +
      deliverables +
      "</span>"
    );
  }
  const key = String(args.phaseKey).trim();
  const tag = resolvePhaseScheduleTag(key, args.focus);
  const tagHtml = tag ? renderPhaseScheduleTagHtml(tag) + " " : "";
  return (
    '<span class="phase-bucket-summary-label">' +
    '<span class="phase-bucket-summary-phase">Phase <code>' +
    escapeHtml(key) +
    "</code></span> " +
    tagHtml +
    '<span class="phase-bucket-summary-count muted">(' +
    String(count) +
    ")</span>" +
    deliverables +
    "</span>"
  );
}
