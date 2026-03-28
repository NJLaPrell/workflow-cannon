export type AiRecord = {
  type: string;
  kv: Record<string, string>;
  raw: string;
};

export function parseAiRecordLine(line: string): AiRecord | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split("|");
  if (parts.length < 2) return null;
  const type = parts[0]?.trim() ?? "";
  if (!type) return null;

  const kv: Record<string, string> = {};
  let slotIndex = 1;
  for (const token of parts.slice(1)) {
    const piece = token.trim();
    if (!piece) continue;
    const idx = piece.indexOf("=");
    if (idx >= 0) {
      const key = piece.slice(0, idx).trim();
      const value = piece.slice(idx + 1).trim();
      if (key) kv[key] = value;
      continue;
    }
    // Transitional support: retain unkeyed tokens as synthetic slots.
    kv[`slot${slotIndex}`] = piece;
    slotIndex += 1;
  }
  return { type, kv, raw: line };
}

export function parseAiDocument(text: string): AiRecord[] {
  const records: AiRecord[] = [];
  for (const line of text.split("\n")) {
    const rec = parseAiRecordLine(line);
    if (rec) records.push(rec);
  }
  return records;
}
