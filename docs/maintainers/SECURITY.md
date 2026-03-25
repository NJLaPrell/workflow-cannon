# Security Policy

## Reporting a vulnerability

If you discover a security issue, please report it privately through GitHub Security Advisories on this repository. Do not open a public issue containing exploit details — coordinated disclosure protects users while giving maintainers time to respond.

## What to include

- A clear description of the vulnerability.
- Affected version or commit SHA.
- Reproduction steps or proof of concept.
- Impact assessment (who is affected, severity).
- Suggested remediation (if known).

## Response expectations

- Initial acknowledgement target: 3 business days.
- Triage and severity assignment after acknowledgement.
- Coordinated remediation and disclosure timing with reporters.

These are targets, not legal guarantees. We aim to be responsive and transparent.

## Scope highlights

Security-sensitive areas in this project include:

- **Credential and secret handling** — any flow that reads, stores, or transmits secrets or tokens.
- **Policy and approval bypass** — circumventing approval gates defined in `.ai/PRINCIPLES.md` or release readiness checks.
- **Workspace mutation** — unsafe writes, path traversal, or injection through template generation, config resolution, or CLI commands.
- **Data retention and privacy** — controls around evidence artifacts, logs, and any user-identifiable data.
