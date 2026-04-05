import type { IngestCandidate } from "./ingest.js";

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Structured reasoning for `metadata.supportingReasoning` on pipeline-created improvements.
 * This is scoring + provenance pointers—not a raw transcript/diff dump; the task `issue` / `approach` carry the synthesized problem report.
 */
export function buildImprovementSupportingReasoning(c: IngestCandidate): string {
  const signalLine =
    c.confidence.reasons.length > 0
      ? `Admission rationale: ${c.confidence.reasons.join("; ")}.`
      : `Admitted at confidence ${c.confidence.score.toFixed(2)} (${c.confidence.tier} tier).`;
  const prov = Object.entries(c.provenanceRefs)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k, v]) => `${k}=${truncate(v as string, 140)}`)
    .join("; ");
  return `${signalLine} Evidence kind **${c.evidenceKind}**; stable key \`${c.evidenceKey}\`. Provenance: ${prov || "(none)"}. The **issue** and **approach** fields are the interpreted problem report; this block records heuristics and trace refs only.`;
}
