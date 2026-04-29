<!--
agentCapsule|v=1|command=review-item|module=approvals|schema_only=pnpm exec wk run review-item --schema-only '{}'
-->

# review-item

Review and record an approval decision.

1. Load approval context and linked evidence.
2. Record `accept`, `decline`, or `accept edited`.
3. Persist immutable decision history and rationale.
