/**
 * Deterministic scout rotation: weighted quadrant pick (40/30/20/10) and lens selection.
 */

import type { ScoutRotationEntry } from "./improvement-state.js";

/** Cumulative weights for quadrants 0..3 (primary distribution for scout focus). */
export const SCOUT_ROTATION_WEIGHTS = [40, 30, 20, 10] as const;

/** Lens ids grouped by quadrant index — see playbook `improvement-scout`. */
export const SCOUT_LENS_BUCKETS: readonly (readonly string[])[] = [
  ["determinism", "persistence-integrity"],
  ["operator-friction", "utility-expansion"],
  ["policy-confusion", "config-surprise"],
  ["doc-drift", "module-boundary", "extension-contract", "release-gates"]
] as const;

const TARGET_ZONES = [
  "policy-traces",
  "task-transitions",
  "transcript-archive",
  "config-mutations",
  "parity-scripts",
  "extension-webview",
  "workspace-kit-doctor",
  "planning-generation",
  "lineage-store"
] as const;

const QUESTION_STEMS = [
  "Where does documentation contradict CLI behavior for this path?",
  "What fails closed vs open when an operator skips approval JSON?",
  "Which operationId is missing from AGENT-CLI-MAP for this flow?",
  "What requires maintainer tribal knowledge with no instruction anchor?",
  "Where would parallel writers silently stomp task or improvement state?"
] as const;

/** Deterministic fraction in [0,1) from a seed string (FNV-1a 32-bit). */
export function deterministicUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

export function pickWeightedIndex(weights: readonly number[], u: number): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let t = u * sum;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i]!;
    if (t <= 0) return i;
  }
  return weights.length - 1;
}

/** Quadrant 0..3 from weighted distribution 40/30/20/10. */
export function nextScoutQuadrant(seed: string): 0 | 1 | 2 | 3 {
  const u = deterministicUnit(seed);
  const idx = pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, u);
  return Math.min(3, Math.max(0, idx)) as 0 | 1 | 2 | 3;
}

function hashPick<T>(seed: string, items: readonly T[], historyLen: number): T {
  const u = deterministicUnit(`${seed}:${historyLen}:${items.length}`);
  const i = Math.floor(u * items.length) % items.length;
  return items[i]!;
}

export function pickPrimaryLens(quadrant: 0 | 1 | 2 | 3, seed: string, history: ScoutRotationEntry[]): string {
  const bucket = [...SCOUT_LENS_BUCKETS[quadrant]!];
  const recent = new Set(history.slice(-3).map((h) => h.primaryLens));
  const fresh = bucket.filter((l) => !recent.has(l));
  const pool = fresh.length > 0 ? fresh : bucket;
  return hashPick(seed, pool, history.length);
}

export function pickAdversarialLens(primary: string, seed: string, history: ScoutRotationEntry[]): string {
  const all = SCOUT_LENS_BUCKETS.flat();
  const avoid = new Set([primary, ...history.slice(-2).map((h) => h.adversarialLens).filter(Boolean)]);
  const pool = all.filter((l) => !avoid.has(l));
  const pickFrom = pool.length > 0 ? pool : all.filter((l) => l !== primary);
  return hashPick(`${seed}:adv`, pickFrom, history.length);
}

export function pickTargetZone(seed: string, history: ScoutRotationEntry[]): string {
  const recent = new Set(history.slice(-4).map((h) => h.targetZone));
  const fresh = TARGET_ZONES.filter((z) => !recent.has(z));
  const pool = fresh.length > 0 ? fresh : [...TARGET_ZONES];
  return hashPick(`${seed}:zone`, pool, history.length);
}

export function pickQuestionStem(seed: string, history: ScoutRotationEntry[]): string {
  return hashPick(`${seed}:stem`, QUESTION_STEMS, history.length);
}

export function buildScoutRotationEntry(params: {
  primaryLens: string;
  adversarialLens: string;
  targetZone: string;
  questionStem: string;
  runAt: string;
}): ScoutRotationEntry {
  return {
    primaryLens: params.primaryLens,
    adversarialLens: params.adversarialLens,
    targetZone: params.targetZone,
    questionStem: params.questionStem,
    runAt: params.runAt
  };
}
