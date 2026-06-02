# Team execution module config

Assignment rows live in unified **`workspace-kit.db`** (see **`get-kit-persistence-map`**) when kit SQLite **`user_version` ≥ 7**. Operators run workers in the host (e.g. Cursor); the kit records **supervisor/worker identity**, **handoff JSON**, and **reconcile checkpoints** only.

Optional authority hardening knobs:

- **`orchestration.adminIds`** or **`teamExecution.adminIds`**: string array of actor ids allowed to perform supervisor lifecycle actions (`block-assignment`, `reconcile-assignment`, `cancel-assignment`) as admin override.
