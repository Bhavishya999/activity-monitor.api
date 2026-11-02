import { and, eq, inArray } from "drizzle-orm";
import { one, schema, type Db } from "../../database/client.js";
import { RateLimitError, type GitHubApi, type RateLimit } from "../../services/github/index.js";
import { ensureBranch, ingestCommits, markBranchDeleted } from "./ingest.js";

const { repository, branch, commit, syncRun, syncCheckpoint, syncError } = schema;

/** Park the job before GitHub rejects us: stop when remaining quota is this low. */
export const RATE_LIMIT_FLOOR = 25;
const OVERLAP_MS = 24 * 3_600_000; // re-read one day on incremental runs to tolerate clock skew / late pushes

/** Does what we already imported cover what is being asked for now? */
function covers(prev: { importedFull: boolean; importedSince: Date | null }, want: Date | null): boolean {
  if (prev.importedFull) return true;
  return want !== null && prev.importedSince !== null && prev.importedSince <= want;
}

export type ImportOptions = {
  installationId: number;
  repositoryId: number;
  since: Date | null; // null = full history
  syncRunId: number;
}
export type ImportResult = { branches: number; skippedBranches: number; seen: number; inserted: number }

async function recordRate(db: Db, syncRunId: number, rl: RateLimit) {
  if (rl.remaining === null) return;
  await db.update(syncRun).set({ rateLimitRemaining: rl.remaining, rateLimitResetAt: rl.resetAt }).where(eq(syncRun.id, syncRunId));
  if (rl.remaining < RATE_LIMIT_FLOOR && rl.resetAt && rl.resetAt > new Date()) throw new RateLimitError(rl.resetAt, "rate-limit floor reached");
}

async function knownShas(db: Db, repositoryId: number, shas: string[]): Promise<Set<string>> {
  if (shas.length === 0) return new Set();
  const rows = await db.select({ sha: commit.sha }).from(commit).where(and(eq(commit.repositoryId, repositoryId), inArray(commit.sha, shas)));
  return new Set(rows.map((r) => r.sha));
}

/**
 * Imports commits for every branch of a repository (dedup'd by repo+sha). Resumable: each
 * (run, repo, branch) has a checkpoint with the next page; a RateLimitError or crash leaves
 * the checkpoint intact so a retry continues where it stopped.
 */
export async function importRepository(db: Db, gh: GitHubApi, opts: ImportOptions): Promise<ImportResult> {
  const { installationId, repositoryId, since, syncRunId } = opts;
  const [repo] = await db.select().from(repository).where(eq(repository.id, repositoryId));
  if (!repo) throw new Error(`repository ${repositoryId} not found`);

  // Enumerate branches (paginated).
  const remote: { name: string; sha: string }[] = [];
  for (let page = 1; ; page++) {
    const res = await gh.listBranches(installationId, repo.fullName, page);
    await recordRate(db, syncRunId, res.rateLimit);
    remote.push(...res.items);
    if (!res.hasNext) break;
  }
  const remoteNames = new Set(remote.map((b) => b.name));
  const existing = await db.select().from(branch).where(eq(branch.repositoryId, repositoryId));
  for (const b of existing) if (!remoteNames.has(b.name) && !b.deleted) await markBranchDeleted(db, repositoryId, b.name);

  const result: ImportResult = { branches: remote.length, skippedBranches: 0, seen: 0, inserted: 0 };
  // Default branch first: its commits are stored before other branches, so those can stop at shared history.
  remote.sort((x, y) => Number(y.name === repo.defaultBranch) - Number(x.name === repo.defaultBranch));
  const prevByName = new Map(existing.map((b) => [b.name, b]));

  for (const rb of remote) {
    const prev = prevByName.get(rb.name);
    const previouslyImported = !!prev && prev.lastImportedAt !== null && covers(prev, since);

    // Same head as last time and the window is covered: nothing can have changed.
    if (previouslyImported && prev.lastImportedSha === rb.sha) { result.skippedBranches++; continue; }

    const branchId = await ensureBranch(db, repositoryId, rb.name, rb.sha, rb.name === repo.defaultBranch);
    // Incremental: only read what is newer than the last import (with a small overlap).
    const effectiveSince = previouslyImported && prev.lastImportedAt ? new Date(prev.lastImportedAt.getTime() - OVERLAP_MS) : since;
    const startedAt = new Date();

    await db.insert(syncCheckpoint).values({ syncRunId, repositoryId, branchName: rb.name }).onConflictDoNothing();
    const [cp] = await db.select().from(syncCheckpoint).where(and(
      eq(syncCheckpoint.syncRunId, syncRunId), eq(syncCheckpoint.repositoryId, repositoryId), eq(syncCheckpoint.branchName, rb.name)));
    if (!cp) throw new Error("checkpoint missing");

    if (!cp.completed) {
      for (let page = cp.nextPage; ; page++) {
        const res = await gh.listCommits(installationId, repo.fullName, rb.name, effectiveSince, page);
        const r = await ingestCommits(db, { repositoryId, branchId, commits: res.items, source: "import", syncRunId });
        result.seen += r.seen; result.inserted += r.inserted;
        // First import of a side branch: once a whole page is already stored, deeper history is shared with
        // branches we have; stop instead of re-paging it. (Shared ancestry stays attributed to the earlier branch.)
        const sharedHistory = !previouslyImported && rb.name !== repo.defaultBranch && res.items.length > 0 &&
          (await knownShas(db, repositoryId, res.items.map((c) => c.sha))).size === res.items.length && r.inserted === 0;
        const done = !res.hasNext || sharedHistory;
        await db.update(syncCheckpoint).set({ nextPage: done ? page : page + 1, completed: done, updatedAt: new Date() }).where(eq(syncCheckpoint.id, cp.id));
        await recordRate(db, syncRunId, res.rateLimit); // after persisting progress, so a park loses nothing
        if (done) break;
      }
    }
    await db.update(branch).set({
      lastImportedSha: rb.sha, lastImportedAt: startedAt,
      importedFull: since === null ? true : (prev?.importedFull ?? false) && true,
      importedSince: since === null ? null : (previouslyImported ? prev.importedSince : since),
    }).where(eq(branch.id, branchId));
  }

  await db.update(repository).set({ lastSyncedAt: new Date() }).where(eq(repository.id, repositoryId));
  return result;
}

export async function startSyncRun(db: Db, kind: "import" | "discovery" | "reconcile", installationId: number, repositoryId: number | null, since: Date | null): Promise<number> {
  return one(await db.insert(syncRun).values({ kind, installationId, repositoryId, sinceDate: since, status: "running", startedAt: new Date() }).returning({ id: syncRun.id })).id;
}

export async function finishSyncRun(db: Db, id: number, status: "succeeded" | "failed" | "partial", counts?: { seen: number; inserted: number }): Promise<void> {
  await db.update(syncRun).set({
    status, finishedAt: new Date(),
    ...(counts ? { commitsSeen: counts.seen, commitsInserted: counts.inserted } : {}),
  }).where(eq(syncRun.id, id));
}

export async function logSyncError(db: Db, syncRunId: number | null, repositoryId: number | null, err: unknown, retryable: boolean): Promise<void> {
  const e = err as { message?: string; status?: number };
  await db.insert(syncError).values({ syncRunId, repositoryId, message: String(e?.message ?? err).slice(0, 2000), httpStatus: e?.status ?? null, retryable });
}
