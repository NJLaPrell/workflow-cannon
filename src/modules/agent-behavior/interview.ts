import type { BehaviorDimensions, BehaviorProfile } from "./types.js";
import { BEHAVIOR_PROFILE_SCHEMA_VERSION } from "./types.js";

export const INTERVIEW_QUESTIONS: {
  id: string;
  prompt: string;
  options: { value: string; label: string }[];
}[] = [
  {
    id: "changeAppetite",
    prompt: "When suggesting code changes, how aggressive should the agent be?",
    options: [
      { value: "conservative", label: "Conservative — smallest diffs, extra caution" },
      { value: "balanced", label: "Balanced — sensible defaults" },
      { value: "bold", label: "Bold — willing to propose larger refactors when helpful" }
    ]
  },
  {
    id: "deliberationDepth",
    prompt: "How much should the agent think out loud before acting?",
    options: [
      { value: "low", label: "Low — get to the point" },
      { value: "medium", label: "Medium — short reasoning" },
      { value: "high", label: "High — explicit tradeoffs and checks" }
    ]
  },
  {
    id: "explanationVerbosity",
    prompt: "How verbose should explanations be?",
    options: [
      { value: "terse", label: "Terse" },
      { value: "normal", label: "Normal" },
      { value: "verbose", label: "Verbose — more context and structure" }
    ]
  },
  {
    id: "explorationStyle",
    prompt: "When exploring solutions, prefer:",
    options: [
      { value: "linear", label: "Linear — one path at a time" },
      { value: "parallel", label: "Parallel — briefly compare alternatives" }
    ]
  },
  {
    id: "ambiguityHandling",
    prompt: "When requirements are ambiguous:",
    options: [
      { value: "ask", label: "Ask the user before assuming" },
      { value: "decide", label: "Make a reasonable assumption and state it" }
    ]
  },
  {
    id: "checkInFrequency",
    prompt: "How often should the agent pause for your confirmation on non-policy judgment calls?",
    options: [
      { value: "rare", label: "Rarely — only when high impact" },
      { value: "normal", label: "Normal" },
      { value: "often", label: "Often — prefer checkpoints" }
    ]
  }
];

export function dimensionsFromAnswers(answers: Record<string, string>): BehaviorDimensions | null {
  const keys: (keyof BehaviorDimensions)[] = [
    "changeAppetite",
    "deliberationDepth",
    "explanationVerbosity",
    "explorationStyle",
    "ambiguityHandling",
    "checkInFrequency"
  ];
  const out = {} as BehaviorDimensions;
  for (const k of keys) {
    const v = answers[k];
    if (typeof v !== "string" || !v.length) {
      return null;
    }
    (out as Record<string, string>)[k] = v;
  }
  return out as BehaviorDimensions;
}

export function buildDraftProfileFromInterview(
  answers: Record<string, string>,
  customId: string,
  label?: string
): Omit<BehaviorProfile, "metadata"> & { metadata?: Record<string, unknown> } {
  const dimensions = dimensionsFromAnswers(answers);
  if (!dimensions) {
    throw new Error("Incomplete interview answers");
  }
  return {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id: customId,
    label: label?.trim() || "Interview profile",
    summary: "Custom profile produced from interview-behavior-profile.",
    dimensions,
    metadata: { source: "interview", createdAt: new Date().toISOString() }
  };
}
