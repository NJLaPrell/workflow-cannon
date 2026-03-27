{{{AI Documentation Directive}}}

<div align="center">
  <img src="../../title_image.png" alt="Workflow Cannon" width="720" />
</div>

# Workflow Cannon

> Maintainer view: the canonical entry document is the repository root [`README.md`](../../README.md). Keep the centered **title image** block above aligned with that file; image path is relative to this file under `docs/maintainers/`.

## Summary

{{{
Produce a short maintainer-facing summary of the repository purpose by reading the root `README.md`.
Method:
1) Read `README.md` sections "What This Repository Is" and the opening paragraph under the main title.
2) Condense to 3-5 bullets or two short paragraphs; do not duplicate the full root README.
3) Link to `README.md` for the complete narrative.
Output format:
- Short intro paragraph optional; then bullets for scope (package, maintainer docs, validation).
Validation:
- Paths must be valid from `docs/maintainers/` (use `../..` for repo root where needed).
}}}

## Where to go next

{{{
List primary navigation targets for maintainers.
Method:
1) Read root `README.md` "Documentation Index" and "Repository Map".
2) Emit 5-8 links with one line each.
Output format:
- Bullet list of markdown links.
Validation:
- Prefer relative paths consistent with other maintainer docs.
}}}
