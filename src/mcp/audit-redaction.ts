/** Bounded audit metadata limits — keep logs useful without leaking payloads. */
export const MAX_AUDIT_METADATA_STRING_LENGTH = 160;
export const MAX_AUDIT_METADATA_ARRAY_LENGTH = 8;
export const MAX_AUDIT_METADATA_OBJECT_KEYS = 12;
export const MAX_AUDIT_METADATA_DEPTH = 4;

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|credential|authorization|api[-_]?key|policyApproval|bearer/i;
const PROMPT_BODY_KEY_PATTERN =
  /^(prompt|messages|systemPrompt|userPrompt|assistantPrompt|chatHistory|conversation|instruction|instructions)$/i;
const FILE_CONTENT_KEY_PATTERN =
  /^(text|contents|fileContent|sourceContent|rawContent|markdown|html|body|content|source|file|data)$/i;

export type AuditRedactionKind =
  | "secret-key"
  | "secret-shaped"
  | "prompt-body"
  | "file-content"
  | "depth-limit"
  | "truncated-string"
  | "truncated-array"
  | "truncated-keys";

export interface AuditRedactionSummary {
  redacted: boolean;
  kinds: AuditRedactionKind[];
}

/**
 * Redact audit metadata before persistence or debug emission.
 * Secrets, prompt bodies, and file-like payloads are omitted by default.
 */
export function redactAuditMetadata(
  value: unknown,
  depth = 0,
  summary: AuditRedactionSummary = { redacted: false, kinds: [] }
): unknown {
  if (depth > MAX_AUDIT_METADATA_DEPTH) {
    noteRedaction(summary, "depth-limit");
    return "[redacted:depth-limit]";
  }

  if (Array.isArray(value)) {
    const entries = value
      .slice(0, MAX_AUDIT_METADATA_ARRAY_LENGTH)
      .map((entry) => redactAuditMetadata(entry, depth + 1, summary));
    if (value.length > MAX_AUDIT_METADATA_ARRAY_LENGTH) {
      noteRedaction(summary, "truncated-array");
      entries.push(`[redacted:${value.length - MAX_AUDIT_METADATA_ARRAY_LENGTH}:additional-items]`);
    }
    return entries;
  }

  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_AUDIT_METADATA_OBJECT_KEYS
    );
    for (const [key, entry] of entries) {
      const keyRedaction = classifyAuditKey(key, entry);
      if (keyRedaction) {
        noteRedaction(summary, keyRedaction);
        out[key] = redactionMarker(keyRedaction);
        continue;
      }
      out[key] = redactAuditMetadata(entry, depth + 1, summary);
    }
    const totalKeys = Object.keys(value as Record<string, unknown>).length;
    if (totalKeys > MAX_AUDIT_METADATA_OBJECT_KEYS) {
      noteRedaction(summary, "truncated-keys");
      out.__truncatedKeys = totalKeys - MAX_AUDIT_METADATA_OBJECT_KEYS;
    }
    return out;
  }

  if (typeof value === "string") {
    if (isSecretShapedAuditString(value)) {
      noteRedaction(summary, "secret-shaped");
      return "[redacted]";
    }
    if (value.length > MAX_AUDIT_METADATA_STRING_LENGTH) {
      noteRedaction(summary, "truncated-string");
      return `${value.slice(0, MAX_AUDIT_METADATA_STRING_LENGTH)}...[redacted:${value.length - MAX_AUDIT_METADATA_STRING_LENGTH}:additional-chars]`;
    }
  }

  return value;
}

export function summarizeAuditRedaction(value: unknown): AuditRedactionSummary {
  const summary: AuditRedactionSummary = { redacted: false, kinds: [] };
  redactAuditMetadata(value, 0, summary);
  return summary;
}

export function isSensitiveAuditKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function isPromptBodyAuditKey(key: string): boolean {
  return PROMPT_BODY_KEY_PATTERN.test(key);
}

export function isFileContentAuditKey(key: string): boolean {
  return FILE_CONTENT_KEY_PATTERN.test(key);
}

export function isSecretShapedAuditString(value: string): boolean {
  return (
    /(?:bearer|token|secret|password)\s+[a-z0-9._-]{12,}/i.test(value) ||
    /sk-[a-z0-9]{16,}/i.test(value) ||
    /gh[pousr]_[a-z0-9_]{20,}/i.test(value)
  );
}

function classifyAuditKey(key: string, value: unknown): AuditRedactionKind | null {
  if (isSensitiveAuditKey(key)) {
    return "secret-key";
  }
  if (isPromptBodyAuditKey(key)) {
    return "prompt-body";
  }
  if (isFileContentAuditKey(key) && isFileLikeAuditValue(value)) {
    return "file-content";
  }
  return null;
}

function isFileLikeAuditValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return typeof value === "object" && value !== null;
  }
  return value.length > 0;
}

function redactionMarker(kind: AuditRedactionKind): string {
  switch (kind) {
    case "secret-key":
    case "secret-shaped":
      return "[redacted]";
    case "prompt-body":
      return "[redacted:prompt-body]";
    case "file-content":
      return "[redacted:file-content]";
    case "depth-limit":
      return "[redacted:depth-limit]";
    default:
      return "[redacted]";
  }
}

function noteRedaction(summary: AuditRedactionSummary, kind: AuditRedactionKind): void {
  summary.redacted = true;
  if (!summary.kinds.includes(kind)) {
    summary.kinds.push(kind);
  }
}
