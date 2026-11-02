import { sql } from "drizzle-orm";
import { one, type Db } from "../../database/client.js";
import type { CommitFilters } from "../../types/analytics.types.js";
import { commitFrom, commitWhere, whoColumn } from "./commit-filter.js";
import { isoUtc } from "./sql-utils.js";

export type TotalsRow = { commits: number; developers: number; active_repositories: number; unassigned: number; merges: number };
export type TrendRow = { day: string; commits: number };
export type HourRow = { hour: number; commits: number };
export type NamedCountRow = { id: number; name: string; commits: number };
export type LeaderRow = { id: number | null; login: string | null; avatar_url: string | null; type: string | null; commits: number; repositories: number };
export type InventoryRow = { repositories: number; installations: number; last_synced_at: string | null };

export async function getTotals(db: Db, f: CommitFilters): Promise<TotalsRow> {
  const who = whoColumn(f);
  const res = await db.execute<TotalsRow>(sql`
    select count(*)::int as commits,
           count(distinct ${who})::int as developers,
           count(distinct c.repository_id)::int as active_repositories,
           (count(*) filter (where ${who} is null))::int as unassigned,
           (count(*) filter (where c.is_merge))::int as merges
    ${commitFrom(f)} where ${commitWhere(f)}`);
  return one(res.rows, "totals");
}

export async function getInventory(db: Db): Promise<InventoryRow> {
  const res = await db.execute<InventoryRow>(sql`
    select (select count(*) from repository where monitored and accessible)::int as repositories,
           (select count(*) from github_installation where status = 'active')::int as installations,
           ${isoUtc(sql`(select max(last_synced_at) from repository)`)} as last_synced_at`);
  return one(res.rows, "inventory");
}

/** One row per local calendar day in range, zero-filled so charts have no gaps. */
export async function getDailyTrend(db: Db, f: CommitFilters): Promise<TrendRow[]> {
  const tz = f.range.timezone;
  const res = await db.execute<TrendRow>(sql`
    select to_char(days.d, 'YYYY-MM-DD') as day, coalesce(x.n, 0)::int as commits
    from generate_series(${f.range.startDate}::date, ${f.range.endDate}::date, interval '1 day') as days(d)
    left join (
      select (c.committed_at at time zone ${tz})::date as d, count(*) as n
      ${commitFrom(f)} where ${commitWhere(f)} group by 1
    ) x on x.d = days.d::date
    order by days.d`);
  return res.rows;
}

export async function getHourlyActivity(db: Db, f: CommitFilters): Promise<HourRow[]> {
  const res = await db.execute<HourRow>(sql`
    select extract(hour from c.committed_at at time zone ${f.range.timezone})::int as hour, count(*)::int as commits
    ${commitFrom(f)} where ${commitWhere(f)} group by 1 order by 1`);
  return res.rows;
}

export async function getRepositoryDistribution(db: Db, f: CommitFilters, limit: number): Promise<NamedCountRow[]> {
  const res = await db.execute<NamedCountRow>(sql`
    select r.id, r.full_name as name, count(*)::int as commits
    ${commitFrom(f)} where ${commitWhere(f)}
    group by r.id, r.full_name order by commits desc, r.full_name limit ${limit}`);
  return res.rows;
}

export async function getLeaderboard(db: Db, f: CommitFilters, limit: number): Promise<LeaderRow[]> {
  const res = await db.execute<LeaderRow>(sql`
    select d.id, d.login, d.avatar_url, d.type, count(*)::int as commits, count(distinct c.repository_id)::int as repositories
    ${commitFrom(f)} where ${commitWhere(f)}
    group by d.id, d.login, d.avatar_url, d.type
    order by commits desc, d.login nulls last limit ${limit}`);
  return res.rows;
}

export type BreakdownDimension = "organization" | "repository" | "developer" | "team";
export type BreakdownRow = { id: number | null; label: string | null; commits: number; developers: number; repositories: number; latest_commit: string | null };

type Dimension = { joins: ReturnType<typeof sql>; key: ReturnType<typeof sql>; label: ReturnType<typeof sql> };

/** Every grouping the UI can pivot on; adding a dimension is one entry here. */
function dimensionFor(by: BreakdownDimension, f: CommitFilters): Dimension {
  switch (by) {
    case "organization":
      return {
        joins: sql`join github_installation gi on gi.id = r.installation_id join github_account ga on ga.id = gi.account_id`,
        key: sql`ga.id`, label: sql`ga.login`,
      };
    case "repository": return { joins: sql``, key: sql`r.id`, label: sql`r.full_name` };
    case "developer": return { joins: sql``, key: sql`d.id`, label: sql`d.login` };
    case "team":
      return {
        joins: sql`join team_member tm on tm.developer_account_id = ${whoColumn(f)} join team t on t.id = tm.team_id`,
        key: sql`t.id`, label: sql`t.name`,
      };
  }
}

/** Generic "group commits by X" used for org / team / repo / person pivots. A developer in two teams counts in both. */
export async function getBreakdown(db: Db, f: CommitFilters, by: BreakdownDimension, limit: number): Promise<BreakdownRow[]> {
  const dim = dimensionFor(by, f);
  const res = await db.execute<BreakdownRow>(sql`
    select ${dim.key} as id, ${dim.label} as label, count(*)::int as commits,
           count(distinct ${whoColumn(f)})::int as developers, count(distinct c.repository_id)::int as repositories,
           ${isoUtc(sql`max(c.committed_at)`)} as latest_commit
    ${commitFrom(f)} ${dim.joins}
    where ${commitWhere(f)}
    group by ${dim.key}, ${dim.label}
    order by commits desc, label nulls last limit ${limit}`);
  return res.rows;
}
