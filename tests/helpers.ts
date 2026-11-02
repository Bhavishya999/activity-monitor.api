import { sql } from "drizzle-orm";
import { createDb, type Db } from "../src/database/client.js";
import type { GitHubApi, GhAccount, GhCommit, GhInstallation, GhRepo, Page } from "../src/services/github/index.js";
import { RateLimitError } from "../src/services/github/index.js";

export function testDb() {
  const url = process.env["TEST_DATABASE_URL"]!;
  if (!/test/.test(url)) throw new Error("refusing to run against non-test database");
  return createDb(url, 4);
}
export async function reset(db: Db) {
  await db.execute(sql`truncate github_account, developer_account, employee, app_user, webhook_delivery, daily_report, audit_log, setting restart identity cascade`);
}

export const acct = (id: number, login = `user${id}`, type: GhAccount["type"] = "User"): GhAccount =>
  ({ id, login, type, avatarUrl: `https://a/${id}`, htmlUrl: `https://github.com/${login}` });

export const rl = { remaining: 4000, resetAt: new Date(Date.now() + 3600_000) };
function paginate<T>(all: T[], page: number, per: number): Page<T> {
  const items = all.slice((page - 1) * per, page * per);
  return { items, hasNext: page * per < all.length, rateLimit: rl };
}

export function commitOf(sha: string, at: string, author: GhAccount | null = acct(1), parents = 1): GhCommit {
  return { sha, message: `msg ${sha}`, htmlUrl: `https://github.com/o/r/commit/${sha}`, parentCount: parents, author, committer: author,
    authorName: author?.login ?? "Anon", committerName: author?.login ?? "Anon", authoredAt: new Date(at), committedAt: new Date(at) };
}

/** In-memory GitHub. `perPage` is small so pagination is really exercised. */
export class FakeGitHub implements GitHubApi {
  installations = new Map<number, GhInstallation>();
  repos = new Map<number, GhRepo[]>();
  branches = new Map<string, { name: string; sha: string }[]>();
  commits = new Map<string, GhCommit[]>(); // key: full/branch
  perPage = 2;
  calls: string[] = [];
  failCommitsOnceAtPage: number | null = null;
  async listAppInstallations(page: number) { return paginate([...this.installations.values()], page, this.perPage); }
  async getInstallation(id: number) { const i = this.installations.get(id); if (!i) throw new Error("404"); return i; }
  async listRepositories(id: number, page: number) { return paginate(this.repos.get(id) ?? [], page, this.perPage); }
  async listBranches(_id: number, full: string, page: number) { return paginate(this.branches.get(full) ?? [], page, this.perPage); }
  async listCommits(_id: number, full: string, ref: string, since: Date | null, page: number) {
    this.calls.push(`${full}@${ref}#${page}`);
    if (this.failCommitsOnceAtPage === page) { this.failCommitsOnceAtPage = null; throw new RateLimitError(new Date(Date.now() + 1000)); }
    const all = (this.commits.get(`${full}/${ref}`) ?? []).filter((c) => !since || c.committedAt >= since);
    return paginate(all, page, this.perPage);
  }
  async getCommitStats() { return { additions: 1, deletions: 1, changedFiles: 1, rateLimit: rl }; }
}

export function installation(id: number, accountId: number, login: string, type: GhAccount["type"] = "Organization"): GhInstallation {
  return { id, account: acct(accountId, login, type), repositorySelection: "all", permissions: { contents: "read", metadata: "read" }, events: ["push"], suspendedAt: null };
}
export function repo(id: number, full: string, owner: GhAccount): GhRepo {
  const [, name] = full.split("/");
  return { id, name: name!, fullName: full, private: false, archived: false, defaultBranch: "main", htmlUrl: `https://github.com/${full}`, pushedAt: null, owner };
}
