export type RateLimit = { remaining: number | null; resetAt: Date | null }

export type GhAccount = { id: number; login: string; type: "Organization" | "User" | "Bot" | "Mannequin"; avatarUrl: string | null; htmlUrl: string | null }
export type GhInstallation = {
  id: number; account: GhAccount; repositorySelection: string | null;
  permissions: Record<string, string>; events: string[]; suspendedAt: Date | null;
}
export type GhRepo = {
  id: number; name: string; fullName: string; private: boolean; archived: boolean;
  defaultBranch: string | null; htmlUrl: string | null; pushedAt: Date | null; owner: GhAccount | null;
}
export type GhBranch = { name: string; sha: string }
export type GhCommit = {
  sha: string; message: string; htmlUrl: string | null; parentCount: number;
  author: GhAccount | null; committer: GhAccount | null;
  authorName: string | null; committerName: string | null;
  authoredAt: Date; committedAt: Date;
}
export type Page<T> = { items: T[]; hasNext: boolean; rateLimit: RateLimit }

/** Everything the sync code needs from GitHub; faked in tests. */
export type GitHubApi = {
  listAppInstallations(page: number): Promise<Page<GhInstallation>>;
  getInstallation(installationId: number): Promise<GhInstallation>;
  listRepositories(installationId: number, page: number): Promise<Page<GhRepo>>;
  listBranches(installationId: number, repoFullName: string, page: number): Promise<Page<GhBranch>>;
  listCommits(installationId: number, repoFullName: string, ref: string, since: Date | null, page: number): Promise<Page<GhCommit>>;
  getCommitStats(installationId: number, repoFullName: string, sha: string): Promise<{ additions: number; deletions: number; changedFiles: number; rateLimit: RateLimit }>;
}

export class RateLimitError extends Error {
  constructor(public resetAt: Date, message = "GitHub rate limit reached") { super(message); }
}
export class GitHubHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
  get retryable(): boolean { return this.status >= 500 || this.status === 429 || this.status === 403; }
}
