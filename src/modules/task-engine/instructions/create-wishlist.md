# create-wishlist

Create a **Wishlist** ideation item. Wishlist IDs use namespace `W<number>` (not `T<number>` tasks). Items are **not** assigned a phase; phase belongs only to canonical tasks after conversion.

## Usage

```
workspace-kit run create-wishlist '<json>'
```

## Required fields

| Field | Description |
| --- | --- |
| `id` | Wishlist id, format `W` + digits (e.g. `W1`) |
| `title` | Short label |
| `problemStatement` | What problem or gap this addresses |
| `expectedOutcome` | What “done” looks like |
| `impact` | Why it matters |
| `constraints` | Hard limits (time, compatibility, policy) |
| `successSignals` | Observable signals of success |
| `requestor` | Who is asking / accountable for intake |
| `evidenceRef` | Link or pointer to supporting context |

`phase` is **not** allowed on wishlist items.

## Example

```bash
workspace-kit run create-wishlist '{"id":"W1","title":"Faster cold start","problemStatement":"Doctor is slow on first run","expectedOutcome":"Sub-2s doctor on fresh clone","impact":"Maintainer time","constraints":"No new native deps","successSignals":"CI timing budget green","requestor":"team@example","evidenceRef":"issue/123"}'
```

## Breaking into workable tasks later

Use `convert-wishlist` with a `decomposition` object (`rationale`, `boundaries`, `dependencyIntent`) and a `tasks` array of phased `T###` task payloads.
