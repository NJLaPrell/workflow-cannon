<!--
agentCapsule|v=1|command=update-wishlist|module=task-engine|schema_only=pnpm exec wk run update-wishlist --schema-only '{}'
-->

# update-wishlist

Update mutable string fields on an **open** Wishlist item. Does not change lifecycle except via content edits; conversion uses `convert-wishlist`.

## Usage

```
workspace-kit run update-wishlist '{"wishlistId":"W1","updates":{"title":"New title"}}'
workspace-kit run update-wishlist '{"wishlistId":"W1","patch":{"title":"Alias via patch"}}'
```

`patch` is accepted as an alias for `updates` when `updates` is omitted; when both are present, keys in **`updates`** win.

## Mutable fields

`title`, `problemStatement`, `expectedOutcome`, `impact`, `constraints`, `successSignals`, `requestor`, `evidenceRef`.

`phase` cannot be set on wishlist items.
