import type { BehaviorDimensions, BehaviorProfile } from "./types.js";

function dimLine(label: string, v: string): string {
  return `- **${label}:** ${v}`;
}

const LABELS: Record<keyof BehaviorDimensions, string> = {
  changeAppetite: "Change appetite",
  deliberationDepth: "Deliberation depth",
  explanationVerbosity: "Explanation verbosity",
  explorationStyle: "Exploration style",
  ambiguityHandling: "Ambiguity handling",
  checkInFrequency: "Check-in frequency"
};

export function summarizeProfileMarkdown(profile: BehaviorProfile): string {
  const lines = [
    `## ${profile.label} (\`${profile.id}\`)`,
    "",
    profile.summary,
    "",
    "### Dimensions",
    dimLine(LABELS.changeAppetite, profile.dimensions.changeAppetite),
    dimLine(LABELS.deliberationDepth, profile.dimensions.deliberationDepth),
    dimLine(LABELS.explanationVerbosity, profile.dimensions.explanationVerbosity),
    dimLine(LABELS.explorationStyle, profile.dimensions.explorationStyle),
    dimLine(LABELS.ambiguityHandling, profile.dimensions.ambiguityHandling),
    dimLine(LABELS.checkInFrequency, profile.dimensions.checkInFrequency)
  ];
  if (profile.interactionNotes) {
    lines.push("", "### Interaction notes", "", profile.interactionNotes);
  }
  return lines.join("\n");
}

export function diffProfiles(a: BehaviorProfile, b: BehaviorProfile): Record<string, { from: string; to: string }> {
  const diff: Record<string, { from: string; to: string }> = {};
  const keys = Object.keys(a.dimensions) as (keyof BehaviorDimensions)[];
  for (const k of keys) {
    if (a.dimensions[k] !== b.dimensions[k]) {
      diff[k] = { from: a.dimensions[k], to: b.dimensions[k] };
    }
  }
  if (a.label !== b.label) {
    diff.label = { from: a.label, to: b.label };
  }
  if (a.summary !== b.summary) {
    diff.summary = { from: a.summary, to: b.summary };
  }
  return diff;
}
