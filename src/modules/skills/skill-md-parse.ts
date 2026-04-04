/**
 * Minimal SKILL.md frontmatter parse (single-line values; tags comma-separated).
 */

export type ParsedSkillMd = {
  frontmatter: Record<string, string>;
  body: string;
};

export function parseSkillMd(raw: string): ParsedSkillMd {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const re = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const m = re.exec(trimmed);
  if (!m) {
    return { frontmatter: {}, body: trimmed };
  }
  const fmBlock = m[1] ?? "";
  const body = m[2] ?? "";
  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf(":");
    if (idx <= 0) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (/^[a-zA-Z0-9_-]+$/.test(key)) {
      frontmatter[key] = val;
    }
  }
  return { frontmatter, body };
}

export function parseTagsLine(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
