# run-transition

Execute a validated task status transition.

```
workspace-kit run run-transition '{"taskId":"T184","action":"start"}'
```

Arguments: `taskId` (required), `action` (required: accept, reject, start, block, cancel, complete, pause, unblock), `actor` (optional).
