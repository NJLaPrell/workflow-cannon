import type { PlanArtifactUserStory } from "../../core/planning/plan-artifact-v1.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "./idea-plan-planning-init.js";
import type { BrainstormSession, BrainstormSessionIdeation, IdeaPlanBrainstormSection } from "./idea-plan-types.js";

type CollectedIdeation = {
  featureIdeas: Array<{ text: string; rationale?: string }>;
  perspectives: string[];
  expectations: string[];
  openThreads: string[];
  decisions: Array<{ text: string; rationale?: string }>;
  contextProblem?: string;
  contextAudience?: string;
  unknownsNotes?: string;
  alternativesConsidered?: string;
  sessionNotes: string[];
};

function pushUnique(target: string[], value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed || target.includes(trimmed)) {
    return;
  }
  target.push(trimmed);
}

function mergeIdeation(target: CollectedIdeation, ideation: BrainstormSessionIdeation | undefined): void {
  if (!ideation) {
    return;
  }
  for (const item of ideation.featureIdeas ?? []) {
    if (!target.featureIdeas.some((existing) => existing.text === item.text)) {
      target.featureIdeas.push(item);
    }
  }
  for (const item of ideation.perspectives ?? []) {
    pushUnique(target.perspectives, item.text);
  }
  for (const item of ideation.expectations ?? []) {
    pushUnique(target.expectations, item.text);
  }
  for (const item of ideation.openThreads ?? []) {
    pushUnique(target.openThreads, item.text);
  }
  for (const item of ideation.decisions ?? []) {
    if (!target.decisions.some((existing) => existing.text === item.text)) {
      target.decisions.push(item);
    }
  }
}

function collectSessionContext(session: BrainstormSession, target: CollectedIdeation): void {
  const inputs = session.inputs;
  if (!inputs) {
    return;
  }
  target.contextProblem ??= inputs.contextProblem?.trim();
  target.contextAudience ??= inputs.contextAudience?.trim();
  pushUnique(target.sessionNotes, inputs.sessionNotes);
  if (inputs.unknownsNotes?.trim()) {
    target.unknownsNotes = [target.unknownsNotes, inputs.unknownsNotes.trim()].filter(Boolean).join("\n");
  }
  if (inputs.alternativesConsidered?.trim()) {
    target.alternativesConsidered = [target.alternativesConsidered, inputs.alternativesConsidered.trim()]
      .filter(Boolean)
      .join("\n");
  }
}

export function collectBrainstormIdeation(section: IdeaPlanBrainstormSection | undefined): CollectedIdeation {
  const collected: CollectedIdeation = {
    featureIdeas: [],
    perspectives: [],
    expectations: [],
    openThreads: [],
    decisions: [],
    sessionNotes: []
  };
  for (const session of section?.sessions ?? []) {
    mergeIdeation(collected, session.ideation);
    collectSessionContext(session, collected);
    pushUnique(collected.sessionNotes, session.notes);
  }
  return collected;
}

function bulletSection(title: string, items: string[]): string | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return `## ${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function buildBrainstormDigest(section: IdeaPlanBrainstormSection | undefined): string | undefined {
  const collected = collectBrainstormIdeation(section);
  const parts = [
    collected.contextProblem ? `## Problem\n${collected.contextProblem}` : undefined,
    collected.contextAudience ? `## Audience\n${collected.contextAudience}` : undefined,
    bulletSection(
      "Feature ideas",
      collected.featureIdeas.map((item) => (item.rationale ? `${item.text} — ${item.rationale}` : item.text))
    ),
    bulletSection("Perspectives", collected.perspectives),
    bulletSection("Expectations", collected.expectations),
    bulletSection("Open threads", collected.openThreads),
    bulletSection(
      "Decisions",
      collected.decisions.map((item) => (item.rationale ? `${item.text} — ${item.rationale}` : item.text))
    ),
    collected.unknownsNotes ? `## Unknowns\n${collected.unknownsNotes}` : undefined,
    collected.alternativesConsidered ? `## Alternatives considered\n${collected.alternativesConsidered}` : undefined,
    bulletSection("Session notes", collected.sessionNotes)
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}

function featureIdeasToUserStories(featureIdeas: CollectedIdeation["featureIdeas"]): PlanArtifactUserStory[] {
  return featureIdeas.map((item, index) => ({
    id: `US-${index + 1}`,
    asA: "operator",
    iWant: item.text,
    soThat: item.rationale ?? "the idea delivers operator value",
    priority: "should" as const
  }));
}

export type BrainstormPlanSeed = {
  planSummary: string;
  planningPayload: Partial<IdeaPlanDocumentWithPlanningPayload>;
};

export function buildPlanSeedFromBrainstorm(input: {
  title: string;
  brainstorm: IdeaPlanBrainstormSection | undefined;
  fallbackSummary?: string;
}): BrainstormPlanSeed {
  const collected = collectBrainstormIdeation(input.brainstorm);
  const digest = buildBrainstormDigest(input.brainstorm);
  const intro = digest
    ? `${input.title}\n\n${digest}`
    : input.fallbackSummary ?? "Author structured plan sections from brainstorm synthesis.";

  const openQuestions = [
    ...collected.openThreads,
    ...(collected.unknownsNotes ? [collected.unknownsNotes] : [])
  ].filter((value, index, array) => array.indexOf(value) === index);

  const goals = collected.featureIdeas.map((item) => item.text);
  const assumptions = [
    ...collected.perspectives,
    ...collected.decisions.map((item) => (item.rationale ? `${item.text} (${item.rationale})` : item.text))
  ];

  const planningPayload: Partial<IdeaPlanDocumentWithPlanningPayload> = {};
  if (goals.length > 0) {
    planningPayload.goals = goals;
  }
  const userStories = featureIdeasToUserStories(collected.featureIdeas);
  if (userStories.length > 0) {
    planningPayload.userStories = userStories;
  }
  if (assumptions.length > 0) {
    planningPayload.assumptions = assumptions;
  }
  if (openQuestions.length > 0) {
    planningPayload.openQuestions = openQuestions;
  }
  if (collected.expectations.length > 0) {
    planningPayload.valueAssessment = {
      impact: collected.expectations.join("; "),
      confidence: "medium"
    };
  }

  return {
    planSummary: intro,
    planningPayload
  };
}
