# CLAUDE.md — activity-monitor.api (backend)

Read this first. Frontend repo: `activity-monitor.app` (has its own CLAUDE.md). Full detail: `docs/PLAN.md`, `docs/CONVENTIONS.md`, `docs/EDGE_CASES.md`.

## What we are building
**Git Activity Monitor**: an internal, production-grade engineering-analytics product for our company. It automatically collects commits from **many GitHub organizations/accounts and all their authorized repositories**, attributes them to developers by **GitHub identity**, and shows interactive analytics (company-wide and per developer / per repository). The goal is **zero manual work**: commit tracking and daily reporting happen automatically (reports at **4:30 PM IST** for today-so-far and **7:00 AM IST** for the previous day) and go to Slack and Google Sheets.

- Multi-tenant over GitHub: many installations → many repos → many developers. Single-org use is just one installation.
- Real GitHub data only. Never fabricate commits or stats. Sample data is allowed only in a separate dev database, clearly labelled, never in production.
- Commit counts are **not** a productivity measure; the UI says so.

## Decisions: company, login, roles (confirmed by user)
- **Single company for first launch** (domain `orotron.com`, supplied via `ALLOWED_EMAIL_DOMAIN`, never hardcoded). GitHub side stays multi-installation (several GitHub orgs/accounts can be connected).
- **Login:** company Zoho accounts via OAuth2/OpenID Connect (Zoho Accounts / Zoho Directory SSO if the company has it; otherwise another company IdP). Needs: Zoho API Console client id/secret, redirect URI, and the Zoho data-center domain (`accounts.zoho.com|.in|.eu`…). Provider is behind an interface so it can be swapped.
- **Access control:** a company email is NOT enough. Only employees invited/approved by an Admin can sign in. No public sign-up. First Super Admin is seeded from `SUPER_ADMIN_EMAIL`.
- **Roles:** `DEVELOPER` (own activity + team analytics), `ADMIN` (employees, GitHub connections, repositories, reports), `SUPER_ADMIN` (everything incl. settings and role management). Replaces the earlier ADMIN/MANAGER/DEVELOPER enum; migrate `role_name` when the auth milestone starts.
- GitHub accounts are linked to employees separately (admin-managed); commits are always attributed by GitHub identity.
- Open item: confirm whether the company has Zoho Directory/Zoho One (affects how login is configured).

## Stack (pinned stable versions only; no alpha/beta/rc)
Node 22 locally / 24 LTS on Railway · TypeScript 5.9 strict · Hono 4 + @hono/node-server · Drizzle ORM + drizzle-kit (SQL migrations) · PostgreSQL · pg-boss (queue on Postgres, no Redis) · Zod · Pino · Octokit (GitHub App auth) · Vitest. Deploy: Railway (api, worker, Postgres). Frontend: Vite + React + TanStack Router/Query + shadcn/Tailwind + Recharts (separate repo).

## Architecture rules (strict, no layer skipping)
`Router → Handler → Helper → DB Service`; external systems (GitHub, Slack, Sheets) are wrapped in `services/` and called from helpers only.
- `routes/` wiring only · `handlers/` parse+respond · `helpers/` business logic · `services/database/` ALL Drizzle queries · `middlewares/` · `validations/schemas/<domain>/` (schema names prefixed `v`) · `exceptions/` (throw typed exceptions, never raw `Error`/`c.json({error})`) · `config/` + `env.ts` (only `env.ts` reads `process.env`).
- Entry points: `src/index.ts` (API) and `src/worker/main.ts` (worker).
- Known debt: `src/worker/services/*` still mixes logic and queries, and the schema is one file. Refactor into helpers + db-services (tests are the safety net).

## Non-negotiable product rules
- Commit unique key `(repository_id, sha)`; ingestion idempotent; a commit on many branches counts once.
- Identity = GitHub numeric user id. **Never guess from name/email.** Unresolved → "Unassigned". Author, committer, pusher are separate.
- Webhooks: verify HMAC-SHA256 on the **exact raw body**, persist `webhook_delivery`, return 202, process asynchronously.
- Never import large histories inside HTTP requests; use queued jobs with checkpoints; respect rate limits; do not re-fetch what is already stored (skip unchanged branches, incremental `since`, ETags, stop at shared history).
- Dates: store UTC; bucket in SQL with `AT TIME ZONE` (default Asia/Kolkata, admin-configurable).
- RBAC enforced on the server for every route (DEVELOPER / ADMIN / SUPER_ADMIN). Never trust frontend guards.
- Secrets only in env/Railway; never in code, logs, chat or the frontend. Never ask the user to paste keys/tokens.

## TypeScript & code rules (enforced by `npm run lint` + tsc)
Strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitReturns` + `noUnusedLocals`. No `any` (use `unknown` + narrowing), no `!`, no unnarrowed `as`, no enums (const object + derived type), `type` for shapes / `interface` only when extending, explicit return types on exports, `satisfies`/`as const`/`Readonly` where apt. Files kebab-case; handlers `handleX`; helpers are verbs; constants SCREAMING_SNAKE; booleans `is/has/can`. No barrel files that re-export everything. Comments explain *why* only.

## Commands
```bash
npm install
npm run typecheck && npm run lint && npm test   # must pass before every commit
npm run build
npm run migrations:gen      # after schema changes; never hand-edit migrations
npm run migrations:run
npm run dev | npm run dev:worker
```
Local DB: Postgres on :5432 with `gam_dev` and `gam_test` (user/pass `gam`/`gam`, dev only). In the cloud sandbox Postgres can stop; restart with `pg_ctlcluster 16 main start`. Tests refuse to run against a non-"test" database.

## Workflow
- **Commit identity:** commits are authored only by the user (Bhavishya999). Never add `Co-Authored-By` lines, Claude/session links, or "Generated with" footers to commit messages, PR descriptions or files. Keep messages short and descriptive.
- One deployable change per commit, no "WIP". Commit/push only when the user asks. Don't create PRs unless asked. Don't commit `dist/` (Railway builds).
- Before coding a feature: check `docs/EDGE_CASES.md`; add tests for each edge case you handle and tick it off there.
- Milestones: 1 ingestion ✅ · 2 auth/RBAC/employees · 3 analytics API + dashboard · 4 sync UI/reconciliation · 5 Slack/Sheets/reports · 6 hardening/deploy/docs. Update `docs/PLAN.md` when decisions change.

## Status (update as you go)
Done: schema+migrations, GitHub App client, multi-installation discovery, resumable branch-aware import, signed webhooks + async processing, strict-TS/lint, API layering, sessions + CSRF + role gate (dev-only login), analytics API (overview, developers, repositories, commits) with timezone-correct bucketing, teams (admin CRUD, audited) + generic group-by breakdown (organization/repository/developer/team), 104 tests.
Next: frontend scaffold + Overview dashboard → worker/schema cleanup to the layering rules → Zoho OIDC login + invites + admin routes → reports/Slack/Sheets.
Waiting on user: GitHub App credentials; Zoho API Console client + data center; Slack webhook; Google service account.
