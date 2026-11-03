import { and, desc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "../../database/client.js";
import { commit, developerAccount, repository } from "../../database/schema/index.js";

export type AnalyticsFilter = {
  dateFrom: Date;
  dateTo: Date;
  tz: string;
  includeMerges: boolean;
  includeBots: boolean;
};

export type CommitRow = {
  id: number;
  sha: string;
  message: string;
  authoredAt: Date;
  committedAt: Date;
  isMerge: boolean;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  htmlUrl: string | null;
  authorId: number | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  repoId: number;
  repoFullName: string;
};

type TrendScope = {
  developerId?: number | undefined;
  repoId?: number | undefined;
};

// Always left-joins developerAccount so bot-type conditions in WHERE are safe.
function buildWhere(filter: AnalyticsFilter, scope?: TrendScope) {
  return and(
    gte(commit.authoredAt, filter.dateFrom),
    lte(commit.authoredAt, filter.dateTo),
    filter.includeMerges ? undefined : eq(commit.isMerge, false),
    filter.includeBots ? undefined : or(isNull(commit.authorAccountId), ne(developerAccount.type, "Bot")),
    scope?.developerId !== undefined ? eq(commit.authorAccountId, scope.developerId) : undefined,
    scope?.repoId !== undefined ? eq(commit.repositoryId, scope.repoId) : undefined,
  );
}

export async function getOverviewTotals(
  db: Db,
  filter: AnalyticsFilter,
): Promise<{ commits: number; repos: number; developers: number }> {
  const rows = await db
    .select({
      commits: sql<number>`cast(count(*) as integer)`,
      repos: sql<number>`cast(count(distinct ${commit.repositoryId}) as integer)`,
      developers: sql<number>`cast(count(distinct ${commit.authorAccountId}) filter (where ${commit.authorAccountId} is not null) as integer)`,
    })
    .from(commit)
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter));

  return rows[0] ?? { commits: 0, repos: 0, developers: 0 };
}

export async function getCommitTrend(
  db: Db,
  filter: AnalyticsFilter,
  scope?: TrendScope,
): Promise<Array<{ date: string; count: number }>> {
  const bucket = sql<string>`date_trunc('day', ${commit.authoredAt} AT TIME ZONE ${filter.tz})`;
  const rows = await db
    .select({ bucket, count: sql<number>`cast(count(*) as integer)` })
    .from(commit)
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter, scope))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((r) => ({ date: String(r.bucket).slice(0, 10), count: r.count }));
}

export async function getHourlyActivity(
  db: Db,
  filter: AnalyticsFilter,
  scope?: TrendScope,
): Promise<Array<{ hour: number; count: number }>> {
  const hourExpr = sql<number>`extract(hour from ${commit.authoredAt} AT TIME ZONE ${filter.tz})::integer`;
  const rows = await db
    .select({ hour: hourExpr, count: sql<number>`cast(count(*) as integer)` })
    .from(commit)
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter, scope))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((r) => ({ hour: r.hour, count: r.count }));
}

export async function getTopRepos(
  db: Db,
  filter: AnalyticsFilter,
  limit: number,
): Promise<Array<{ id: number; fullName: string; count: number }>> {
  const rows = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(commit)
    .innerJoin(repository, eq(commit.repositoryId, repository.id))
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter))
    .groupBy(repository.id, repository.fullName)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows;
}

export async function getTopContributors(
  db: Db,
  filter: AnalyticsFilter,
  limit: number,
): Promise<Array<{ id: number; login: string; avatarUrl: string | null; count: number }>> {
  // Inner join: only commits with a known author; bot filter without the IS NULL branch.
  const rows = await db
    .select({
      id: developerAccount.id,
      login: developerAccount.login,
      avatarUrl: developerAccount.avatarUrl,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(commit)
    .innerJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(
      and(
        gte(commit.authoredAt, filter.dateFrom),
        lte(commit.authoredAt, filter.dateTo),
        filter.includeMerges ? undefined : eq(commit.isMerge, false),
        filter.includeBots ? undefined : ne(developerAccount.type, "Bot"),
      ),
    )
    .groupBy(developerAccount.id, developerAccount.login, developerAccount.avatarUrl)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows;
}

export async function listDevelopers(
  db: Db,
  filter: AnalyticsFilter,
  page: number,
  pageSize: number,
): Promise<Array<{ id: number; login: string; avatarUrl: string | null; type: string; commitCount: number; lastCommittedAt: Date | null }>> {
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      id: developerAccount.id,
      login: developerAccount.login,
      avatarUrl: developerAccount.avatarUrl,
      type: developerAccount.type,
      commitCount: sql<number>`cast(count(${commit.id}) as integer)`,
      lastCommittedAt: sql<Date | null>`max(${commit.authoredAt})`,
    })
    .from(commit)
    .innerJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(
      and(
        gte(commit.authoredAt, filter.dateFrom),
        lte(commit.authoredAt, filter.dateTo),
        filter.includeMerges ? undefined : eq(commit.isMerge, false),
        filter.includeBots ? undefined : ne(developerAccount.type, "Bot"),
      ),
    )
    .groupBy(developerAccount.id, developerAccount.login, developerAccount.avatarUrl, developerAccount.type)
    .orderBy(desc(sql`count(${commit.id})`))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

export async function countDevelopersWithCommits(db: Db, filter: AnalyticsFilter): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(distinct ${developerAccount.id}) as integer)` })
    .from(commit)
    .innerJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(
      and(
        gte(commit.authoredAt, filter.dateFrom),
        lte(commit.authoredAt, filter.dateTo),
        filter.includeMerges ? undefined : eq(commit.isMerge, false),
        filter.includeBots ? undefined : ne(developerAccount.type, "Bot"),
      ),
    );

  return rows[0]?.count ?? 0;
}

export async function getDeveloperById(
  db: Db,
  id: number,
): Promise<{ id: number; login: string; avatarUrl: string | null; type: string } | null> {
  const rows = await db
    .select({
      id: developerAccount.id,
      login: developerAccount.login,
      avatarUrl: developerAccount.avatarUrl,
      type: developerAccount.type,
    })
    .from(developerAccount)
    .where(eq(developerAccount.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function getDeveloperRepoBreakdown(
  db: Db,
  id: number,
  filter: AnalyticsFilter,
): Promise<Array<{ repoId: number; fullName: string; count: number }>> {
  const rows = await db
    .select({
      repoId: repository.id,
      fullName: repository.fullName,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(commit)
    .innerJoin(repository, eq(commit.repositoryId, repository.id))
    .where(
      and(
        eq(commit.authorAccountId, id),
        gte(commit.authoredAt, filter.dateFrom),
        lte(commit.authoredAt, filter.dateTo),
        filter.includeMerges ? undefined : eq(commit.isMerge, false),
      ),
    )
    .groupBy(repository.id, repository.fullName)
    .orderBy(desc(sql`count(*)`));

  return rows;
}

export async function listRepositories(
  db: Db,
  filter: AnalyticsFilter,
  page: number,
  pageSize: number,
): Promise<Array<{
  id: number;
  fullName: string;
  name: string;
  private: boolean;
  archived: boolean;
  monitored: boolean;
  accessible: boolean;
  commitCount: number;
  lastCommittedAt: Date | null;
}>> {
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      name: repository.name,
      private: repository.private,
      archived: repository.archived,
      monitored: repository.monitored,
      accessible: repository.accessible,
      commitCount: sql<number>`cast(count(${commit.id}) as integer)`,
      lastCommittedAt: sql<Date | null>`max(${commit.authoredAt})`,
    })
    .from(commit)
    .innerJoin(repository, eq(commit.repositoryId, repository.id))
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter))
    .groupBy(
      repository.id,
      repository.fullName,
      repository.name,
      repository.private,
      repository.archived,
      repository.monitored,
      repository.accessible,
    )
    .orderBy(desc(sql`count(${commit.id})`))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

export async function countRepositoriesWithCommits(db: Db, filter: AnalyticsFilter): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(distinct ${commit.repositoryId}) as integer)` })
    .from(commit)
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter));

  return rows[0]?.count ?? 0;
}

export async function getRepositoryById(
  db: Db,
  id: number,
): Promise<{
  id: number;
  fullName: string;
  name: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
} | null> {
  const rows = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      name: repository.name,
      private: repository.private,
      archived: repository.archived,
      defaultBranch: repository.defaultBranch,
      htmlUrl: repository.htmlUrl,
    })
    .from(repository)
    .where(eq(repository.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function getRepositoryContributors(
  db: Db,
  id: number,
  filter: AnalyticsFilter,
  limit: number,
): Promise<Array<{ id: number; login: string; avatarUrl: string | null; count: number }>> {
  const rows = await db
    .select({
      id: developerAccount.id,
      login: developerAccount.login,
      avatarUrl: developerAccount.avatarUrl,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(commit)
    .innerJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(
      and(
        eq(commit.repositoryId, id),
        gte(commit.authoredAt, filter.dateFrom),
        lte(commit.authoredAt, filter.dateTo),
        filter.includeMerges ? undefined : eq(commit.isMerge, false),
        filter.includeBots ? undefined : ne(developerAccount.type, "Bot"),
      ),
    )
    .groupBy(developerAccount.id, developerAccount.login, developerAccount.avatarUrl)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows;
}

export async function listCommits(
  db: Db,
  filter: AnalyticsFilter,
  options: { page: number; pageSize: number; repoId?: number | undefined; developerId?: number | undefined },
): Promise<CommitRow[]> {
  const offset = (options.page - 1) * options.pageSize;
  const rows = await db
    .select({
      id: commit.id,
      sha: commit.sha,
      message: commit.message,
      authoredAt: commit.authoredAt,
      committedAt: commit.committedAt,
      isMerge: commit.isMerge,
      additions: commit.additions,
      deletions: commit.deletions,
      changedFiles: commit.changedFiles,
      htmlUrl: commit.htmlUrl,
      authorId: developerAccount.id,
      authorLogin: developerAccount.login,
      authorAvatarUrl: developerAccount.avatarUrl,
      repoId: repository.id,
      repoFullName: repository.fullName,
    })
    .from(commit)
    .innerJoin(repository, eq(commit.repositoryId, repository.id))
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter, { repoId: options.repoId, developerId: options.developerId }))
    .orderBy(desc(commit.authoredAt))
    .limit(options.pageSize)
    .offset(offset);

  return rows;
}

export async function countCommits(
  db: Db,
  filter: AnalyticsFilter,
  options: { repoId?: number | undefined; developerId?: number | undefined },
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(commit)
    .leftJoin(developerAccount, eq(commit.authorAccountId, developerAccount.id))
    .where(buildWhere(filter, { repoId: options.repoId, developerId: options.developerId }));

  return rows[0]?.count ?? 0;
}
