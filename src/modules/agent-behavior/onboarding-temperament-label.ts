import { BUILTIN_PROFILES } from "./builtins.js";
import type { BehaviorDimensions, BehaviorProfile } from "./types.js";

/** Order used for builtin id checks and tie-breaking when matching dimensions. */
const BUILTIN_ORDER = ["builtin:cautious", "builtin:balanced", "builtin:calculated", "builtin:experimental"] as const;

/**
 * Player-facing temperament names from `workspace-kit-chat-onboarding` (numbered list),
 * not the short builtin `label` (Cautious, Balanced, …) or ad-hoc custom profile titles.
 */
const ONBOARDING_TEMPERAMENT_BY_BUILTIN: Record<(typeof BUILTIN_ORDER)[number], string> = {
  "builtin:cautious": "The Wary Scout",
  "builtin:balanced": "The Steady Adventurer",
  "builtin:calculated": "The Battle Tactician",
  "builtin:experimental": "The Bold Experimenter"
};

function behaviorDimensionHamming(a: BehaviorDimensions, b: BehaviorDimensions): number {
  const keys: (keyof BehaviorDimensions)[] = [
    "deliberationDepth",
    "changeAppetite",
    "checkInFrequency",
    "explanationVerbosity",
    "explorationStyle",
    "ambiguityHandling"
  ];
  let n = 0;
  for (const k of keys) {
    if (a[k] !== b[k]) {
      n++;
    }
  }
  return n;
}

/**
 * Label for dashboard / maintainer UI: always one of the four onboarding temperaments,
 * even when the active profile is custom or has a chatty `label` (e.g. interview artifact).
 */
export function dashboardOnboardingTemperamentLabel(effective: BehaviorProfile): string {
  const direct = ONBOARDING_TEMPERAMENT_BY_BUILTIN[effective.id as (typeof BUILTIN_ORDER)[number]];
  if (direct) {
    return direct;
  }
  let bestIndex = 0;
  let bestDist = 99;
  for (let i = 0; i < BUILTIN_ORDER.length; i++) {
    const id = BUILTIN_ORDER[i]!;
    const b = BUILTIN_PROFILES[id];
    if (!b) {
      continue;
    }
    const d = behaviorDimensionHamming(effective.dimensions, b.dimensions);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return ONBOARDING_TEMPERAMENT_BY_BUILTIN[BUILTIN_ORDER[bestIndex]!]!;
}
