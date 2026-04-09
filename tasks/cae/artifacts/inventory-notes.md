# CAE artifact inventory notes (T857)

## Scope

First tranche of **`artifactId`** → repo file mappings under **`.ai/cae/registry/artifacts.v1.json`**. Activation rows ship alongside in **`activations.v1.json`** (**`T858`**). Focus: high-traffic agent playbooks, policy canon, and CAE operator runbooks. **Not exhaustive** — extend via PRs using the checklist below.

## Omissions (intentional v1)

- Most **`docs/maintainers/**`** twins — human-first; agents use **`.ai/`** per routing rules unless an ADR explicitly dual-maps.
- **`src/modules/**`** instruction bodies — may be added later as **`playbook`** or **`checklist`** rows when stable ids are agreed.
- **`tasks/cae/specs/**`** — task specs are planning artifacts, not default activation targets.

## Owners

- **Registry edits:** phase CAE maintainers / reviewers on **`release/phase-70`** (and successors).
- **Schema:** **`schemas/cae/registry-entry.v1.json`** (**`T839`**).

## PR checklist (new registry row)

1. Pick a new stable **`artifactId`** (`lowercase.segments.dotted`).
2. Choose **`artifactType`** from the registry enum (no `cognitive-map` in v1).
3. Set **`ref.path`** to a repo-relative path allowed by schema (**`src/`**, **`docs/`**, **`tasks/`**, **`.ai/`** only).
4. Add **`title`** and optional **`tags`** (sorted for deterministic diffs).
5. Insert the JSON object into **`artifacts`** array in **lexicographic `artifactId` order**.
6. Run **`pnpm run check`** (and any CAE validation tests once **T858** lands).
