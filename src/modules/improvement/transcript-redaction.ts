/**
 * Redact transcript-derived strings before they are persisted in task metadata or lineage.
 */
export function redactTranscriptSnippet(text: string, maxLen = 160): string {
  let s = text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  s = s.replace(/\b(sk|pk|api|Bearer)[-_]?[a-zA-Z0-9]{12,}\b/gi, "[redacted-token]");
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted-hex]");
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]");
  return s;
}
