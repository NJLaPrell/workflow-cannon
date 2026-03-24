{{{AI Documentation Directive}}}

# Support

## Getting help

{{{
Describe channels for help: issues, features, security escalation path.
Method:
1) Read `docs/maintainers/SUPPORT.md` and `README.md` for issue templates or contribution paths.
2) Cross-reference `docs/maintainers/SECURITY.md` for security-sensitive reports.
Output format:
- Bullet list with one line per channel.
Validation:
- Use relative paths to maintainer docs in this repo.
}}}

## What to include

{{{
List information reporters should attach for reproducible issues.
Method:
1) Align with `docs/maintainers/SUPPORT.md` and any issue template under `.github/ISSUE_TEMPLATE/`.
Output format:
- Bullet list: version/SHA, environment, commands, expected vs actual, logs.
Validation:
- Mention OS/runtime when relevant to the project stack.
}}}

## Response expectations

{{{
Set triage expectations and how priority is determined.
Method:
1) Preserve numbers from existing `docs/maintainers/SUPPORT.md` when present.
Output format:
- 2-3 short bullets.
Validation:
- Avoid legal guarantees; use “target” language unless the source doc says otherwise.
}}}
