# CAE activation lifecycle & versioning (v1)

**Normative task:** **`T841`**. **Definition schema:** **`schemas/cae/activation-definition.schema.json`** (**`T840`**). **Precedence / merge:** **`T843`**. **Governance / CRUD:** **`T852`**, **`T868`**.

## States (enum)

| State | Meaning |
| --- | --- |
| **`draft`** | Work in progress; **must not** ship in **production** registry paths (see below). |
| **`active`** | Eligible for evaluation subject to scope, precedence, and runtime flags. |
| **`retired`** | **No-op** for evaluation — row is ignored as a candidate (**hard filter**). |
| **`disabled`** | **No-op** for evaluation — operator or governance turned off without deleting history (**hard filter**). |

**`retired`** vs **`disabled`:** both **do nothing** at evaluation time; **`retired`** implies end-of-life / superseded, **`disabled`** implies temporary or policy-driven off.

## Shadow-only is not a lifecycle state

**`shadow-only`** behavior is a **runtime mode** on **`cae-evaluate`** / shadow pipeline (**`T848`**, **`T847`**) combined with definition **`flags.shadowEligible`** (**`T840`**). It does **not** appear as `lifecycleState`.

## Draft vs production registry

- **Production registry** (paths decided in **`T857`** / bootstrap): loaders **MUST** reject or skip **`draft`** rows when building the evaluator candidate set for normal operation.
- **Fixture / dev-only** registries **MAY** include **`draft`** for tests and local iteration.
- Exact file-path split is an implementation detail of **`T858`**; the **semantic rule** is: **draft never affects production evaluation**.

## Definition schema versioning

- Each activation row carries **`schemaVersion`** (currently **`1`**) per **`T840`**.
- A **single registry file** (or manifest) for production **SHOULD** use one **`schemaVersion`** per environment slice to simplify loaders; **mixed versions** are **allowed** only when **`T858`** explicitly implements per-row dispatch for multiple versions.
- **Bump policy:** raising **`schemaVersion`** is a **breaking** change unless **`T858`** supports both old and new shapes; document migrations in task-engine / CAE release notes.

## State transition table

Allowed transitions (who/what gates detailed in **`T852`** / **`T868`**):

| From → To | `draft` | `active` | `disabled` | `retired` |
| --- | --- | --- | --- | --- |
| **`draft`** | — | promote (review) | — | abandon |
| **`active`** | demote (rare) | — | disable | retire |
| **`disabled`** | — | re-enable | — | retire |
| **`retired`** | — | **forbidden** | **forbidden** | — |

- **promote:** governance-approved move to production eligibility.
- **disable / re-enable:** operator or automated policy (**`T868`**).
- **retire:** terminal for evaluation; history retained for audit/trace (**`T867`**).

## Evaluator pre-filter order (candidate set)

Before scope matching and **precedence merge** (**`T843`**), **`T860`** MUST apply filters in this **order**:

1. **Schema validation** — drop invalid rows (hard error or skip per loader policy).
2. **`lifecycleState` `disabled` or `retired`** — **remove** from candidate set (no scope work, no merge contribution).
3. **`lifecycleState` `draft`** — **remove** from **production** candidate set.
4. **Scope conditions** — keep only rows whose **`scope.conditions`** AND to true.
5. **Family bucketing + priority / specificity** — **`T843`**.

This ordering keeps “**retired/disabled do nothing**” **unambiguous**: they never reach scope or merge.

## Alignment notes

- **Trace:** lifecycle skips emit types per **`.ai/cae/activation-definition-trace-mapping.md`**.
- **Governance:** only authorized actors transition states (**`T852`**); this doc does not define approval JSON — see **`.ai/POLICY-APPROVAL.md`**.
