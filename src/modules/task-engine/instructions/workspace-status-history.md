# workspace-status-history

List recent **`kit_workspace_status_events`** rows (newest first).

## Usage

```
workspace-kit run workspace-status-history '{"limit":25}'
```

## Arguments

| Field | Description |
| --- | --- |
| **`limit`** | Optional integer (default **50**, max **500**). |

## Response

**`events`**: array of event rows (**`id`**, **`created_at`**, **`event_kind`**, **`actor`**, **`command`**, revisions, **`details_json`**).
