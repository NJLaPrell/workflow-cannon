/**
 * Shared banner + expected output for Phase 56 .ai → docs/maintainers pipeline.
 */
export function bannerForSource(sourceRel) {
  return `<!-- GENERATED FROM ${sourceRel} — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->\n\n`;
}

export function expectedDocOutput(sourceRel, sourceBody) {
  return bannerForSource(sourceRel) + sourceBody;
}
