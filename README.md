# Git Activity Monitor — API

Production-grade engineering analytics backend for tracking GitHub commit activity across all company repositories, organizations, and developers — fully automated, zero manual work.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Node.js 22+](https://nodejs.org/) (24 LTS on Railway) |
| Language | TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| HTTP framework | [Hono 4](https://hono.dev/) + `@hono/node-server` |
| ORM & migrations | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit |
| Database | PostgreSQL 16 |
| Job queue | [pg-boss 12](https://github.com/timgit/pg-boss) (queued jobs on Postgres, no Redis) |
| GitHub integration | [Octokit](https://github.com/octokit/octokit.js) + GitHub App authentication |
| Validation | [Zod 4](https://zod.dev/) |
| Logging | [Pino](https://getpino.io/) |
| Auth | HttpOnly session cookie + X-CSRF-Token, bcrypt passwords, OTP reset |
| Testing | [Vitest](https://vitest.dev/) |
| Deploy | [Railway](https://railway.app/) |

---

## Architecture

```
Router → Handler → Helper → DB Service
```

```
src/
├── index.ts                  # HTTP server entry
├── app.ts                    # Hono app, router mounts
├── worker/
│   └── main.ts               # Background worker entry (pg-boss)
├── routes/                   # Hono routers (wiring only)
├── handlers/                 # Parse request, call helper, respond
├── helpers/                  # Business logic
├── services/
│   ├── database/             # All Drizzle queries
│   └── github/               # GitHub API client
├── middlewares/              # Session, RBAC, CSRF, validation
├── validations/schemas/      # Zod schemas (prefixed `v`)
├── exceptions/               # Typed exceptions
├── config/
├── env.ts                    # Only file that reads process.env
└── database/
    ├── schema.ts
    └── migrations/
```

---

## API Routes

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | — | Email + password login |
| `POST` | `/api/v1/auth/logout` | Any | Clear session |
| `GET` | `/api/v1/auth/me` | Any | Current user |
| `POST` | `/api/v1/auth/forgot-password` | — | Initiate OTP reset |
| `POST` | `/api/v1/auth/verify-otp` | — | Verify OTP |
| `POST` | `/api/v1/auth/reset-password` | — | Set new password |
| `GET` | `/api/v1/analytics/overview` | SUPER_ADMIN | Company-wide stats |
| `GET` | `/api/v1/analytics/developers` | SUPER_ADMIN | Paginated developer list |
| `GET` | `/api/v1/analytics/developers/:id` | SUPER_ADMIN | Developer detail |
| `GET` | `/api/v1/analytics/repositories` | SUPER_ADMIN | Paginated repository list |
| `GET` | `/api/v1/analytics/repositories/:id` | SUPER_ADMIN | Repository detail |
| `GET` | `/api/v1/analytics/commits` | SUPER_ADMIN | Paginated commit log |
| `GET` | `/api/v1/github-accounts` | ADMIN | GitHub App installations |
| `GET` | `/api/v1/sync/runs` | ADMIN | Sync run history |
| `POST` | `/api/v1/sync/trigger` | ADMIN | Trigger manual sync |
| `GET` | `/api/v1/admin/users` | SUPER_ADMIN | List users |
| `PUT` | `/api/v1/admin/users/:id` | SUPER_ADMIN | Update user role / active |
| `GET` | `/api/v1/admin/settings` | SUPER_ADMIN | App settings |
| `PUT` | `/api/v1/admin/settings` | SUPER_ADMIN | Update a setting |
| `GET` | `/api/v1/admin/audit` | SUPER_ADMIN | Audit log |
| `POST` | `/api/v1/github/webhooks` | — | GitHub App webhook |

---

## Local Development

### Prerequisites

- Node.js 22+
- PostgreSQL 16 running locally

### Database setup

```sql
CREATE USER gam WITH PASSWORD 'gam';
CREATE DATABASE gam_dev  OWNER gam;
CREATE DATABASE gam_test OWNER gam;
```

### Setup

```bash
npm install
```

Create `.env`:

```env
DATABASE_URL=postgresql://gam:gam@localhost:5432/gam_dev
PORT=3000
SESSION_SECRET=<random 64-char string>
CSRF_SECRET=<random 64-char string>
ALLOWED_EMAIL_DOMAIN=yourcompany.com
SUPER_ADMIN_EMAIL=admin@yourcompany.com

# GitHub App (from GitHub App settings)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=

# Optional — SMTP for OTP emails (OTP logs to console if unset)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### Migrate and seed

```bash
npm run migrations:run
npm run seed              # creates the first SUPER_ADMIN from SUPER_ADMIN_EMAIL
```

### Run

```bash
npm run dev               # API server (hot-reload)
npm run dev:worker        # Background worker (separate terminal)
```

### Quality checks

```bash
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm test                  # vitest run
npm run build             # production compile → dist/
```

All three must pass before every commit.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP port (default `3000`) |
| `SESSION_SECRET` | Yes | HMAC key for session signing |
| `CSRF_SECRET` | Yes | HMAC key for CSRF tokens |
| `ALLOWED_EMAIL_DOMAIN` | Yes | Permitted email domain (e.g. `orotron.com`) |
| `SUPER_ADMIN_EMAIL` | Yes | Seeded Super Admin email |
| `GITHUB_APP_ID` | Yes | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes | GitHub App RSA private key (PEM, newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook HMAC secret |
| `SMTP_HOST` | No | SMTP host for OTP emails |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for outbound email |

---

## Deployment (Railway)

Two services on Railway sharing one Postgres:

1. **API** — `npm run build && npm start`
2. **Worker** — `npm run build && npm start:worker`

Set all environment variables in Railway's project environment panel. Never commit secrets.

---

## Security

- CSRF tokens required on all mutating requests (`X-CSRF-Token` header)
- Session cookie is `HttpOnly`, `Secure` (production), `SameSite=Strict`
- Webhook payloads verified with HMAC-SHA256 against the raw request body
- Passwords hashed with bcrypt (cost factor 12)
- RBAC enforced server-side on every route — frontend guards are cosmetic only
- Secrets live in env/Railway only — never in code, logs, or the frontend
