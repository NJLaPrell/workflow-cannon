# REF-008 — Split configuration stack (`config-cli`, metadata, resolution)

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-008 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/core/config-cli.ts`, `src/core/config-metadata.ts`, `src/core/workspace-kit-config.ts` |

---

## Problem statement

**Configuration** crosses **facet metadata**, **resolution**, **`wk config`** / explain flows, validation, and merges with **`workspace-kit.json`** realities. **`config-cli`** and **`config-metadata`** files are **large**, increasing **risk** when altering one knob (ripple edits, missed validation).

---

## Goals

1. **Modularity:** **`config/metadata/`**, **`config/resolve/`**, **`config/cli.ts`** façade (exact names repo-deferrable).
2. **Maintainability:** **Unit-testable** pure validators for **`config-metadata`** subsets without booting **`ModuleRegistry`** where possible.
3. **Reliability:** **Stable** CLI output shapes for **`WorkspaceKitConfig`** explain commands (**JSON equality** keys preserved).
4. **Efficiency:** Smaller reviewer diffs per feature knob.

---

## Implementation plan

1. Parse **`export function`** clusters in **`config-metadata.ts`** — likely group **per module facet** (`task-engine`, `planning`, `improvement`, …).
2. **`config/metadata/<facet>.ts`** each exporting **`RECORDS`** fragments merged in **`metadata/index.ts`**.
3. **`workspace-kit-config.ts`**: split **pure path math** (`defaultWorkspaceKitPaths`-adjacent helpers) vs **merge** runtime.
4. **`config-cli.ts`**: only **imports** façade functions and wires **stdin/stdout** (**no** rules duplicated).
5. Maintain **`src/core/config-facets.ts`**, **`module-scoped-config.ts`** alignment via **explicit imports**.

---

## Task links

| Link | Purpose |
| --- | --- |
| **`REF-010`** | Package **`exports`** / consumer API clarity after config internals stabilize |
| **`.ai/module-build.md`** | Note if **`defaultRegistryModules`** wiring contract changes (**avoid** silent) |

---

## Acceptance criteria

- [ ] **Build + tests** pass; **`wk doctor`** still reports config summary if config paths participate.
- [ ] **No breaking** JSON field removals in **`workspace-kit config`** flows without **semver** discussion (**RELEASING**).
- [ ] **`config-cli`** LOC reduced materially or justified in PR (**split list** artifact).
- [ ] Regression: **`pnpm exec wk run get-next-actions`** if config-dependent (optional smoke).

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-008] Split core config-metadata and config-cli into facet modules",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Partition config-metadata.ts into facet-shaped modules merged at index.",
    "Trim config-cli orchestration vs pure validation.",
    "Keep workspace-kit-config resolution semantics with tests."
  ],
  "acceptanceCriteria": [
    "Smaller cohesive files; no intentional JSON regressions for config explanations.",
    "Tests green; semver note if observable output shifts."
  ],
  "metadata": {
    "issue": "Large config-cli and config-metadata modules complicate validation changes.",
    "supportingReasoning": "Measured line counts; facet-oriented structure fits existing module-registry model.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-008-split-config-stack.md"],
    "links": { "relatedProposalIds": ["REF-010"] }
  }
}
```

---

## Risk & rollback

- **Risk:** **Order-dependent** merges if split wrong — mitigate with **fixture** JSON blobs in tests (**add** if absent).
- **Rollback:** **`git revert`**.
