import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import {
  type GitHubApi, type GhAccount, type GhInstallation, type GhRepo, type GhCommit, type RateLimit,
  RateLimitError, GitHubHttpError,
} from "./types.js";

const PER_PAGE = 100;
const ETAG_CACHE_MAX = 500;

type Headers = Record<string, string | number | undefined>;
type Resp<T> = { data: T; headers: Headers }

type RawAccount = { id: number; login: string; type?: string; avatar_url?: string | null; html_url?: string | null }
const ACCOUNT_TYPES = ["Organization", "User", "Bot", "Mannequin"] as const;

function rate(h: Headers): RateLimit {
  const rem = h["x-ratelimit-remaining"], reset = h["x-ratelimit-reset"];
  return { remaining: rem === undefined ? null : Number(rem), resetAt: reset === undefined ? null : new Date(Number(reset) * 1000) };
}
function hasNext(h: Headers): boolean {
  const link = h["link"];
  return typeof link === "string" && /rel="next"/.test(link);
}
function acct(a: RawAccount | null | undefined): GhAccount | null {
  if (!a || typeof a.id !== "number") return null;
  const type = ACCOUNT_TYPES.find((t) => t === a.type) ?? "User";
  return { id: a.id, login: a.login, type, avatarUrl: a.avatar_url ?? null, htmlUrl: a.html_url ?? null };
}
function splitRepo(full: string): { owner: string; repo: string } {
  const [owner, repo] = full.split("/");
  if (!owner || !repo) throw new Error(`invalid repository name: ${full}`);
  return { owner, repo };
}
function statusOf(e: unknown): { status?: number; headers: Headers } {
  if (typeof e === "object" && e !== null) {
    const o = e as { status?: unknown; response?: { headers?: Headers } };
    return { ...(typeof o.status === "number" ? { status: o.status } : {}), headers: o.response?.headers ?? {} };
  }
  return { headers: {} };
}

export type ClientOptions = { appId: string; privateKey: string; baseUrl?: string; fetch?: typeof fetch }

/** Real GitHub client using GitHub App auth. Tokens are minted/cached by octokit; list calls use ETags. */
export function createGitHubClient(opts: ClientOptions): GitHubApi {
  const privateKey = opts.privateKey.replace(/\\n/g, "\n");
  const extra = {
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.fetch ? { request: { fetch: opts.fetch } } : {}),
  };
  const appKit = new Octokit({ authStrategy: createAppAuth, auth: { appId: opts.appId, privateKey }, ...extra });
  const kits = new Map<number, Octokit>();
  const forInstall = (id: number): Octokit => {
    let k = kits.get(id);
    if (!k) {
      k = new Octokit({ authStrategy: createAppAuth, auth: { appId: opts.appId, privateKey, installationId: id }, ...extra });
      kits.set(id, k);
    }
    return k;
  };

  // Conditional requests: a 304 does not count against the rate limit and saves re-parsing identical pages.
  const etags = new Map<string, { etag: string; resp: Resp<unknown> }>();

  async function call<T>(fn: (extraHeaders: Record<string, string>) => Promise<Resp<T>>, cacheKey?: string): Promise<Resp<T>> {
    const cached = cacheKey ? etags.get(cacheKey) : undefined;
    try {
      const r = await fn(cached ? { "if-none-match": cached.etag } : {});
      const etag = r.headers["etag"];
      if (cacheKey && typeof etag === "string") {
        if (etags.size >= ETAG_CACHE_MAX) { const first = etags.keys().next().value; if (first !== undefined) etags.delete(first); }
        etags.set(cacheKey, { etag, resp: r });
      }
      return r;
    } catch (e: unknown) {
      const { status, headers } = statusOf(e);
      if (status === 304 && cached) return cached.resp as Resp<T>;
      if (status === 429 || (status === 403 && (headers["x-ratelimit-remaining"] === "0" || headers["retry-after"] !== undefined))) {
        const retryAfter = headers["retry-after"] !== undefined ? Number(headers["retry-after"]) * 1000 : undefined;
        throw new RateLimitError(retryAfter ? new Date(Date.now() + retryAfter) : (rate(headers).resetAt ?? new Date(Date.now() + 60_000)));
      }
      if (status) throw new GitHubHttpError(status, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  const mapInstall = (i: { id: number; account: RawAccount | null; repository_selection?: string; permissions?: Record<string, string | undefined>; events?: string[]; suspended_at?: string | null }): GhInstallation => {
    const account = acct(i.account);
    if (!account) throw new Error(`installation ${i.id} has no account`);
    const permissions: Record<string, string> = {};
    for (const [k, v] of Object.entries(i.permissions ?? {})) if (v) permissions[k] = v;
    return { id: i.id, account, repositorySelection: i.repository_selection ?? null, permissions, events: i.events ?? [], suspendedAt: i.suspended_at ? new Date(i.suspended_at) : null };
  };

  return {
    async listAppInstallations(page) {
      const r = await call((headers) => appKit.request("GET /app/installations", { per_page: PER_PAGE, page, headers }), `inst:${page}`);
      return { items: r.data.map((i) => mapInstall(i as never)), hasNext: hasNext(r.headers), rateLimit: rate(r.headers) };
    },
    async getInstallation(id) {
      const r = await call((headers) => appKit.request("GET /app/installations/{installation_id}", { installation_id: id, headers }));
      return mapInstall(r.data as never);
    },
    async listRepositories(id, page) {
      const r = await call((headers) => forInstall(id).request("GET /installation/repositories", { per_page: PER_PAGE, page, headers }), `repos:${id}:${page}`);
      const items = r.data.repositories.map((x): GhRepo => ({
        id: Number(x.id), name: x.name, fullName: x.full_name, private: x.private, archived: x.archived,
        defaultBranch: x.default_branch ?? null, htmlUrl: x.html_url ?? null,
        pushedAt: x.pushed_at ? new Date(x.pushed_at) : null, owner: acct(x.owner as RawAccount),
      }));
      return { items, hasNext: hasNext(r.headers), rateLimit: rate(r.headers) };
    },
    async listBranches(id, full, page) {
      const { owner, repo } = splitRepo(full);
      const r = await call((headers) => forInstall(id).request("GET /repos/{owner}/{repo}/branches", { owner, repo, per_page: PER_PAGE, page, headers }), `branches:${id}:${full}:${page}`);
      return { items: r.data.map((b) => ({ name: b.name, sha: b.commit.sha })), hasNext: hasNext(r.headers), rateLimit: rate(r.headers) };
    },
    async listCommits(id, full, ref, since, page) {
      const { owner, repo } = splitRepo(full);
      const r = await call((headers) => forInstall(id).request("GET /repos/{owner}/{repo}/commits", {
        owner, repo, sha: ref, per_page: PER_PAGE, page, headers, ...(since ? { since: since.toISOString() } : {}),
      }));
      const items = r.data.map((c): GhCommit => {
        const authored = c.commit.author?.date ?? c.commit.committer?.date;
        const committed = c.commit.committer?.date ?? c.commit.author?.date;
        if (!authored || !committed) throw new Error(`commit ${c.sha} has no timestamps`);
        return {
          sha: c.sha, message: c.commit.message, htmlUrl: c.html_url ?? null, parentCount: c.parents.length,
          author: acct(c.author as RawAccount | null), committer: acct(c.committer as RawAccount | null),
          authorName: c.commit.author?.name ?? null, committerName: c.commit.committer?.name ?? null,
          authoredAt: new Date(authored), committedAt: new Date(committed),
        };
      });
      return { items, hasNext: hasNext(r.headers), rateLimit: rate(r.headers) };
    },
    async getCommitStats(id, full, sha) {
      const { owner, repo } = splitRepo(full);
      const r = await call((headers) => forInstall(id).request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref: sha, headers }));
      return { additions: r.data.stats?.additions ?? 0, deletions: r.data.stats?.deletions ?? 0, changedFiles: r.data.files?.length ?? 0, rateLimit: rate(r.headers) };
    },
  };
}
