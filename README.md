# activity-monitor.api

Backend for **Git Activity Monitor**, an internal engineering-analytics tool. It automatically collects commits from multiple GitHub organizations and repositories, attributes them to developers by GitHub identity, and (in upcoming milestones) serves analytics and sends daily reports to Slack and Google Sheets.

Frontend: [`activity-monitor.app`](https://github.com/Bhavishya999/activity-monitor.app)

> Commit counts are an activity signal, not a measure of productivity.

## Status

| Area | State |
|---|---|
| Database schema + migrations | Done |
| GitHub App client (multi-installation, rate-limit aware, ETag caching) | Done |
| Repository discovery | Done |
| Resumable commit import (all branches, incremental, deduplicated) | Done |
| Signed webhook receiver + async processing | Done |
| Analytics API (overview, developers, repositories, commit search; time-zone aware) | Done |
| Teams (admin-defined groups) and a generic group-by breakdown | Done |
| Sessions, CSRF, role gate (dev-only login until Zoho) | Done |
| Zoho login, invites and admin user management | Next |
| Scheduled reports, Slack, Google Sheets | Planned |

## How it works

```
GitHub ──webhook──▶ API (verify signature, store, 202) ──▶ queue (Postgres) ──▶ Worker ──▶ PostgreSQL
GitHub ◀──REST───── Worker (discovery, historical import, reconciliation)
```

- **Multi-account:** many GitHub App installations, each with its own repositories and sync state.
- **Commits** are unique per `(repository, sha)`; a commit on several branches is counted once.
- **Identity** is the GitHub numeric user id. Names and emails are never used to guess; unresolved commits show as *Unassigned*. Author, committer and pusher are stored separately.
- **Fewer API calls:** unchanged branches are skipped, later runs fetch only new commits, side branches stop at already-stored history, list calls use ETags, and imports pause before the rate limit is hit and resume from a checkpoint.
- **Webhooks** are verified (HMAC-SHA256 on the raw body), stored, acknowledged immediately and processed by the worker with retries.
- **Time:** stored in UTC, grouped in SQL by the configured time zone (default `Asia/Kolkata`).

## Stack

Node.js (22+) · TypeScript (strict) · Hono · Drizzle ORM · PostgreSQL · pg-boss · Zod · Pino · Octokit · Vitest · ESLint

## Getting started

Requirements: Node 22+, PostgreSQL 16+.

```bash
npm install
cp .env.example .env            # fill in values; never commit .env
createdb gam_dev && createdb gam_test
npm run migrations:run
npm run dev                     # API
npm run dev:worker              # background worker (second terminal)
```

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api, worker | PostgreSQL connection string |
| `GITHUB_WEBHOOK_SECRET` | api | Secret used to verify GitHub webhooks (32+ random chars) |
| `GITHUB_APP_ID` | worker | GitHub App id |
| `GITHUB_APP_PRIVATE_KEY` | worker | GitHub App private key (PEM, `\n`-escaped). Store as a secret |
| `REPORT_TIMEZONE` | api, worker | Reporting time zone, default `Asia/Kolkata` |
| `DEV_AUTH_ENABLED` | api | `true` only on a developer machine; the API refuses to start with it in production |
| `SESSION_TTL_HOURS` | api | Session lifetime, default 12 |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | api | Server port, log level, environment |
| `TEST_DATABASE_URL` | tests | Must contain `test` in its name |

Secrets belong in environment variables or your host's secret store only.

### Sample data for UI development

```bash
createdb gam_sample
DATABASE_URL=postgres://gam:gam@localhost:5432/gam_sample npm run migrations:run
DATABASE_URL=postgres://gam:gam@localhost:5432/gam_sample npm run seed:sample
```

The seeder only runs against a database whose name contains `sample` and never in production. It flags the database so the frontend shows a permanent SAMPLE DATA banner.

### GitHub App

Create a GitHub App with **Metadata: read** and **Contents: read**, subscribe to **Push**, **Repository**, **Installation** and **Installation repositories** events, set the webhook URL to `https://<api-host>/api/v1/webhooks/github`, then install it on each organization or account you want monitored. Details: [docs/milestone-1.md](docs/milestone-1.md).

## API overview (`/api/v1`)

All routes except health and webhooks need a session. Reads are open to every signed-in role; changes are admin-only and need the `x-csrf-token` header.

| Endpoint | Purpose |
|---|---|
| `GET /analytics/overview` | Totals, daily trend, hourly activity, repository share, leaderboard, recent commits |
| `GET /analytics/breakdown?by=organization\|repository\|developer\|team` | Group the same activity by any dimension |
| `GET /developers`, `GET /developers/:id` | Developer list and profile (trend, repo breakdown, linked GitHub accounts) |
| `GET /repositories`, `GET /repositories/:id` | Repository list and detail (branches, contributors) |
| `GET /commits` | Commit search with pagination |
| `GET/POST/PATCH/DELETE /teams`, `PUT /teams/:id/members` | Teams: read for all, manage for Admin and Super Admin (audited) |
| `POST /auth/dev-login`, `GET /auth/me`, `POST /auth/logout` | Sessions (dev login only when `DEV_AUTH_ENABLED=true`) |
| `POST /webhooks/github` | GitHub webhook receiver |

Shared filter parameters: `range` (`today`, `yesterday`, `last7`, `last30`, `last90`, `custom` with `from`/`to`), `timezone`, `installationId`, `repositoryId`, `developerId`, `teamId`, `branch`, `attribution` (`author`/`committer`), `includeBots`, `includeMerges`. Nothing is tied to one organization: any GitHub installation or team structure works, and everything is calculated from stored commits on each request.

## Scripts

| Command | Description |
|---|---|
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint (no `any`, no non-null assertions, explicit return types…) |
| `npm test` | Vitest against a real test database |
| `npm run build` | Compile to `dist/` |
| `npm run migrations:gen` | Generate a SQL migration from schema changes (never edit by hand) |
| `npm run migrations:run` | Apply migrations |
| `npm start` / `npm run start:worker` | Run built API / worker |

Run typecheck, lint and tests before every commit.

## Project structure

```
src/
  index.ts            API entry
  app.ts, factory.ts  Hono app and typed context
  env.ts, config/     the only place environment variables are read
  routes/             wiring only
  handlers/           parse request, call helper, respond
  helpers/            business logic
  services/
    database/         all Drizzle queries
    github/           GitHub App client
  middlewares/        rate limiting, auth (coming)
  validations/        request and payload schemas
  exceptions/         typed HTTP exceptions
  database/           Drizzle client, schema, migration runner
  worker/             background worker entry, jobs and import logic
  utils/, constants/, types/
migrations/           generated SQL migrations
tests/                integration tests
docs/                 conventions, plan, edge cases
```

Layering is strict: `Router → Handler → Helper → DB service`. See [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Deployment (Railway)

Three services from this repo plus Postgres:

| Service | Start command |
|---|---|
| API | `npm start` |
| Worker | `npm run start:worker` |
| PostgreSQL | Railway plugin |

Run `npm run migrations:run` as a release step before each deploy. Health endpoints: `/healthz` (liveness) and `/readyz` (database check).

## Docs

- [Conventions](docs/CONVENTIONS.md)
- [Plan and decisions](docs/PLAN.md)
- [Edge cases checklist](docs/EDGE_CASES.md)
- [Milestone 1 notes](docs/milestone-1.md)
