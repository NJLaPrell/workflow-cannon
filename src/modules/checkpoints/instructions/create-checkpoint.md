# create-checkpoint

**Tier B (sensitive):** pass JSON **`policyApproval`** in the third CLI argument.

Persist a checkpoint row plus optional **`git stash`** when **`mode`** is **`stash`**.

## Usage

```
workspace-kit run create-checkpoint '{"mode":"head","label":"before risky edit","policyApproval":{"confirmed":true,"rationale":"manual snapshot"}}'
workspace-kit run create-checkpoint '{"mode":"stash","taskId":"T100","policyApproval":{"confirmed":true,"rationale":"stash WIP"}}'
```

## Arguments

| Field | Type | Notes |
| --- | --- | --- |
| `mode` | string | **`head`** (default) or **`stash`**. Stash mode uses `git stash push -u` when the tree is dirty; clean tree records **`head`**. |
| `label` | string | Optional short label. |
| `taskId` | string | Optional **`T###`**. |
| `id` | string | Optional id; otherwise a **`ckpt_`** uuid is generated. |
| `policyApproval` | object | Required (sensitive run). |
