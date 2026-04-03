/**
 * Wishlist items live in a separate namespace from Task Engine tasks (`T###`).
 * They are ideation-only until converted into canonical tasks via `convert-wishlist`.
 */

export type WishlistStatus = "open" | "converted" | "cancelled";

/** Recorded when a wishlist item is converted into one or more tasks. */
export type WishlistConversionDecomposition = {
  rationale: string;
  boundaries: string;
  dependencyIntent: string;
};

export type WishlistItem = {
  id: string;
  status: WishlistStatus;
  title: string;
  problemStatement: string;
  expectedOutcome: string;
  impact: string;
  constraints: string;
  successSignals: string;
  requestor: string;
  evidenceRef: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  convertedToTaskIds?: string[];
  conversionDecomposition?: WishlistConversionDecomposition;
};

export type WishlistStoreDocument = {
  schemaVersion: 1;
  items: WishlistItem[];
  lastUpdated: string;
};
