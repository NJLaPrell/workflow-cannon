{{{AI Documentation Directive}}}

# Security Policy

## Reporting a vulnerability

{{{
Describe how to report security issues privately and why public disclosure is discouraged before coordination.
Method:
1) Read `docs/maintainers/SECURITY.md` and `README.md` / `docs/maintainers/SUPPORT.md` for contact paths.
2) If no private contact is listed, instruct to use GitHub security advisories or maintainer email if documented.
Output format:
- 2-4 sentences; imperative and clear.
Validation:
- Do not invent email addresses; use only public repo contact mechanisms.
}}}

## What to include

{{{
List information reporters should provide for effective triage.
Method:
1) Align with `docs/maintainers/SECURITY.md` and common vulnerability reporting practice.
Output format:
- Bullet list: description, versions, repro, impact, suggested fix.
Validation:
- Keep items parallel (noun-led or short phrases).
}}}

## Response expectations

{{{
Set SLA-style expectations for acknowledgement and triage.
Method:
1) Preserve numeric targets from existing `docs/maintainers/SECURITY.md` if present.
2) State business-day semantics if used.
Output format:
- Short bullets for acknowledgement, triage, coordinated disclosure.
Validation:
- If no SLA exists in source, say “targets” not “guarantees” unless the org wants guarantees.
}}}

## Scope highlights

{{{
Enumerate security-sensitive areas relevant to this project (secrets, policy bypass, workspace mutation, privacy).
Method:
1) Derive from `docs/maintainers/ARCHITECTURE.md`, `docs/maintainers/RELEASING.md`, and security-related tasks.
Output format:
- Bullet list with bold labels optional.
Validation:
- Tie each area to project-specific behavior when possible.
}}}
