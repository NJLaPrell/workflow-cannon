# scout-report

Read-only JSON rehearsal for the **improvement scout** playbook (`improvement-scout`). Emits rotated **primary** / **adversarial** lenses, a **target zone**, a **question stem**, and up to three **candidate findings** (classification `rehearsal`). Does **not** create tasks, advance transcript/policy cursors, or run **`generate-recommendations`**.

## Args (JSON)

- **`seed`** (optional string): stabilizes rotation picks for the same workspace history length.
- **`persistRotation`** (optional boolean, default `false`): when **`true`**, appends this run to **`scoutRotationHistory`** in improvement state (bounded FIFO) and saves — use when you want rotation memory without opening tasks.

## Policy

Non-sensitive — no **`policyApproval`** required.

## Example

```bash
workspace-kit run scout-report '{}'
workspace-kit run scout-report '{"seed":"weekly-scout","persistRotation":true}'
```
