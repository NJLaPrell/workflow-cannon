type UnknownRecord = Record<string, unknown>;

export type GuidancePanelActionResultMessage = {
  type: "actionResult";
  ok: boolean;
  text: string;
  actions: Array<{ label: string; action: string }>;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

export function buildGuidanceMutationActionResultMessage(command: string, result: unknown): GuidancePanelActionResultMessage {
  const record = asRecord(result);
  const ok = record.ok === true;
  const text = ok
    ? String(record.message ?? `${command} completed.`)
    : String(record.message ?? record.code ?? `${command} failed.`);
  const stale = !ok && (String(record.code ?? "") === "cae-stale-state" || text.toLowerCase().includes("stale"));
  return {
    type: "actionResult",
    ok,
    text,
    actions: stale
      ? [
          { label: "Refresh", action: "refresh" },
          { label: "Review Changes", action: "select-audit" }
        ]
      : []
  };
}
