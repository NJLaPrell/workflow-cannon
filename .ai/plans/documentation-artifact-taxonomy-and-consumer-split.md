# Documentation artifact taxonomy and consumer attach split

**Status:** planning (not execution backlog by itself — convert slices to tasks when ready).  
**Audience:** maintainers + agents doing packaging / documentation-module work.  
**Goal (product):** When someone installs `@workflow-cannon/workspace-kit` on an **existing** project, they get **agent-relevant kit guidance** and the **documentation module as a tool to generate *their* project docs**, without inheriting **Workflow Cannon maintainer / product-repo** prose by default.

Related prior analysis: disconnect between npm `files` (ships full `.ai/` + WC `src/modules/documentation` views), `loadRuntimeConfig` fallback to **package** `src/modules/documentation`, `init` not writing host `.ai` / `AGENTS.md`, starter task + doc stubs branded for this repo.

---

## 1. Three-way taxonomy (classify before you split)

Use these **roles** for every generated or hand-maintained surface (file or logical section):

| Role | Meaning | Typical audience | Example (in *this* repo) |
| --- | --- | --- | --- |
| **M — Maintainer (WC product)** | How we ship, review, phase-close, CAE ops, maintainer-only playbooks, internal task/phase narrative | WC maintainers | Much of `docs/maintainers/`, deep `AGENTS.md` human twin, maintainer-only runbooks |
| **P — Project (repo as product)** | Describing **Workflow Cannon** the open-source product / repo layout / quick start for contributors | Contributors + npm readers | Repo `README.md` product framing, architecture of *this* codebase |
| **K — Kit (consumer-portable)** | How to run `workspace-kit`, policy lanes, module command shapes, SQLite/task rules **without** assuming this GitHub repo is the host | Any attached repo’s agents | `AGENT-CLI-MAP` tier table, `POLICY-APPROVAL`, module `instructions/*.md`, thin “attach + doctor” guidance |
| **C — Combined** | Same file or section mixes two or more of M / P / K in one narrative | Drift-prone | `README.md` that both sells WC (P) and documents kit install (K); `document-project` batch that emits ROADMAP (M) from shared machinery |

**Note:** “Project” here means “the repository we are documenting **as the product under work**.” For Workflow Cannon the git repo, P and M overlap often; for a **consumer** repo, P is *their* app and must not be filled with M.

---

## 2. Is “classify → track → split combined” reasonable?

**Yes**, as an **ordering constraint** before restructuring presets or npm `files`:

1. **Classify** each documentation target (or each template **section**) as M / P / K / C.
2. **Track** classification in a machine-checkable place (see §3).
3. **Split C** into separate **streams** (not necessarily duplicate prose: prefer **composition** — shared fragments included from one canonical snippet).

**Caveat:** Many “combined” artifacts are not two whole documents; they are **one template with mixed sections**. Splitting “into one of each” often means **section-level** tags + two render pipelines (consumer vs WC-full), not literally doubling every file.

---

## 3. Best approach to **track** M vs P vs K

Pick **one primary mechanism**; optional second for redundancy.

### Option A — **Preset / pack manifests (recommended)**

- Define packs: e.g. `consumer-minimal`, `workflow-cannon-maintainer-full`.
- Each pack lists **allowed document targets** and **template roots** (or view IDs).
- `workspace-kit.profile.json` (or `kit.documentationPreset`) selects pack.
- **Pros:** Single manifest is easy to gate in CI (`pnpm run check` asserts WC repo uses full pack; consumer default uses minimal).
- **Cons:** Requires discipline when adding new views.

### Option B — **Directory layout**

- `src/modules/documentation/presets/consumer/` vs `.../maintainer-wc/` with no cross-imports from consumer → maintainer.
- **Pros:** Obvious in code review.
- **Cons:** Duplication unless shared bits live in `presets/shared/` with clear rules.

### Option C — **Per-target metadata**

- Small sidecar or frontmatter: `role: maintainer | project | kit | combined` on each `*.view.yaml` or template.
- CI fails if `consumer` pack includes a target tagged `maintainer-only`.

**Recommended combo:** **A + C** — pack manifest lists targets; each target carries `role` / `audience` tags for drift checks and for generating “coverage reports” when classifying.

---

## 4. Splitting **combined** docs

1. **Inventory:** List all `document-project` / `generate-document` targets (see `src/modules/documentation/instructions/document-project.md`).
2. **Tag each target** M / P / K (or C with a list of constituents).
3. **For each C target:**
   - Prefer **extract kit-only sections** into includes or a small `kit-attach.md` fragment maintained once.
   - **Maintainer-only** sections move to maintainer pack or `docs/maintainers-only` generation path.
   - **Project-only** (WC product) stays in WC-full preset only.
4. **npm packaging:** Consumer preset must not ship or default-generate M-heavy targets (ROADMAP maintainer narrative, WC-only workbooks, etc.) unless explicitly opted in.

---

## 5. Restructure directions (execution spine — link to taxonomy)

Aligns §1–4 with the earlier strategy:

| Layer | Contents | Publish? |
| --- | --- | --- |
| Kit runtime | CLI, modules, SQLite, policy, module instructions | Yes — **thin** |
| Doc engine **consumer** pack | Neutral templates, minimal views, `project|name` from profile | Yes |
| WC **maintainer / product** pack | Full `.ai` canon, roadmap views, CAE-heavy artifacts, maintainer twins | **Git / optional package**, not default in attach |

Operational follow-ups (when tasked): split npm `files`; neutral `document-project` default; `init` writes host `AGENTS.md` pointer + optional minimal `.ai`; starter task copy behind preset; fork maintainer-only CI gates.

---

## 6. Suggested first milestone

1. Add **`documentationRole`** (or equivalent) to each view / template contract + a **`consumer-minimal`** manifest that lists only K-safe targets.
2. Classify every current target into M / P / K / C in a single table (this file or `src/modules/documentation/data/doc-roles.yaml` once created).
3. Split the worst **C** offenders (README template chain, `document-project` shipped list, published `.ai/` bulk) before widening scope.

---

## 7. Where this plan lives

Path: **`.ai/plans/documentation-artifact-taxonomy-and-consumer-split.md`**.  
If plans accumulate, add a one-line link from **`.ai/MACHINE-PLAYBOOKS.md`** or a small **`.ai/plans/README.md`** hub — only when a second plan lands or on explicit maintainer request.
