import type { ResponseTemplateDefinition } from "./response-template-contract.js";

const BUILTIN: Record<string, ResponseTemplateDefinition> = {
  default: {
    id: "default",
    version: 1,
    scope: "global",
    description: "Passthrough with standard ok/code/message/data fields.",
    /** `cae` is optional — when `data.cae` exists (shadow preflight), `matchedSections` includes it (T885). */
    expectedSections: ["ok", "code", "message", "data", "cae"]
  },
  compact: {
    id: "compact",
    version: 1,
    scope: "global",
    description: "Emphasizes top-level code and message for quick scanning.",
    expectedSections: ["ok", "code", "message"]
  },
  completed_task: {
    id: "completed_task",
    version: 1,
    scope: "command",
    description: "Structured completion-style surface for task-style commands.",
    expectedSections: ["ok", "code", "message", "data"]
  },
  COMPLETED_TASK: {
    id: "COMPLETED_TASK",
    version: 1,
    scope: "command",
    description: "Alias id matching plain-English directive spelling.",
    expectedSections: ["ok", "code", "message", "data"]
  },
  /**
   * Applied contextually after phase-ship steps (task complete, phase snapshot write, roadmap/taxonomy regen).
   * `matchedSections` lists which of these keys exist on `data` for quick scanning.
   */
  phase_ship: {
    id: "phase_ship",
    version: 1,
    scope: "command",
    description:
      "Phase closeout / release handoff: emphasizes transition evidence, planning generation, and maintainer snapshot fields when present.",
    expectedSections: [
      "evidence",
      "planningGeneration",
      "planningGenerationPolicy",
      "autoUnblocked",
      "snapshotBefore",
      "snapshotAfter",
      "fileRelativePath",
      "dryRun",
      "presentation",
      "filesWritten",
      "filesRead"
    ]
  }
};

export function getResponseTemplateDefinition(id: string | undefined): ResponseTemplateDefinition | undefined {
  if (!id || typeof id !== "string") return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return BUILTIN[trimmed] ?? BUILTIN[trimmed.toLowerCase()] ?? undefined;
}

export function listBuiltinResponseTemplateIds(): string[] {
  return Object.keys(BUILTIN).sort((a, b) => a.localeCompare(b));
}

export function allBuiltinDefinitions(): ResponseTemplateDefinition[] {
  return Object.values(BUILTIN);
}
