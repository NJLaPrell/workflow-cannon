/** Redact sensitive fields before persisting wk run log rows. */
export function redactRunLogValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactRunLogValue(entry));
  }
  if (typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "policyApproval" && entry && typeof entry === "object" && !Array.isArray(entry)) {
      const pa = { ...(entry as Record<string, unknown>) };
      if (typeof pa.rationale === "string" && pa.rationale.length > 0) {
        pa.rationale = "[redacted]";
      }
      out[key] = pa;
      continue;
    }
    out[key] = redactRunLogValue(entry);
  }
  return out;
}
