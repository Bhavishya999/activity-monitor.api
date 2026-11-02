import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema, type Db } from "../../database/client.js";
import type { GitHubApi, GhAccount, GhInstallation } from "../../services/github/index.js";

const { githubAccount, githubInstallation, repository } = schema;

async function upsertAccount(db: Pick<Db, "insert">, a: GhAccount) {
  await db.insert(githubAccount).values({ id: a.id, login: a.login, type: a.type, avatarUrl: a.avatarUrl, htmlUrl: a.htmlUrl })
    .onConflictDoUpdate({ target: githubAccount.id, set: { login: a.login, type: a.type, avatarUrl: a.avatarUrl, htmlUrl: a.htmlUrl, updatedAt: new Date() } });
}

export async function upsertInstallation(db: Db, inst: GhInstallation): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertAccount(tx, inst.account);
    const status = inst.suspendedAt ? "suspended" : "active";
    await tx.insert(githubInstallation).values({
      id: inst.id, accountId: inst.account.id, status, repositorySelection: inst.repositorySelection,
      permissions: inst.permissions, events: inst.events, suspendedAt: inst.suspendedAt,
    }).onConflictDoUpdate({
      target: githubInstallation.id,
      set: { accountId: inst.account.id, status, repositorySelection: inst.repositorySelection, permissions: inst.permissions, events: inst.events, suspendedAt: inst.suspendedAt, updatedAt: new Date() },
    });
  });
}

/** Discover every repository the installation can currently access. Repos no longer returned are flagged inaccessible (history kept). */
export async function discoverRepositories(db: Db, gh: GitHubApi, installationId: number): Promise<number[]> {
  const inst = await gh.getInstallation(installationId);
  await upsertInstallation(db, inst);

  const seen: number[] = [];
  for (let page = 1; ; page++) {
    const res = await gh.listRepositories(installationId, page);
    await db.transaction(async (tx) => {
      for (const r of res.items) {
        if (r.owner) await upsertAccount(tx, r.owner);
        await tx.insert(repository).values({
          id: r.id, installationId, ownerId: r.owner?.id ?? null, name: r.name, fullName: r.fullName, private: r.private,
          archived: r.archived, defaultBranch: r.defaultBranch, htmlUrl: r.htmlUrl, pushedAt: r.pushedAt, accessible: true,
        }).onConflictDoUpdate({
          target: repository.id,
          set: { installationId, ownerId: r.owner?.id ?? null, name: r.name, fullName: r.fullName, private: r.private, archived: r.archived, defaultBranch: r.defaultBranch, htmlUrl: r.htmlUrl, pushedAt: r.pushedAt, accessible: true, updatedAt: new Date() },
        });
        seen.push(r.id);
      }
    });
    if (!res.hasNext) break;
  }

  const where = seen.length
    ? and(eq(repository.installationId, installationId), notInArray(repository.id, seen))
    : eq(repository.installationId, installationId);
  await db.update(repository).set({ accessible: false, updatedAt: new Date() }).where(where);
  await db.update(githubInstallation).set({ lastSyncedAt: new Date() }).where(eq(githubInstallation.id, installationId));
  return seen;
}

export async function setInstallationStatus(db: Db, installationId: number, status: "active" | "suspended" | "deleted"): Promise<void> {
  await db.update(githubInstallation).set({
    status, suspendedAt: status === "suspended" ? new Date() : null, updatedAt: new Date(),
  }).where(eq(githubInstallation.id, installationId));
}

export async function markReposInaccessible(db: Db, repoIds: number[]): Promise<void> {
  if (!repoIds.length) return;
  await db.update(repository).set({ accessible: false, updatedAt: new Date() }).where(inArray(repository.id, repoIds));
}
