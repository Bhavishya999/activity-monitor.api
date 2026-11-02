import { sql } from "drizzle-orm";
import { one, type Db } from "../../database/client.js";
import type { CommitFilters, Page } from "../../types/analytics.types.js";
import { commitFrom, commitWhere, likePattern, whoColumn } from "./commit-filter.js";
import { isoUtc } from "./sql-utils.js";

export type DeveloperSort = "commits" | "latest" | "name";

export type DeveloperRow = {
  id: number; login: string; avatar_url: string | null; type: string; commits: number; repositories: number; merges: number;
  first_commit: string; latest_commit: string; additions: number | null; deletions: number | null;
  employee_id: number | null; employee_name: string | null;
};

const ORDER = {
  commits: sql`commits desc, d.login`,
  latest: sql`latest_commit desc, d.login`,
  name: sql`lower(d.login)`,
} as const satisfies Record<DeveloperSort, ReturnType<typeof sql>>;

function developerSearch(q: string | null): ReturnType<typeof sql> {
  if (q === null) return sql`true`;
  const like = likePattern(q);
  return sql`(d.login ilike ${like} or e.display_name ilike ${like})`;
}

const employeeJoin = sql`left join employee_developer_account eda on eda.developer_account_id = d.id left join employee e on e.id = eda.employee_id`;

export async function listDeveloperRows(db: Db, f: CommitFilters, q: string | null, sort: DeveloperSort, p: Page): Promise<DeveloperRow[]> {
  const res = await db.execute<DeveloperRow>(sql`
    select d.id, d.login, d.avatar_url, d.type::text as type,
           count(*)::int as commits, count(distinct c.repository_id)::int as repositories,
           (count(*) filter (where c.is_merge))::int as merges,
           ${isoUtc(sql`min(c.committed_at)`)} as first_commit, ${isoUtc(sql`max(c.committed_at)`)} as latest_commit,
           sum(c.additions)::int as additions, sum(c.deletions)::int as deletions,
           e.id as employee_id, e.display_name as employee_name
    ${commitFrom(f)} ${employeeJoin}
    where ${commitWhere(f)} and d.id is not null and ${developerSearch(q)}
    group by d.id, d.login, d.avatar_url, d.type, e.id, e.display_name
    order by ${ORDER[sort]}
    limit ${p.pageSize} offset ${(p.page - 1) * p.pageSize}`);
  return res.rows;
}

export async function countDeveloperRows(db: Db, f: CommitFilters, q: string | null): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`
    select count(distinct d.id)::int as n ${commitFrom(f)} ${employeeJoin}
    where ${commitWhere(f)} and d.id is not null and ${developerSearch(q)}`);
  return one(res.rows, "count").n;
}

export type ProfileRow = { id: number; login: string; avatar_url: string | null; html_url: string | null; type: string };
export type LinkedAccountRow = { employee_id: number; employee_name: string; id: number; login: string; avatar_url: string | null };
export type DeveloperSummaryRow = {
  commits: number; repositories: number; merges: number; additions: number | null; deletions: number | null;
  first_in_range: string | null; latest_in_range: string | null;
};
export type LifetimeRow = { first_commit: string | null; latest_commit: string | null; total: number };
export type RepoBreakdownRow = { id: number; name: string; commits: number; latest_commit: string };

export async function findProfile(db: Db, developerId: number): Promise<ProfileRow | null> {
  const res = await db.execute<ProfileRow>(sql`select id, login, avatar_url, html_url, type::text as type from developer_account where id = ${developerId}`);
  return res.rows[0] ?? null;
}

/** Every GitHub account linked to the same employee as this one (including itself). */
export async function listLinkedAccounts(db: Db, developerId: number): Promise<LinkedAccountRow[]> {
  const res = await db.execute<LinkedAccountRow>(sql`
    select e.id as employee_id, e.display_name as employee_name, a.id, a.login, a.avatar_url
    from employee_developer_account mine
    join employee e on e.id = mine.employee_id
    join employee_developer_account sib on sib.employee_id = e.id
    join developer_account a on a.id = sib.developer_account_id
    where mine.developer_account_id = ${developerId} order by a.login`);
  return res.rows;
}

export async function getDeveloperSummary(db: Db, f: CommitFilters): Promise<DeveloperSummaryRow> {
  const res = await db.execute<DeveloperSummaryRow>(sql`
    select count(*)::int as commits, count(distinct c.repository_id)::int as repositories,
           (count(*) filter (where c.is_merge))::int as merges,
           sum(c.additions)::int as additions, sum(c.deletions)::int as deletions,
           ${isoUtc(sql`min(c.committed_at)`)} as first_in_range, ${isoUtc(sql`max(c.committed_at)`)} as latest_in_range
    ${commitFrom(f)} where ${commitWhere(f)}`);
  return one(res.rows, "summary");
}

/** All-time first/latest commit, independent of the selected range. */
export async function getLifetime(db: Db, f: CommitFilters, developerId: number): Promise<LifetimeRow> {
  const who = whoColumn(f);
  const res = await db.execute<LifetimeRow>(sql`
    select ${isoUtc(sql`min(c.committed_at)`)} as first_commit, ${isoUtc(sql`max(c.committed_at)`)} as latest_commit, count(*)::int as total
    from "commit" c join repository r on r.id = c.repository_id
    where ${who} = ${developerId} and r.monitored = true and c.committed_at <= now()`);
  return one(res.rows, "lifetime");
}

export async function getRepositoryBreakdown(db: Db, f: CommitFilters): Promise<RepoBreakdownRow[]> {
  const res = await db.execute<RepoBreakdownRow>(sql`
    select r.id, r.full_name as name, count(*)::int as commits, ${isoUtc(sql`max(c.committed_at)`)} as latest_commit
    ${commitFrom(f)} where ${commitWhere(f)}
    group by r.id, r.full_name order by commits desc, r.full_name`);
  return res.rows;
}
