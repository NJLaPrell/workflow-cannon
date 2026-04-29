<!--
agentCapsule|v=1|command=create-wishlist|module=task-engine|schema_only=pnpm exec wk run create-wishlist --schema-only '{}'
-->

# create-wishlist

Create a **wishlist intake** task (`type: "wishlist_intake"`, id `T<number>`). Ideation fields live in **metadata**; these tasks stay out of **ready-queue** suggestions until converted.

## Usage

```
workspace-kit run create-wishlist '<json>'
```

## Required fields

| Field | Description |
| --- | --- |
| `title` | Short label |
| `problemStatement` | What problem or gap this addresses |
| `expectedOutcome` | What “done” looks like |
| `impact` | Why it matters |
| `constraints` | Hard limits (time, compatibility, policy) |
| `successSignals` | Observable signals of success |
| `requestor` | Who is asking / accountable for intake |
| `evidenceRef` | Link or pointer to supporting context |

## Optional fields

| Field | Description |
| --- | --- |
| `id` | Legacy **`W<number>`** only when you need stable provenance; stored as `metadata.legacyWishlistId`. Omit to allocate the next **`T<number>`** automatically. |

`phase` is **not** allowed on wishlist intake tasks.

## Example (auto `T###`)

```bash
workspace-kit run create-wishlist '{"title":"Faster cold start","problemStatement":"Doctor is slow on first run","expectedOutcome":"Sub-2s doctor on fresh clone","impact":"Maintainer time","constraints":"No new native deps","successSignals":"CI timing budget green","requestor":"team@example","evidenceRef":"issue/123"}'
```

## Example (explicit legacy `W###` provenance)

```bash
workspace-kit run create-wishlist '{"id":"W1","title":"Faster cold start","problemStatement":"…","expectedOutcome":"…","impact":"…","constraints":"…","successSignals":"…","requestor":"…","evidenceRef":"…"}'
```

## Breaking into workable tasks later

Use `convert-wishlist` with `wishlistTaskId` (`T###`) or legacy `wishlistId` (`W###` when present), a `decomposition` object, and a `tasks` array of phased `T###` task payloads.
