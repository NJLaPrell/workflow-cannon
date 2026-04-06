## Source-of-truth order (agents)

Drift-checked against `scripts/fixtures/governance-doc-order.json`. This is the **agent** precedence list; it is **not** the maintainer human-doc stack (see **docs/maintainers/AGENTS.md** without treating that file as agent bootstrap).

1. `.ai/PRINCIPLES.md` — trade-offs, approval gates, principles rule ids
2. `.ai/module-build.md` — module development contracts
3. `.ai/WORKSPACE-KIT-SESSION.md` — session snapshot protocol; roadmap pointers without opening maintainer prose under docs/
4. `.workspace-kit/tasks/workspace-kit.db` — default SQLite task store
5. `.workspace-kit/tasks/state.json` — JSON opt-out task store
6. `docs/maintainers/data/workspace-kit-status.yaml` — phase snapshot (allowed exception: YAML/JSON under docs/maintainers/data only; do not read adjacent maintainer prose unless excepted)
7. `.ai/RELEASING.md` — release readiness and evidence gates
8. `.ai/POLICY-APPROVAL.md` — approval surfaces (`run` JSON vs `config` env)
9. `.ai/AGENT-CLI-MAP.md` — tier table, copy-paste JSON, operation surfaces
10. `.ai/TERMS.md` — canonical terminology for agents
