# ADR: CAE enforcement ships after shadow bake (v1)

## Status

Accepted — Phase 70 (**`T851`** / **`T866`** program). **Duration** is maintainer-configured (see **`.ai/cae/enforcement-lane.md`**); this ADR states the **gate**, not the calendar.

## Context

CAE can classify **would-enforce** outcomes in **shadow** (**`T848`**) without mutating command behavior. Turning on **live** enforcement that **blocks** or **requires** extra human steps is a **policy and safety** change. It must not land before shadow observation has covered the same code paths.

## Decision

1. **`T866`** enforcement that **blocks** `workspace-kit run` dispatch or **requires** new human gates **must not** merge until **`T863`** shadow labeling has shipped and maintainers record a **shadow bake** window (phase notes + workspace status / release checklist).
2. **Advisory-only** CAE surfaces (**`blockingLane: none`**, doctor copy) may ship without this gate.
3. The bake window length is **not** hard-coded in repo law — track in **`docs/maintainers/data/`** release notes or phase closeout checklist when enforcement PRs open.

## Consequences

- **`T866`** PRs cite this ADR + **`enforcement-lane.md`** allowlist.
- Rollback: disable **`kit.cae.enforcement.enabled`** (exact key **`T866`**) to return to advisory-only.

## References

- **`.ai/cae/enforcement-lane.md`**
- **`.ai/cae/shadow-mode.md`** (**`T848`**)
- **`.ai/POLICY-APPROVAL.md`**
