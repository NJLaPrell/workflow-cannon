import type { WishlistItem, WishlistStatus } from "./wishlist-types.js";

/** Wishlist identifiers use a dedicated namespace: `W` + digits (e.g. `W1`, `W42`). */
export const WISHLIST_ID_RE = /^W\d+$/;

const REQUIRED_STRING_FIELDS: (keyof Pick<
  WishlistItem,
  | "title"
  | "problemStatement"
  | "expectedOutcome"
  | "impact"
  | "constraints"
  | "successSignals"
  | "requestor"
  | "evidenceRef"
>)[] = [
  "title",
  "problemStatement",
  "expectedOutcome",
  "impact",
  "constraints",
  "successSignals",
  "requestor",
  "evidenceRef"
];

export type WishlistValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function nonEmptyString(v: unknown, label: string): string | null {
  if (typeof v !== "string" || v.trim().length === 0) {
    return null;
  }
  return v.trim();
}

/**
 * Validates intake fields for creating or replacing content on an open wishlist item.
 * Wishlist items never carry a Task Engine `phase`; reject if present.
 */
export function validateWishlistIntakePayload(args: Record<string, unknown>): WishlistValidationResult {
  const errors: string[] = [];

  if ("phase" in args && args.phase !== undefined) {
    errors.push("Wishlist items must not include 'phase'; only canonical tasks are phased.");
  }

  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    errors.push("Wishlist 'id' is required.");
  } else if (!WISHLIST_ID_RE.test(id)) {
    errors.push(`Wishlist 'id' must match ${WISHLIST_ID_RE.source} (e.g. W1).`);
  }

  for (const key of REQUIRED_STRING_FIELDS) {
    const s = nonEmptyString(args[key], key);
    if (s === null) {
      errors.push(`Wishlist '${key}' is required and must be a non-empty string.`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

export function buildWishlistItemFromIntake(
  args: Record<string, unknown>,
  timestamp: string
): Omit<WishlistItem, "convertedAt" | "convertedToTaskIds" | "conversionDecomposition"> {
  const id = (args.id as string).trim();
  const item: Omit<WishlistItem, "convertedAt" | "convertedToTaskIds" | "conversionDecomposition"> = {
    id,
    status: "open" as WishlistStatus,
    title: (args.title as string).trim(),
    problemStatement: (args.problemStatement as string).trim(),
    expectedOutcome: (args.expectedOutcome as string).trim(),
    impact: (args.impact as string).trim(),
    constraints: (args.constraints as string).trim(),
    successSignals: (args.successSignals as string).trim(),
    requestor: (args.requestor as string).trim(),
    evidenceRef: (args.evidenceRef as string).trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return item;
}

export function validateWishlistUpdatePayload(updates: Record<string, unknown>): WishlistValidationResult {
  if ("phase" in updates && updates.phase !== undefined) {
    return { ok: false, errors: ["Wishlist updates cannot set 'phase'."] };
  }
  const errors: string[] = [];
  const allowed = new Set([
    "title",
    "problemStatement",
    "expectedOutcome",
    "impact",
    "constraints",
    "successSignals",
    "requestor",
    "evidenceRef"
  ]);
  for (const key of Object.keys(updates)) {
    if (!allowed.has(key)) {
      errors.push(`Cannot update unknown or immutable wishlist field '${key}'.`);
    }
  }
  for (const key of REQUIRED_STRING_FIELDS) {
    if (key in updates) {
      const s = nonEmptyString(updates[key], key);
      if (s === null) {
        errors.push(`Wishlist '${key}' must be a non-empty string when provided.`);
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
