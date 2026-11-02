import { and, eq, sql } from "drizzle-orm";
import { one, schema, type Db } from "../../database/client.js";
import { stripNul, stripNulOrNull } from "../../helpers/text-sanitize-helper.js";
import type { GhAccount, GhCommit } from "../../services/github/index.js";

const { developerAccount, commit, commitBranch, branch } = schema;

export async function upsertDeveloper(db: Pick<Db, "insert">, a: GhAccount): Promise<void> {
  await db.insert(developerAccount).values({
    id: a.id, login: stripNul(a.login), avatarUrl: a.avatarUrl, htmlUrl: a.htmlUrl, type: a.type,
  }).onConflictDoUpdate({
    target: developerAccount.id,
    set: { login: a.login, avatarUrl: a.avatarUrl, htmlUrl: a.htmlUrl, type: a.type, updatedAt: new Date() },
  });
}

export type IngestInput = {
  repositoryId: number;
  branchId: number;
  commits: GhCommit[];
  source: "import" | "webhook" | "reconcile";
  syncRunId?: number;
  pushedAt?: Date;
  pusherId?: number | null;
  pushedShas?: Set<string>; // shas the pusher/pushedAt apply to; default all
}

/**
 * Idempotent: unique on (repository_id, sha). The same commit seen on many branches
 * or re-delivered is stored once; only branch membership and push metadata are added.
 */
export async function ingestCommits(db: Db, input: IngestInput): Promise<{ seen: number; inserted: number }> {
  const { commits } = input;
  if (commits.length === 0) return { seen: 0, inserted: 0 };

  return db.transaction(async (tx) => {
    const accounts = new Map<number, GhAccount>();
    for (const c of commits) { if (c.author) accounts.set(c.author.id, c.author); if (c.committer) accounts.set(c.committer.id, c.committer); }
    for (const a of accounts.values()) await upsertDeveloper(tx, a);

    const rows = commits.map((c) => {
      const pushed = !input.pushedShas || input.pushedShas.has(c.sha);
      return {
        repositoryId: input.repositoryId, sha: c.sha, message: stripNul(c.message),
        authorAccountId: c.author?.id ?? null, committerAccountId: c.committer?.id ?? null,
        pusherAccountId: pushed ? (input.pusherId ?? null) : null,
        authorName: stripNulOrNull(c.authorName), committerName: stripNulOrNull(c.committerName),
        authoredAt: c.authoredAt, committedAt: c.committedAt,
        pushedAt: pushed ? (input.pushedAt ?? null) : null,
        htmlUrl: c.htmlUrl, parentCount: c.parentCount, isMerge: c.parentCount > 1,
        source: input.source, syncRunId: input.syncRunId ?? null,
      };
    });

    // Dedupe within the batch (same sha twice would break ON CONFLICT DO UPDATE).
    const uniq = [...new Map(rows.map((r) => [r.sha, r])).values()];

    const returned = await tx.insert(commit).values(uniq).onConflictDoUpdate({
      target: [commit.repositoryId, commit.sha],
      set: {
        pushedAt: sql`coalesce(${commit.pushedAt}, excluded.pushed_at)`,
        pusherAccountId: sql`coalesce(${commit.pusherAccountId}, excluded.pusher_account_id)`,
        // fill identities if GitHub resolved them later
        authorAccountId: sql`coalesce(${commit.authorAccountId}, excluded.author_account_id)`,
        committerAccountId: sql`coalesce(${commit.committerAccountId}, excluded.committer_account_id)`,
      },
    }).returning({ id: commit.id, inserted: sql<boolean>`(xmax = 0)` });

    await tx.insert(commitBranch).values(returned.map((r) => ({ commitId: r.id, branchId: input.branchId })))
      .onConflictDoNothing();

    return { seen: commits.length, inserted: returned.filter((r) => r.inserted).length };
  });
}

export async function ensureBranch(db: Pick<Db, "insert">, repositoryId: number, name: string, headSha: string | null, isDefault: boolean): Promise<number> {
  const rows = await db.insert(branch).values({ repositoryId, name, headSha, isDefault, deleted: false })
    .onConflictDoUpdate({ target: [branch.repositoryId, branch.name], set: { headSha, isDefault, deleted: false, updatedAt: new Date() } })
    .returning({ id: branch.id });
  return one(rows, "branch").id;
}

export async function markBranchDeleted(db: Db, repositoryId: number, name: string): Promise<void> {
  await db.update(branch).set({ deleted: true, updatedAt: new Date() }).where(and(eq(branch.repositoryId, repositoryId), eq(branch.name, name)));
}
