# list-wishlist

List Wishlist items from `.workspace-kit/wishlist/state.json`. This surface is **wishlist-only**; it does not include Task Engine tasks.

## Usage

```
workspace-kit run list-wishlist '{}'
workspace-kit run list-wishlist '{"status":"open"}'
```

## Arguments

| Field | Description |
| --- | --- |
| `status` | Optional filter: `open`, `converted`, or `cancelled` |
