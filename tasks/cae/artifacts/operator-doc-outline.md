# CAE operator documentation outline (stub for T855)

Planned machine-canonical locations (confirm in T855):

1. **`.ai/cae/README.md`** — What CAE is; link to program context `tasks/cae/CAE-PROGRAM-CONTEXT.md` until moved.
2. **`.ai/cae/cli-read-only.md`** — Copy-paste JSON for evaluate/explain/list (or merge into AGENT-CLI-MAP).
3. **`.ai/runbooks/cae-debug.md`** — Doctor signals, registry validate, trace retrieval, shadow interpretation.
4. **Cross-links** — `AGENTS.md` bullet under task engine / CLI (if maintainers agree).

Sections each doc should include:

- Read-only first / shadow before enforcement
- Acknowledgement vs `policyApproval`
- Where traces live (ephemeral vs DB post-T867)
- Kill-switch / feature flag env names (TBD)
