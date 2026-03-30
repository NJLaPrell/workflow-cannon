# migrate-wishlist-intake

One-time migration: copy legacy wishlist rows into **`wishlist_intake`** tasks (`T###` with optional `metadata.legacyWishlistId`), clear the separate wishlist artifact, and (SQLite) drop the `wishlist_store_json` column from `workspace_planning_state`.

## Usage

```
workspace-kit run migrate-wishlist-intake '{"dryRun":true}'
workspace-kit run migrate-wishlist-intake '{}'
```

## Arguments

- `dryRun` (boolean, optional): when `true`, report counts only; no writes.

## Notes

- Run after upgrading to the kit version that ships this command; back up `.workspace-kit/` first.
- JSON mode: clears the configured wishlist JSON file to an empty document after migrating items.
- Safe to re-run when the wishlist is already empty and SQLite already uses the task-only row shape (no-op).
