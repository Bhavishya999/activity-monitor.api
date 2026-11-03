# Deployment (Railway, with Railway Postgres or Supabase)

Three Railway services run from two repos, plus a database:

| Service | Repo | Config file | Public URL |
|---|---|---|---|
| **api** | `activity-monitor.api` | `railway.api.json` | Yes: this is the API URL (and GitHub's webhook target) |
| **worker** | `activity-monitor.api` | `railway.worker.json` | No |
| **app** | `activity-monitor.app` | `railway.json` | Yes: this is the dashboard URL |
| Postgres | Railway plugin **or** Supabase | | No |

Secrets live only in Railway variables. Never commit them and never paste them into chat.

## 1. Database

**Railway Postgres (simplest):** add the Postgres plugin; reference it as `${{Postgres.DATABASE_URL}}`.

**Supabase:** use it as plain PostgreSQL.
- Use the **Session pooler** string (host `aws-0-<region>.pooler.supabase.com`, port **5432**, user `postgres.<project-ref>`), which works over IPv4. Do **not** use the transaction pooler (port 6543): the job queue (pg-boss) and migrations need session features.
- Add `?sslmode=require`. URL-encode special characters in the password.
- Row Level Security is switched on for every table by a migration (`0004`), so Supabase's public Data API cannot expose commit data. Keep it that way: every new table needs `ENABLE ROW LEVEL SECURITY` (a test fails otherwise).
- The app only needs the Postgres connection string. It never uses Supabase's anon or service-role keys; do not add them.
- Turn on backups (Supabase paid plans, or Railway backups) before storing real data.

## 2. API service (this is your API URL)

1. Railway: **New** > **GitHub Repo** > `activity-monitor.api` (branch `main`, or `dev` while testing).
2. **Settings > Config-as-code file path:** `railway.api.json`.
3. **Variables:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | the database connection string |
| `GITHUB_WEBHOOK_SECRET` | 32+ random characters: `openssl rand -hex 32` |
| `REPORT_TIMEZONE` | `Asia/Kolkata` |
| `SESSION_TTL_HOURS` | `12` |

   Do **not** set `DEV_AUTH_ENABLED`: the API refuses to start with it in production.
4. **Settings > Networking > Generate Domain.** The result, `https://<name>.up.railway.app`, is **the API URL**.
5. Each deploy runs migrations first (`preDeployCommand`), then starts the API. Health check: `/readyz`.

Check it:

```bash
curl https://<api-url>/healthz        # {"ok":true}
curl https://<api-url>/readyz         # {"ok":true} once the database is reachable
curl -i https://<api-url>/api/v1/analytics/overview   # 401: sign-in required
```

## 3. Worker service

1. **New** > **GitHub Repo** > the same repo.
2. **Config-as-code file path:** `railway.worker.json`. No public domain.
3. **Variables:** `NODE_ENV=production`, `DATABASE_URL` (same), `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (the PEM; keep `\n` escapes or paste multi-line).
4. It logs `{"msg":"worker started"}` when healthy.

## 4. GitHub App

Create it in GitHub (Settings > Developer settings > GitHub Apps):
- **Webhook URL:** `https://<api-url>/api/v1/webhooks/github`
- **Webhook secret:** the same value as `GITHUB_WEBHOOK_SECRET`.
- **Permissions:** Metadata (read), Contents (read). **Events:** Push, Repository (installation events are automatic).
- Generate a private key and put it in the worker's `GITHUB_APP_PRIVATE_KEY`; put the App ID in `GITHUB_APP_ID`.
- **Install** it on each organization or account to monitor. GitHub's *Advanced* tab shows delivered webhooks; a `202` means received.

## 5. Dashboard service

1. **New** > **GitHub Repo** > `activity-monitor.app`, config file `railway.json`.
2. **Variables:** `API_ORIGIN` = `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` (the api service's private address). The dashboard server forwards `/api/*` to it, so the browser only talks to one origin and the session cookie works without CORS or a custom domain.
3. Generate a domain: that is the dashboard URL.

## 6. Current limits to know before going live

- **Sign-in:** production sign-in (company Zoho account with admin invites) is not built yet, and the development login is deliberately unavailable in production. Until it ships, nobody can sign in to the dashboard in production. The API, database, worker and webhook receiver are all usable.
- **Importing history:** new pushes are ingested through webhooks. Triggering the first import of existing history needs the Synchronization admin feature, also not built yet.

## Operations

- Logs are JSON (Pino) with a request id on every API response header (`x-request-id`) and in error bodies.
- Rotate `GITHUB_WEBHOOK_SECRET` and the App private key by updating both Railway and GitHub together.
- If a database password was ever pasted into chat, a commit or a ticket, rotate it.
