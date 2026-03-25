# Task Dependency Map

Canonical dependency view for `T178` through `T195` plus Phase 2b (`T219`–`T220`, `T228`–`T237`), derived from `docs/maintainers/TASKS.md`.

## Purpose

- Provide a machine-readable planning view for sequencing.
- Highlight cross-phase blockers and critical paths.
- Make release-phase readiness easier to review.

## Phase-to-release map

| Phase | Release target | Tasks |
| --- | --- | --- |
| Phase 0 | `v0.2.0` | `T178`, `T179`, `T180`, `T181`, `T182`, `T183` |
| Phase 1 | `v0.3.0` | `T199`, `T184`, `T185`, `T186`, `T217` |
| Phase 2 | `v0.4.0` | `T218`, `T187`, `T200`, `T188`, `T201`, `T189` |
| Phase 2b | `v0.4.1` | `T219`, `T220`, `T228`–`T237` |
| Phase 3 | `v0.5.0` | `T190`, `T191`, `T192` |
| Phase 4 | `v0.6.0` | `T193`, `T194`, `T195` |

## DAG (Mermaid)

```mermaid
graph TD
  T178 --> T179
  T178 --> T180
  T178 --> T181
  T180 --> T181
  T179 --> T182
  T181 --> T182
  T181 --> T183
  T178 --> T184
  T182 --> T184
  T184 --> T185
  T184 --> T186
  T185 --> T186
  T217 --> T218
  T218 --> T187
  T184 --> T187
  T184 --> T188
  T187 --> T200
  T200 --> T188
  T187 --> T189
  T188 --> T201
  T188 --> T189
  T201 --> T189
  T188 --> T219
  T219 --> T220
  T185 --> T190
  T188 --> T190
  T220 --> T190
  T183 --> T191
  T190 --> T191
  T190 --> T192
  T191 --> T192
  T186 --> T193
  T188 --> T193
  T192 --> T193
  T185 --> T194
  T193 --> T194
  T179 --> T195
  T189 --> T195
  T193 --> T195
  T194 --> T195
  T187 --> T228
  T228 --> T229
  T228 --> T230
  T229 --> T231
  T230 --> T231
  T228 --> T232
  T229 --> T232
  T230 --> T232
  T188 --> T232
  T231 --> T234
  T232 --> T234
  T229 --> T234
  T228 --> T234
  T230 --> T236
  T188 --> T236
  T187 --> T236
  T236 --> T233
  T228 --> T233
  T230 --> T233
  T231 --> T233
  T234 --> T233
  T232 --> T237
  T234 --> T237
  T228 --> T235
  T230 --> T235
  T232 --> T235
  T234 --> T235
```

## Topological execution order (one valid order)

1. `T178`
2. `T179`, `T180`
3. `T181`
4. `T182`, `T183`
5. `T184`
6. `T185`
7. `T186`
8. `T217`
9. `T218`
10. `T187`
11. `T200`
12. `T188`
13. `T201`
14. `T189`
15. `T219`, `T228` (Phase 2b policy track vs config UX track; parallel)
16. `T220`, `T229`, `T230` (`T220` after `T219`; `T229`/`T230` after `T228`)
17. `T236` (after `T230`)
18. `T231`
19. `T232`
20. `T234`
21. `T233`
22. `T237`
23. `T235`
24. `T190` (after `T220`; may overlap the config UX chain in calendar time)
25. `T191`
26. `T192`
27. `T193`
28. `T194`
29. `T195`

## Critical path to final phase-release gate

Longest dependency chain ending at `T195`:

`T178` -> `T184` -> `T217` -> `T218` -> `T187` -> `T200` -> `T188` -> `T219` -> `T220` -> `T190` -> `T191` -> `T192` -> `T193` -> `T194` -> `T195`

## Maintenance rule

When any `Depends on` or `Unblocks` field changes in `docs/maintainers/TASKS.md`, update this file in the same PR.
