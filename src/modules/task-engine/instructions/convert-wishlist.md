# convert-wishlist

Convert an **open** Wishlist item into one or more canonical **tasks** (`T###`), then mark the wishlist item **converted** (auto-close) with provenance.

## Usage

```
workspace-kit run convert-wishlist '<json>'
```

## Required arguments

| Field | Description |
| --- | --- |
| `wishlistId` | Wishlist id (`W<number>`) |
| `decomposition` | Object with `rationale`, `boundaries`, `dependencyIntent` (all non-empty strings) |
| `tasks` | Non-empty array of task payloads |

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
workspace-kit run convert-wishlist '{"wishlistId":"W1","decomposition":{"rationale":"Split schema vs commands","boundaries":"No UI in this slice","dependencyIntent":"T400 blocks T401"},"tasks":[{"id":"T400","title":"Add wishlist store","phase":"Phase 14 - Wishlist","priority":"P1","approach":"File-backed JSON","technicalScope":["Persist under .workspace-kit/wishlist"],"acceptanceCriteria":["create-wishlist works"]}]}'
```
