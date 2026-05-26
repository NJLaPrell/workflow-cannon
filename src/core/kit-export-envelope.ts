/**
 * Shared metadata for human-visible kit exports (YAML/JSON) that must not be treated as runtime truth.
 * Canonical task/planning state lives in SQLite until the git-backed event log ships (Phase 114+).
 */

export const KIT_EXPORT_ENVELOPE_SCHEMA_VERSION = 1 as const;

export type KitExportEnvelopeV1 = {
  schemaVersion: typeof KIT_EXPORT_ENVELOPE_SCHEMA_VERSION;
  /** Always false for kit-maintained exports in v1. */
  authoritative: false;
  /** ISO-8601 timestamp when the export bytes were generated. */
  generatedAt: string;
  /**
   * Monotonic sequence from the source row (e.g. `kit_workspace_status.workspace_revision`
   * or planning `planningGeneration` when no finer sequence exists).
   */
  sourceSequence: number;
  /** Describes what produced the payload (e.g. `kit_workspace_status`, `feature_registry`). */
  sourceKind: string;
  /** Operator-facing role label for dashboards and doctor copy. */
  role: "sqlite-projection-export";
};

export function buildKitExportEnvelopeV1(args: {
  sourceSequence: number;
  sourceKind: string;
  generatedAt?: string;
}): KitExportEnvelopeV1 {
  const seq = Number(args.sourceSequence);
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(`kit export envelope: sourceSequence must be a non-negative integer (got ${args.sourceSequence})`);
  }
  return {
    schemaVersion: KIT_EXPORT_ENVELOPE_SCHEMA_VERSION,
    authoritative: false,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    sourceSequence: seq,
    sourceKind: args.sourceKind.trim(),
    role: "sqlite-projection-export"
  };
}

/** YAML mapping block placed at the top of maintainer export files. */
export function formatKitExportEnvelopeYamlBlock(envelope: KitExportEnvelopeV1): string {
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "kit_export_envelope:",
    `  schema_version: ${envelope.schemaVersion}`,
    "  authoritative: false",
    `  generated_at: "${esc(envelope.generatedAt)}"`,
    `  source_sequence: ${envelope.sourceSequence}`,
    `  source_kind: "${esc(envelope.sourceKind)}"`,
    `  role: "${esc(envelope.role)}"`,
    ""
  ].join("\n");
}

export type JsonExportWithEnvelopeV1<TPayload> = {
  kitExportEnvelope: KitExportEnvelopeV1;
  payload: TPayload;
};

export function wrapJsonExportWithEnvelopeV1<TPayload>(
  envelope: KitExportEnvelopeV1,
  payload: TPayload
): JsonExportWithEnvelopeV1<TPayload> {
  return { kitExportEnvelope: envelope, payload };
}

/** Parse `source_sequence` from a workspace-status DB export YAML body (structured block preferred). */
/** Accept wrapped JSON exports (`kitExportEnvelope` + `payload`) or legacy bare payloads. */
export function unwrapKitJsonExportPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.kitExportEnvelope && rec.payload !== undefined) {
    return rec.payload;
  }
  return parsed;
}

export function readSourceSequenceFromExportYaml(body: string): number | null {
  const block = body.match(/^\s*source_sequence:\s*([0-9]+)\s*$/m);
  if (block) {
    const n = Number(block[1]);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  const legacy = body.match(/^# workspace_revision:\s*([0-9]+)\s*$/m);
  if (legacy) {
    const n = Number(legacy[1]);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  return null;
}
