# Versioning, bumping, releases, and extension ship lane

**Status:** planning (convert slices to `workspace-kit run create-task` when you start execution).  
**Audience:** maintainers + agents touching npm publish, Git tags, GitHub Releases, and the Cursor extension.  
**Source:** Maintainer Q&A session — consolidated so nothing lives only in chat.

---

## Part A — What has version numbers today

| Surface | Where it lives | Role |
| --- | --- | --- |
| **Published kit** | Root `package.json` → `@workflow-cannon/workspace-kit` | npm semver; CLI `--version`; primary shipped product line |
| **Per-workspace stamp** | `.workspace-kit/manifest.json` (`kit.version`) | Records **last init/upgrade** in *that* repo — not “monorepo HEAD” |
| **Cursor extension (dashboard / webviews)** | `extensions/cursor-workflow-cannon/package.json` | Separate semver channel (VS Code/Cursor extension packaging) |
| **GitHub Release / git tag** | Maintainer convention (`vX.Y.Z`) | Should align with **kit** npm line; **not** automated in `publish-npm.yml` today |
| **Other “versions”** | SQLite `PRAGMA user_version`, CAE registry versions, phase numbers | Schema / program / planning axes — **not** npm semver |

---

## Part B — Why numbers do not all match (and what to sync)

- **Extension vs kit:** Different artifact, different cadence. Do **not** force identical semver; document **compatibility** (minimum published kit) instead.
- **`manifest.json` vs root `package.json`:** Normal in **this** repo while developing the kit — bump root for npm; local manifest moves on **`wk upgrade`** in that tree.
- **GitHub Release vs npm:** Drift happens when publish is automated but tag/release creation is manual or skipped.

**Sync policy (recommended):**

| Pair | Policy |
| --- | --- |
| npm kit ↔ git tag `vX.Y.Z` ↔ GitHub Release | **Keep aligned** — one story per ship |
| Extension semver ↔ kit semver | **Independent numbers**; link via docs / min-supported kit |
| `manifest.json` ↔ dev tree `package.json` | **Do not chase equality** in git; upgrade locally when testing attached behavior |

---

## Part C — What to change (strategy summary)

1. **Bind npm publish to the same ref/tag/release story** — stop “publish then maybe tag later.”
2. **Thread release-channel env vars into the publish workflow** so `scripts/check-release-channel.mjs` runs with the same assumptions as maintainers (`WORKSPACE_KIT_RELEASE_CHANNEL`, `WORKSPACE_KIT_RELEASE_DIST_TAG`, `WORKSPACE_KIT_RELEASE_TAG`).
3. **Extension:** own bump + package + artifact story (`.vsix`, optional marketplace) without merging version numbers with the kit.
4. **Optional:** short semver semantics for the kit in `.ai/` (what counts as major/minor/patch).
5. **Optional:** `doctor` advisory when root `package.json` is newer than `manifest.json` in this dogfood repo (non-blocking).

---

## Part D — Implementation plan: Track 1 (highest leverage)

**Goal:** One mechanical line: **semver in `package.json` ↔ git tag ↔ npm ↔ channel checks ↔ GitHub Release.**

### D0) Pick trigger model

**Option A — Tag is the release lever (recommended)**  
Push annotated tag `vX.Y.Z` at the commit that already contains bumped `package.json` + changelog. Actions runs on that tag.

**Option B — `workflow_dispatch` only**  
Required inputs: version (must match `package.json`), optional `git_ref`. Checkout ref, run same guards.

Pick **one** default; document the other as recovery in `.ai/playbooks/phase-closeout-and-release.md` / `.ai/RELEASING.md`.

### D1) Tighten `.github/workflows/publish-npm.yml`

1. **Triggers:** If A: `on.push.tags: ['v*']` (+ optional dispatch for `next` / emergency with identical guard steps). If B: extend `workflow_dispatch` inputs.
2. **Checkout:** Tag push uses tag tip; dispatch uses `inputs.git_ref` (or default branch).
3. **New guard:** `scripts/assert-release-version-ref.mjs` (or inline step): read `package.json` `version`; if `GITHUB_REF_TYPE` is `tag`, require `GITHUB_REF_NAME === 'v' + version`; fail closed before expensive work.
4. **Channel validation on runner:** Set `WORKSPACE_KIT_RELEASE_TAG` (from tag ref or `v` + version), `WORKSPACE_KIT_RELEASE_DIST_TAG` (input default `latest` or matrix-driven), `WORKSPACE_KIT_RELEASE_CHANNEL` (default `stable`). Run `node scripts/check-release-channel.mjs` explicitly in this workflow (do not rely only on local `maintainer-gates` env).
5. **Split permissions:** Publish job keeps minimal token; GitHub Release job/step needs `contents: write`.

### D2) GitHub Release automation

- After successful `npm publish`, job using `softprops/action-gh-release` or `gh release create`.
- Release body: npm URL + pointer to canonical changelog at that tag (avoid fragile “parse markdown in CI” unless you invest in it).
- Idempotency: document recovery if release already exists.

### D3) Maintainer entrypoints

- **`scripts/trigger-publish-npm-workflow.mjs`:** If A is canonical, deprecate or narrow to `next` / hotfix; or add helper `scripts/tag-and-push-release.mjs` that reads version, creates annotated tag, pushes.
- **`.ai/playbooks/phase-closeout-and-release.md` + `.ai/RELEASING.md`:** Ordered steps: version + changelog → merge `main` → **tag + push** → CI publishes + creates Release → evidence manifest gets workflow URL + npm + release URL.

### D4) Acceptance criteria (Track 1)

- Mismatched tag vs `package.json` **fails before publish**.
- Stable channel rejects prerelease semver on the runner.
- Every successful kit publish has a **matching** GitHub Release at `vX.Y.Z`.

### D5) Risks

- Accidental `v*` tag push publishes — mitigate with **who can push tags** / protected patterns.
- npm **2FA / OTP** — if required, workflow must use **trusted publishing** or automation token per current npm policy.

---

## Part E — Implementation plan: Track 2 (extension release lane)

**Goal:** Reproducible extension builds and artifacts **without** merging extension semver with kit semver.

### E1) Machine runbook (`.ai/` only)

Add **`.ai/runbooks/cursor-extension-release.md`** (or under `.ai/playbooks/` if you prefer “procedure”) covering:

- When to bump `extensions/cursor-workflow-cannon/package.json`.
- Minimum supported published `@workflow-cannon/workspace-kit` (table or semver range).
- Commands: `pnpm install`, root `pnpm run build` if required, `pnpm --filter cursor-workflow-cannon run compile`, package via `vsce`.
- Default artifact naming and where it lands (GitHub Release asset vs Actions artifact).

### E2) Extension package tooling

- Add `@vscode/vsce` as **devDependency** (extension package or monorepo policy — pick one).
- Script **`package:vsix`** (depends on `compile`).

### E3) GitHub Actions

- **`.github/workflows/publish-extension.yml`** — start with `workflow_dispatch`: build, `vsce package`, `upload-artifact`.
- Optional: attach `.vsix` to a Release; use **either** same kit tag (if shipped together) **or** a dedicated convention (e.g. `extension-v0.1.x`) — choose one and document.

### E4) CI on PRs

- Keep or add path-gated **`pnpm --filter cursor-workflow-cannon run check`** so release day is not the first compile.

### E5) Acceptance criteria (Track 2)

- Maintainer follows **only** the new runbook and gets a deterministic `.vsix`.
- Extension and kit version numbers remain **independent**; compatibility is **documented** (runtime min-version check optional later).

---

## Part F — Suggested execution order

| Order | Work |
| --- | --- |
| 1 | Track 1 D0–D1 (trigger + assert + channel in `publish-npm.yml`) |
| 2 | Track 1 D2 (GitHub Release) |
| 3 | Track 1 D3 (docs + trigger script alignment) |
| 4 | Track 2 E1 + E2 (runbook + `package:vsix`) |
| 5 | Track 2 E3 (workflow) |

---

## Related canon (do not duplicate; link when editing)

- `.ai/RELEASING.md` — release gates and evidence expectations  
- `.ai/playbooks/phase-closeout-and-release.md` — ordered closeout checklist  
- `scripts/check-release-channel.mjs` — channel / dist-tag / tag prefix validation  
- `scripts/trigger-publish-npm-workflow.mjs` — current `gh workflow run` helper  
- `.github/workflows/publish-npm.yml` — npm publish CI
