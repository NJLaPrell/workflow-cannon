/** Derive a filesystem-safe slug from a plan title (lowercase, hyphenated, max 60 chars). */
export function derivePlanDocumentSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "plan";
}

/** Output basename (without .md) for docs/maintainers/plans/<ideaId>-<slug>.md */
export function derivePlanDocumentBasename(ideaId: string, title: string): string {
  return `${ideaId}-${derivePlanDocumentSlug(title)}`;
}
