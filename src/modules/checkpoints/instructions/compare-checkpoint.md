# compare-checkpoint

Read-only: **`git diff --name-status`** from the checkpoint’s compare ref to current **HEAD**.

- **`head`** checkpoints compare from **`gitHeadSha`**.
- **`stash`** checkpoints compare from **`secondaryRef`** (stash commit).

## Usage

```
workspace-kit run compare-checkpoint '{"checkpointId":"ckpt_..."}'
```

## Arguments

| Field | Type | Notes |
| --- | --- | --- |
| `checkpointId` | string | Required. |
