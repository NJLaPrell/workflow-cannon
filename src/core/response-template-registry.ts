import type { ResponseTemplateDefinition } from "./response-template-contract.js";

const BUILTIN: Record<string, ResponseTemplateDefinition> = {
  default: {
    id: "default",
    version: 1,
    scope: "global",
    description: "Passthrough with standard ok/code/message/data fields.",
    expectedSections: ["ok", "code", "message", "data"]
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
