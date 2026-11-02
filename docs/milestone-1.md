# Milestone 1 — GitHub ingestion core

## Run locally
```bash
docker compose up -d   # or use any Postgres; create gam_dev and gam_test
cp .env.example .env
npm install
DATABASE_URL=postgres://gam:gam@localhost:5432/gam_dev npm run db:migrate
npm test
```
API: `npm run dev:api` (needs DATABASE_URL, GITHUB_WEBHOOK_SECRET). Worker: `npm run dev:worker` (also GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY).

## Create the GitHub App (you do this in GitHub; never paste the key in chat)
Settings > Developer settings > GitHub Apps > New.
- Webhook URL: `https://<api-domain>/api/v1/webhooks/github`; Webhook secret: generate 32+ random chars.
- Repository permissions: Metadata (read), Contents (read). Nothing else yet.
- Subscribe to events: Push, Repository (and Installation / Installation repositories are delivered automatically).
- Generate a private key (.pem). Put its contents into `GITHUB_APP_PRIVATE_KEY` (Railway secret), the App ID into `GITHUB_APP_ID`, the webhook secret into `GITHUB_WEBHOOK_SECRET`.
- "Install App" on each organization/account you want monitored; each becomes its own installation.

## Design notes
- Commit identity: unique `(repository_id, sha)`; multiple branches share one commit row via `commit_branch`.
- Imports are queued (pg-boss), resumable via `sync_checkpoint`, and re-queue themselves after the rate-limit reset.
- Webhooks: verified on raw bytes, stored, acknowledged 202, processed by the worker with exponential-backoff retries.
- Push payloads lack GitHub user ids and are capped at 20 commits, so the worker re-reads the pushed range from the API.
- Dev-only audit findings: 4 moderate, all in drizzle-kit's transitive `esbuild` dev server (not shipped to production).

## Known limitations (to address in later milestones)
- No auth yet: no analytics/admin endpoints exist, only the webhook endpoint and health checks.
- Additions/deletions/changed files are not populated yet (needs per-commit enrichment job; `getCommitStats` is ready).
- Periodic reconciliation job and admin-triggered import/discovery API are Milestone 4 (`enqueueInstallationImport` exists).
- Importing every branch re-pages shared history; correct but API-heavy for huge repos.
