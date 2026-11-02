import { sql } from "drizzle-orm";
import { one, type Db } from "../../database/client.js";
import type { CommitFilters, Page } from "../../types/analytics.types.js";
import { commitFrom, commitWhere, likePattern } from "./commit-filter.js";
import { isoUtc } from "./sql-utils.js";

export type RepositorySort = "commits" | "latest" | "name";

export type RepositoryRow = {
  id: number; full_name: string; private: boolean; archived: boolean; accessible: boolean; monitored: boolean;
  last_synced_at: string | null; account: string; installation_id: number;
  commits: number; contributors: number; latest_commit: string | null;
};

const ORDER = {
  commits: sql`commits desc, rep.full_name`,
  latest: sql`latest_commit desc nulls last, rep.full_name`,
  name: sql`lower(rep.full_name)`,
} as const satisfies Record<RepositorySort, ReturnType<typeof sql>>;

function outerWhere(f: CommitFilters, q: string | null): ReturnType<typeof sql> {
  const conds = [sql`true`];
  if (f.installationId !== null) conds.push(sql`rep.installation_id = ${f.installationId}`);
  if (f.repositoryId !== null) conds.push(sql`rep.id = ${f.repositoryId}`);
  if (q !== null) conds.push(sql`rep.full_name ilike ${likePattern(q)}`);
  return sql.join(conds, sql` and `);
}

const repositorySelect = (f: CommitFilters): ReturnType<typeof sql> => sql`
  select rep.id, rep.full_name, rep.private, rep.archived, rep.accessible, rep.monitored, ${isoUtc(sql`rep.last_synced_at`)} as last_synced_at,
         ga.login as account, rep.installation_id,
         coalesce(a.commits, 0)::int as commits, coalesce(a.contributors, 0)::int as contributors, ${isoUtc(sql`a.latest_commit`)} as latest_commit
  from repository rep
  join github_installation gi on gi.id = rep.installation_id
  join github_account ga on ga.id = gi.account_id
  left join (
    select c.repository_id, count(*) as commits, count(distinct d.id) as contributors, max(c.committed_at) as latest_commit
    ${commitFrom(f)} where ${commitWhere(f)} group by c.repository_id
  ) a on a.repository_id = rep.id`;

export async function listRepositoryRows(db: Db, f: CommitFilters, q: string | null, sort: RepositorySort, p: Page): Promise<RepositoryRow[]> {
  const res = await db.execute<RepositoryRow>(sql`
    ${repositorySelect(f)} where ${outerWhere(f, q)}
    order by ${ORDER[sort]} limit ${p.pageSize} offset ${(p.page - 1) * p.pageSize}`);
  return res.rows;
}

export async function countRepositoryRows(db: Db, f: CommitFilters, q: string | null): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`select count(*)::int as n from repository rep where ${outerWhere(f, q)}`);
  return one(res.rows, "count").n;
}

export async function findRepositoryRow(db: Db, f: CommitFilters, repositoryId: number): Promise<RepositoryRow | null> {
  const res = await db.execute<RepositoryRow>(sql`${repositorySelect(f)} where rep.id = ${repositoryId}`);
  return res.rows[0] ?? null;
}

export type BranchRow = { id: number; name: string; is_default: boolean; deleted: boolean; last_imported_at: string | null; commits: number };

export async function listBranchRows(db: Db, repositoryId: number): Promise<BranchRow[]> {
  const res = await db.execute<BranchRow>(sql`
    select b.id, b.name, b.is_default, b.deleted, ${isoUtc(sql`b.last_imported_at`)} as last_imported_at,
           (select count(*) from commit_branch cb where cb.branch_id = b.id)::int as commits
    from branch b where b.repository_id = ${repositoryId}
    order by b.is_default desc, commits desc, b.name`);
  return res.rows;
}
