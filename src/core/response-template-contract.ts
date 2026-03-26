/** Contract version for response template definitions and CLI shaping metadata. */
export const RESPONSE_TEMPLATE_CONTRACT_VERSION = 1 as const;

export type ResponseTemplateEnforcementMode = "advisory" | "strict";

export type ResponseTemplateDefinition = {
  id: string;
  /** Monotonic template definition revision for compatibility notes. */
  version: number;
  scope: "global" | "command";
  description: string;
  /** Logical section keys expected in shaped command `data` (advisory hints only). */
  expectedSections: string[];
};

/** Max length for a single advisory warning line (T265 / T266). */
export const MAX_TEMPLATE_WARNING_LENGTH = 120;

export function truncateTemplateWarning(message: string): string {
  const t = message.trim();
  if (t.length <= MAX_TEMPLATE_WARNING_LENGTH) return t;
  return `${t.slice(0, MAX_TEMPLATE_WARNING_LENGTH - 1)}…`;
}
