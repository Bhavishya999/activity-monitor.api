import { sql } from "drizzle-orm";
import { one, type Db } from "../../database/client.js";
import type { CommitFilters, Page } from "../../types/analytics.types.js";
import { commitFrom, commitWhere } from "./commit-filter.js";
import { isoUtc } from "./sql-utils.js";

export type CommitRow = {
  id: number; sha: string; title: string; committed_at: string; html_url: string | null; is_merge: boolean;
  additions: number | null; deletions: number | null;
  repository_id: number; repository: string;
  developer_id: number | null; developer: string | null; developer_avatar: string | null;
};

export async function listCommitRows(db: Db, f: CommitFilters, p: Page): Promise<CommitRow[]> {
  const res = await db.execute<CommitRow>(sql`
    select c.id, c.sha, split_part(c.message, E'\n', 1) as title, ${isoUtc(sql`c.committed_at`)} as committed_at, c.html_url, c.is_merge, c.additions, c.deletions,
           r.id as repository_id, r.full_name as repository,
           d.id as developer_id, d.login as developer, d.avatar_url as developer_avatar
    ${commitFrom(f)} where ${commitWhere(f)}
    order by c.committed_at desc, c.id desc
    limit ${p.pageSize} offset ${(p.page - 1) * p.pageSize}`);
  return res.rows;
}

export async function countCommits(db: Db, f: CommitFilters): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`select count(*)::int as n ${commitFrom(f)} where ${commitWhere(f)}`);
  return one(res.rows, "count").n;
}
