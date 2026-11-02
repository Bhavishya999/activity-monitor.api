# Git Activity Monitor — Architecture Plan

## Final stack (agreed)
| Layer | Choice |
|---|---|
| Frontend | TanStack Start 1.169.4 (stable `latest`) + TanStack Router/Query/Table, React 19, Vite, Tailwind 4, shadcn/ui + Radix, Recharts, React Hook Form + Zod |
| API | Hono 4.13 + @hono/node-server, `@hono/zod-validator`, Hono RPC for typed client |
| Database | PostgreSQL (local 16, prod 18) |
| ORM / migrations | Drizzle ORM 0.45.4 + drizzle-kit 0.31.11 (SQL migrations committed) — **Prisma dropped** |
| Jobs | pg-boss 12 (queue on Postgres, no Redis) |
| GitHub | GitHub App, @octokit/app, webhooks |
| Deploy | Railway: web, api, worker, Postgres |
| Language/runtime | TypeScript (pinned stable; TS 7.0 too new until tooling confirms), Node 24 LTS on Railway (22 locally) |

Version policy: only npm `latest` stable. Rejected: Prisma 8.0.0-rc, Drizzle 1.0 betas, TanStack alpha/beta/pre.

## Environment
- Greenfield workspace. Local Postgres 16 running; databases `gam_dev` and `gam_test` created (dev-only credentials, never committed to production config).

## Architecture (monorepo, npm workspaces)
- `apps/web` — TanStack Start (SSR). Thin BFF only: forwards session cookie to the API. No business logic, no DB access, no secrets.
- `apps/api` — Hono REST `/api/v1`: auth, RBAC, analytics, admin, GitHub webhook receiver (raw body + HMAC).
- `apps/worker` — pg-boss consumers + cron schedules (4:30 PM and 7:00 AM Asia/Kolkata): imports, webhook processing, discovery, reconciliation, report, Slack, Sheets.
- `packages/db` — Drizzle schema, migrations, client. `packages/shared` — Zod schemas/types. `packages/github` — App auth, pagination, rate-limit handling.
- Webhooks go directly to the Hono API, never through Start.

## Key decisions
- Webhook: verify HMAC-SHA256 on raw bytes (timing-safe) -> persist `webhook_delivery` (unique delivery id) -> 202 -> enqueue.
- Commit unique `(repository_id, sha)`; branch membership in `commit_branch`; upsert = idempotent.
- Import: per-repo/per-branch checkpoints, resumable, 90 days default or full; honors `x-ratelimit-*`/`retry-after`; deleted-branch history reported as partial coverage.
- Identity: GitHub numeric user id only; no name/email guessing; unresolved = "unassigned"; admin-managed employee linking.
- Stats (additions/deletions/files) need per-commit detail calls -> lazy enrichment queue.
- Auth: Google/Entra OIDC (arctic), DB sessions, HttpOnly Secure SameSite cookie, CSRF on mutations, domain allow-list, Hono secure-headers/CORS/rate-limit. RBAC enforced in API per route.
- Time: UTC storage; day boundaries via `AT TIME ZONE` in configured TZ (default Asia/Kolkata).
- Reports: one canonical `daily_report` keyed (kind, report_date); Slack and Sheets deliver independently with own status.

## Entities
github_installation 1-1 github_account; installation 1-N repository 1-N branch; repository 1-N commit (unique repo+sha); commit N-N branch; commit -> developer_account (author, committer, nullable); developer_account N-N employee; installation/repository 1-N sync_run 1-N sync_checkpoint/sync_error; webhook_delivery; user 1-N session; role N-N permission; audit_log; daily_report 1-N report_execution/slack_delivery/google_sheets_sync; setting.

## Folder structure
```
git-activity-monitor/
  apps/{web,api,worker}/src
  packages/{db,shared,github}/src
  docs/{architecture,deployment,env}.md
  docker-compose.yml  railway.toml  .env.example
```

## Needed from you (set as env vars / Railway secrets, never paste in chat)
1. GitHub App (Metadata RO, Contents RO; events push/repository/installation/installation_repositories): App ID, private key, webhook secret, client id/secret. Setup guide will be provided.
2. Google OAuth client or Entra app, company email domain, first ADMIN email.
3. Slack incoming webhook URL.
4. Google service account + spreadsheet ID (shared with it).
5. Railway access; public webhook URL (Railway domain or ngrok locally).

## Engineering standards (added)
- **Strict TypeScript everywhere:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`; tests are typechecked too; `@typescript-eslint/no-explicit-any` is an error; external data is parsed with Zod, not cast. CI gate: `npm run typecheck && npm run lint && npm test`.
- **Frugal GitHub API usage (no repeated fetching):**
  - Skip a branch whose head SHA equals the last imported SHA (and whose imported window covers the request).
  - Incremental runs fetch only `since` the last import (small overlap), never full re-pagination.
  - Default branch first; a non-default branch stops paging once it reaches commits already stored.
  - ETag conditional requests (304 does not consume rate limit) for repository and branch lists.
  - Webhook pushes skip the API call when every pushed SHA is already stored.
  - Proactive rate-limit guard: park the job until reset when remaining quota is low, instead of hitting 403s.
  - Singleton job keys prevent duplicate queued imports; stats enrichment only touches commits still missing stats.
  - Pagination is always page-by-page with a checkpoint after each page (resumable, never refetches completed pages).
- **Dashboard & data presentation:** two levels everywhere — *organization-wide* charts (commit trend, hourly activity, repository distribution, contributor leaderboard, activity calendar) and *per-developer* views (own trend, repository breakdown, hourly pattern, activity calendar, commit history). Server does all aggregation in PostgreSQL (timezone-aware); the UI only renders. Dark/light themes, skeleton/empty/error states, responsive. Commit counts are shown with a "not a productivity metric" note.
- **Sample data policy:** the dashboard only ever shows real GitHub data. For UI development a separate, clearly labelled sample dataset can be seeded into a dev-only database; the API flags it (`sample: true`) and the UI shows a permanent "SAMPLE DATA" banner. The seed script refuses to run in production.
- **Auth for dashboard work:** analytics endpoints sit behind session + RBAC middleware from day one. A dev-only login exists for local UI work and is hard-disabled when `NODE_ENV=production`; Google/Entra OIDC replaces it in Milestone 2.

## Production conventions (modelled on a production-deployed reference app)
- **One router per domain** in `apps/api/src/routes/` (`overview`, `developers`, `repositories`, `commits`, `integrations`, `sync`, `reports`, `admin`, `auth`, `webhooks`), each mounted under `/api/v1`, every input validated with a schema, thin handlers, logic in `services/`.
- **Permission gates, not ad-hoc checks:** a `requirePermission("analytics:read:all")` middleware on every route; scope resolution (ADMIN all, MANAGER org-wide, DEVELOPER own accounts) in one place.
- **Numbered, committed SQL migrations** (Drizzle Kit) applied by a release step before deploy; never edit an applied migration.
- **Structured logging with request IDs** (JSON, redacts tokens/keys/cookies); health + readiness endpoints.
- **Environments:** dev / uat / prod as separate Railway environments with their own DB and GitHub App; config only via env, validated at boot (fail fast).
- **CI gate on every PR:** typecheck, lint, tests against a throwaway Postgres, `npm audit`; deploy only from main.
- **Frontend layout:** feature folders (`features/overview`, `features/developers`, ...), shared UI kit, one typed API client, TanStack Query for all server state, route-level loading/error/empty states.
- **Admin surfaces expected by a real CRM-style product:** roles/permissions screen, audit log viewer, sync/job status, settings (timezone, visibility policy).
- **Data privacy:** a contact/employee removal path that anonymises personal fields but keeps aggregate commit counts intact.

## Repository split (decided)
Two separate repos, created by the user on GitHub; code is pushed only after the user confirms the repo URLs.
- **Backend repo** (API + worker + DB): flattened to the reference layout — single package, `src/{routes,handlers,helpers,services,middlewares,validations,exceptions,database,config,utils,constants,types,seeders}`, `src/index.ts` (API) and `src/worker/main.ts` (worker) as two Railway services from one repo, `migrations/` at root, GitHub client under `src/services/github/`. `docs/CONVENTIONS.md` is binding.
- **Frontend repo**: Vite + React 19 + TypeScript + TanStack Router (file-based) + TanStack Query + shadcn/ui + Tailwind 4 + Recharts, laid out exactly like the reference (`routes/`, `components/<domain>`, `hooks/`, `https/services/`, `lib/`). Because that layout is a single-page app, **TanStack Start (SSR) is replaced by the Vite SPA** for this internal login-only dashboard; the API contract is mirrored in `lib/interfaces/`.
- Conventions: see `docs/CONVENTIONS.md` (saved from the team guide).

## Status
- **Milestone 1: done** (23 tests passing): schema/migrations, GitHub App auth, multi-installation discovery, resumable branch-aware import, signed webhooks + async processing.
- **In progress:** strict-TS hardening, API-call efficiency pass, analytics API, dashboard (pulled forward from Milestone 3, with minimal auth guard).

## Milestones
1. **(in progress)** Scaffold, Drizzle schema + migrations, GitHub App auth, multi-installation, repo discovery, commit import, webhooks, tests (mocked GitHub + `gam_test`).
2. Auth, employees, RBAC, protected APIs.
3. Dashboard UI in TanStack Start, analytics, commit explorer, filters.
4. Background sync UI, reconciliation, error handling.
5. Slack, Google Sheets, automated reports.
6. Testing, security review, Railway deployment, docs.
