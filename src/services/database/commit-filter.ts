import { sql, type SQL } from "drizzle-orm";
import type { CommitFilters } from "../../types/analytics.types.js";

/** Escape LIKE wildcards so user input is matched literally. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** The developer column that counts as "who" for this query (author by default). */
export function whoColumn(f: CommitFilters): SQL {
  return f.attribution === "author" ? sql`c.author_account_id` : sql`c.committer_account_id`;
}

export function commitFrom(f: CommitFilters): SQL {
  return sql`from "commit" c join repository r on r.id = c.repository_id left join developer_account d on d.id = ${whoColumn(f)}`;
}

/** Shared WHERE for every analytic so all screens agree on what a commit in range is. */
export function commitWhere(f: CommitFilters): SQL {
  const who = whoColumn(f);
  const conds: SQL[] = [
    sql`c.committed_at >= ${f.range.start.toISOString()}::timestamptz`,
    sql`c.committed_at < ${f.range.end.toISOString()}::timestamptz`,
    sql`c.committed_at <= now()`, // ignore commits stamped in the future by bad clocks
    sql`r.monitored = true`,
  ];
  if (f.installationId !== null) conds.push(sql`r.installation_id = ${f.installationId}`);
  if (f.repositoryId !== null) conds.push(sql`r.id = ${f.repositoryId}`);
  if (f.developerId !== null) conds.push(sql`${who} = ${f.developerId}`);
  if (f.branch !== null) {
    conds.push(sql`exists (select 1 from commit_branch cb join branch b on b.id = cb.branch_id where cb.commit_id = c.id and b.name = ${f.branch})`);
  }
  if (!f.includeBots) conds.push(sql`(d.id is null or d.type <> 'Bot')`);
  if (!f.includeMerges) conds.push(sql`c.is_merge = false`);
  if (f.search !== null) {
    const like = likePattern(f.search);
    conds.push(sql`(c.message ilike ${like} or c.sha ilike ${like} or r.full_name ilike ${like} or d.login ilike ${like})`);
  }
  return sql.join(conds, sql` and `);
}
