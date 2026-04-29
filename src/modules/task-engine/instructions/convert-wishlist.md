<!--
agentCapsule|v=1|command=convert-wishlist|module=task-engine|schema_only=pnpm exec wk run convert-wishlist --schema-only '{}'
-->

# convert-wishlist

Convert an **open** wishlist intake task (`type: "wishlist_intake"`, status `proposed`) into one or more canonical **tasks** (`T###`), then mark the intake task **completed** with conversion provenance in metadata.

## Usage

```
workspace-kit run convert-wishlist '<json>'
```

## Required arguments

| Field | Description |
| --- | --- |
| `decomposition` | Object with `rationale`, `boundaries`, `dependencyIntent` (all non-empty strings) |
| `tasks` | Non-empty array of task payloads |

## Target intake (one of)

| Field | Description |
| --- | --- |
| `wishlistTaskId` | Wishlist intake task id (`T<number>`) — **preferred** for new workspaces |
| `wishlistId` | Legacy wishlist id (`W<number>`) when `metadata.legacyWishlistId` is set on the intake task |

## Each task payload must include

| Field | Description |
| --- | --- |
| `id` | `T<number>` (must not already exist) |
| `title` | Task title |
| `phase` | Task Engine phase string (workable tasks only) |
| `approach` | Implementation approach |
| `technicalScope` | Non-empty string array |
| `acceptanceCriteria` | Non-empty string array |

Optional: `priority` (`P1`–`P3`), `type`, `dependsOn`, `unblocks`.

## Example

```bash
workspace-kit run convert-wishlist '{"wishlistTaskId":"T10","decomposition":{"rationale":"Split schema vs commands","boundaries":"No UI in this slice","dependencyIntent":"T400 blocks T401"},"tasks":[{"id":"T400","title":"Add planning hook","phase":"Phase 24","priority":"P1","approach":"Task-backed intake","technicalScope":["Wire convert path"],"acceptanceCriteria":["convert-wishlist works"],"metadata":{"queueNamespace":"cli-squad","implementationEstimatePack":{"schemaVersion":1,"engineeringDaysRange":[2,5],"confidence":"low","assumptionBanner":"Human-owned estimate; non-binding."}}}]}'
```

Optional **`metadata.implementationEstimatePack`** and **`metadata.queueNamespace`** on per-task payloads — see **`docs/maintainers/runbooks/planning-workflow.md`** (estimate pack) and **`ADR-task-queue-namespace.md`**.

Legacy **`W###`** lookup (after migration with provenance):

```bash
workspace-kit run convert-wishlist '{"wishlistId":"W1","decomposition":{"rationale":"…","boundaries":"…","dependencyIntent":"…"},"tasks":[…]}'
```
