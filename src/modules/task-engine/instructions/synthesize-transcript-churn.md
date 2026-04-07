# synthesize-transcript-churn

Promote a **`type: transcript_churn`** task in **`status: research`** to **`type: improvement`**, **`status: proposed`**, after you have investigated the source transcript(s) and written a real problem report.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | yes | **`T###`** id of the transcript-churn row |
| `synthesis` | object | yes | Final improvement body (see below) |
| `actor` | string | no | Who ran the command |
| `expectedPlanningGeneration` | integer | when required | Same optimistic-lock story as **`run-transition`** when **`tasks.planningGenerationPolicy`** is **`require`** |
| `policyApproval` | object | when policy requires | JSON lane for sensitive runs |

## `synthesis` shape

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | no | Overrides task title when non-empty |
| `approach` | string | yes | How you want maintainers to think about the fix |
| `technicalScope` | string[] | yes | Non-empty scoped deliverables |
| `acceptanceCriteria` | string[] | yes | Verifiable outcomes |
| `metadata` | object | yes | Must include **`issue`** and **`supportingReasoning`** (non-empty strings). Optional **`proposedSolutions`**: string[] |

Prior pipeline metadata (evidence keys, forensics) is preserved; **`metadata.issue`** is replaced by your synthesized report, and the prior forensics string is copied to **`metadata.researchForensicsSnapshot`**.

## Abandon research

Use **`run-transition`** with **`action":"reject"`** from **`research`** → **`cancelled`** (no type change).
