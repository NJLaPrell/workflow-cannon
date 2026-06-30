# MarkLogic + FastTrack demo

Local Docker stack for the Phase 139 MarkLogic + FastTrack integration demo.

## Services

| Service | Purpose | URL (default) |
| --- | --- | --- |
| `marklogic` | MarkLogic Server (data tier) | Admin UI: http://localhost:8001 |
| `ml-setup` | One-shot init after MarkLogic is healthy | n/a (exits 0) |
| `fasttrack` | UI tier placeholder (nginx until FastTrack React app lands) | http://localhost:3000 |

## Prerequisites

- Docker Engine with Compose v2
- Accept the [MarkLogic developer license](https://developer.marklogic.com/free-developer/) if prompted
- Ports `8000`, `8001`, `8002`, and `3000` available on the host

## Quick start

1. Copy environment defaults:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set a strong `MARKLOGIC_ADMIN_PASSWORD`.

3. Start the stack:

   ```bash
   docker compose up -d
   ```

4. Verify:

   - MarkLogic admin UI: http://localhost:8001 (login with `.env` credentials)
   - FastTrack placeholder UI: http://localhost:3000

5. Tail logs:

   ```bash
   docker compose logs -f marklogic ml-setup fasttrack
   ```

## First-run notes

- MarkLogic initialization can take **2–3 minutes** on a cold start; `ml-setup` waits for the admin UI health check.
- `ml-setup` is a **placeholder** in this task; T100739 replaces it with Management REST configuration and seed loading.
- `fasttrack` is a **placeholder** nginx container until T100741 wires FastTrack entity config and the React UI.

## Reset / rollback

```bash
docker compose down -v
docker compose up -d
```

`-v` removes the `marklogic-data` volume for a clean first-run retry.

## Roadmap (Phase 139)

| Task | Delivers |
| --- | --- |
| T100738 | Compose scaffold (this task) |
| T100739 | `ml-setup/` init container (database + REST app server) |
| T100740 | Seed user-profile documents |
| T100741 | FastTrack entity model + search options |
| T100742 | Full operator README |
