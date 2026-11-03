import { eq, sql } from "drizzle-orm";
import type { Db } from "../../database/client.js";
import { githubAccount, githubInstallation, repository } from "../../database/schema/index.js";

export type GithubAccountRow = {
  installationId: number;
  status: string;
  repositorySelection: string | null;
  lastSyncedAt: Date | null;
  accountId: number;
  login: string;
  type: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
  repoCount: number;
  activeRepoCount: number;
};

export async function listGithubAccounts(db: Db): Promise<GithubAccountRow[]> {
  const rows = await db
    .select({
      installationId: githubInstallation.id,
      status: githubInstallation.status,
      repositorySelection: githubInstallation.repositorySelection,
      lastSyncedAt: githubInstallation.lastSyncedAt,
      accountId: githubAccount.id,
      login: githubAccount.login,
      type: githubAccount.type,
      avatarUrl: githubAccount.avatarUrl,
      htmlUrl: githubAccount.htmlUrl,
      repoCount: sql<number>`cast(count(${repository.id}) as integer)`,
      activeRepoCount: sql<number>`cast(count(${repository.id}) filter (where ${repository.monitored} = true and ${repository.accessible} = true) as integer)`,
    })
    .from(githubInstallation)
    .innerJoin(githubAccount, eq(githubInstallation.accountId, githubAccount.id))
    .leftJoin(repository, eq(repository.installationId, githubInstallation.id))
    .groupBy(
      githubInstallation.id,
      githubInstallation.status,
      githubInstallation.repositorySelection,
      githubInstallation.lastSyncedAt,
      githubAccount.id,
      githubAccount.login,
      githubAccount.type,
      githubAccount.avatarUrl,
      githubAccount.htmlUrl,
    )
    .orderBy(githubInstallation.id);

  return rows;
}
