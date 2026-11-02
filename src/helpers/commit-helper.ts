import type { AppDeps } from "../types/app.types.js";
import type { Paged } from "../types/analytics.types.js";
import { countCommits, listCommitRows, type CommitRow } from "../services/database/commit-db-service.js";
import type { FilterQuery } from "../validations/schemas/analytics/analytics-schemas.js";
import { buildFilters } from "./commit-filter-helper.js";

export type CommitDto = {
  id: number; sha: string; title: string; committedAt: string; url: string | null; isMerge: boolean;
  additions: number | null; deletions: number | null;
  repository: { id: number; name: string };
  developer: { id: number; login: string; avatarUrl: string | null } | null; // null = unassigned
};

export function toCommitDto(r: CommitRow): CommitDto {
  return {
    id: r.id, sha: r.sha, title: r.title, committedAt: r.committed_at, url: r.html_url, isMerge: r.is_merge,
    additions: r.additions, deletions: r.deletions,
    repository: { id: r.repository_id, name: r.repository },
    developer: r.developer_id !== null && r.developer !== null ? { id: r.developer_id, login: r.developer, avatarUrl: r.developer_avatar } : null,
  };
}

export async function searchCommits(deps: AppDeps, query: FilterQuery & { page: number; pageSize: number; q?: string | undefined }): Promise<Paged<CommitDto>> {
  const f = buildFilters(deps, query, query.q ?? null);
  const page = { page: query.page, pageSize: query.pageSize };
  const [rows, total] = await Promise.all([listCommitRows(deps.db, f, page), countCommits(deps.db, f)]);
  return { items: rows.map(toCommitDto), total, ...page };
}
