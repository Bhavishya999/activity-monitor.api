# Edge cases & UI risks — tracked checklist

Status: ✅ handled + tested · 🛠 planned (milestone) · ⚠ limitation to document in the UI

## 1. GitHub data
| Case | Handling | Status |
|---|---|---|
| Same commit on many branches | Unique `(repository_id, sha)`; branch links in `commit_branch` | ✅ |
| Side branch shares history with main | Default branch imported first; side branch stops paging when a page is all-known (shared ancestry stays attributed to the earlier branch) | ✅ ⚠ |
| Commit message / author name contains NUL byte | Stripped before insert (Postgres rejects `\u0000`) | ✅ |
| Repo is empty (409), deleted/renamed/no access (404/410), legal block (451), bad ref (422) | Classified permanent: logged to `sync_error`, run marked failed, **not retried** | ✅ |
| Rate limit / secondary rate limit | `RateLimitError` with reset time; proactive floor (25 remaining); job re-queued at reset; checkpoint kept | ✅ |
| 5xx / network errors | Transient: pg-boss retries with exponential backoff, resumes from checkpoint | ✅ |
| Unresolved author (no GitHub user for the email) | `author_account_id` NULL → shown as **Unassigned**; never guessed from name/email | ✅ |
| Author ≠ committer ≠ pusher | Three separate columns; filter chooses which one counts | ✅ |
| Bot accounts (dependabot, renovate, github-actions) | Stored with type `Bot`; excluded by default, `includeBots=true` toggle | ✅ |
| Force-push / rebase rewrites history | Old SHAs stay (we never delete commits); counted once; ⚠ documented. 🛠 reconcile marks commits no longer reachable from any branch head as `orphaned` | 🛠 ⚠ |
| Deleted branch | Marked `deleted`, commits kept; ⚠ coverage banner: "history reachable only from deleted branches may be incomplete" | ✅ ⚠ |
| Forks (same commits in a fork and its upstream) | 🛠 `repository.is_fork`; analytics option "exclude forks" (default on) to avoid double counting | 🛠 |
| Repo renamed / transferred between orgs | Repo id is stable; `repository` event + discovery refresh `full_name` / `installation_id`; history preserved | ✅ |
| Installation suspended / uninstalled / repo removed from installation | Status flag + `accessible=false`; history kept, no new imports | ✅ |
| Huge repos (100k+ commits) | Page checkpoints, one repo per job, `since` window, no inline imports, singleton keys | ✅ |
| Commits with future timestamps (bad clocks) | Analytics ignore `committed_at > now()`; 🛠 admin "data quality" list | ✅ 🛠 |
| Merge commits inflate counts | `is_merge` stored; `includeMerges=false` filter | ✅ |
| Additions/deletions missing | Nullable until enriched; UI shows `--`, never 0 | ✅ ⚠ |

## 2. Webhooks
| Case | Handling | Status |
|---|---|---|
| Forged / tampered payload | HMAC-SHA256 on exact raw bytes, timing-safe | ✅ |
| Duplicate delivery (GitHub retries) | Unique `delivery_id`; finished deliveries just acknowledged | ✅ |
| Out-of-order deliveries | All writes are upserts; push re-reads the range from the API | ✅ |
| Processing crashes mid-way | Status `failed`, queue retries with backoff, idempotent | ✅ |
| Push with 20+ commits (payload cap) / no user ids | Re-read from API; skipped when all SHAs already stored | ✅ |
| Tag pushes, branch deletion, branch creation with no commits | Ignored / marks branch deleted / no-op | ✅ |
| Missed deliveries (outage) | 🛠 periodic reconciliation compares branch heads and fetches gaps | 🛠 |
| Oversized body / flood | 5 MB cap, per-IP rate limit | ✅ |

## 3. Time & numbers
| Case | Handling | Status |
|---|---|---|
| Day boundaries | All day/hour bucketing done in SQL with `AT TIME ZONE <report tz>` (default Asia/Kolkata); stored UTC; tested at 23:59:59 vs 00:00:00 IST and against UTC | ✅ |
| 4:30 PM report is partial-day, 7:00 AM report is previous full day | Report range computed from tz, stored on `daily_report` | 🛠 |
| Retries creating duplicate reports | Unique `(kind, report_date)` | ✅ schema |
| Commit authored vs committed time | Charts use `committed_at` by default; filter switch to `authored_at` | 🛠 |
| Zero-activity days | Series is zero-filled with `generate_series`; hourly always 24 buckets | ✅ |
| Counts are not productivity | Permanent disclaimer on leaderboards and developer pages | 🛠 |

## 4. Identity & access
| Case | Handling | Status |
|---|---|---|
| One person, several GitHub accounts | Admin-managed `employee_developer_account`; originals untouched | ✅ schema |
| Account linked to two employees | Unique index on `developer_account_id` | ✅ |
| Role checks | Server-side `requireRole` gate on every route; Developers read team analytics per product decision; admin routes get their own gate | ✅ (gate) 🛠 (admin routes) |
| Session theft / CSRF | HttpOnly SameSite=Lax cookie (Secure in production), hashed session ids, CSRF token on mutations, server-side logout, deactivated users rejected | ✅ |
| Dev login in production | Route 404s unless enabled; process refuses to boot if the flag is set in production | ✅ |
| Employee leaves / privacy removal | Anonymise personal fields, keep aggregate counts | 🛠 |
| Secrets in logs | Pino redaction for tokens / cookies / keys; keys never reach the frontend | ✅ |

## 5. UI / UX risks (frontend repo)
| Risk | Plan |
|---|---|
| Empty state on a fresh install looks "broken" | Onboarding card: Connect GitHub App → select installation → run import → progress |
| Import takes hours | Live progress per repo (pages done, commits found, ETA, rate-limit reset time); dashboard shows a "Data still importing — numbers incomplete" banner |
| Partial data mistaken for final numbers | Coverage badge per repo: imported range, last sync, deleted-branch warning |
| Sample data mistaken for real | Permanent "SAMPLE DATA" banner, separate dev database, seed refuses to run in production |
| Layout shift / flicker while loading | Reserved chart heights; per-card skeletons for charts, `--` for single values (per team convention) |
| Charts unreadable with 1 data point or 200 developers | Single-point → stat tile; leaderboards top-N + "others"; pagination and search for developer lists |
| Long repo / branch / commit text | Truncate with tooltip; commit messages show first line; monospace SHA with copy button |
| Timezone confusion | Header shows active timezone; all tooltips state it |
| Colour-only meaning | Colour-blind-safe palette, direct labels, patterns on stacked series, WCAG AA contrast in light and dark |
| Mobile | Tables collapse to cards, charts resize, sidebar becomes a drawer |
| Stale data after webhook | Query refetch on window focus + 60 s polling on the overview; "Updated 2 min ago" label |
| Filter state lost on refresh / unshareable | Filters live in the URL search params (TanStack Router) |
| Error states | Typed error component with request id, retry button; 401 → login redirect, 403 → "no access" page |
| Large exports | Server-side CSV, streamed, with the same filters |

## 6. Test plan additions
- Timezone boundary tests (23:59:59 IST vs 00:00:00 IST; UTC date differs from IST date).
- Analytics aggregation against known fixtures (counts, zero-fill, bot/merge/fork filters, unassigned bucket).
- RBAC matrix test: each role × each endpoint.
- Report idempotency: run the same report twice → one row, one Slack message, one Sheets update.
- Reconciliation: drop a webhook, verify the gap is healed.
