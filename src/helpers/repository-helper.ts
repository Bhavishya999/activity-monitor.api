import { getLeaderboard } from "../services/database/analytics-db-service.js";
import { listCommitRows } from "../services/database/commit-db-service.js";
import {
  countRepositoryRows, findRepositoryRow, listBranchRows, listRepositoryRows, type RepositoryRow, type RepositorySort,
} from "../services/database/repository-db-service.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import type { Paged } from "../types/analytics.types.js";
import type { AppDeps } from "../types/app.types.js";
import type { FilterQuery } from "../validations/schemas/analytics/analytics-schemas.js";
import { getTrendAndHours } from "./analytics-helper.js";
import { buildFilters, rangeMeta } from "./commit-filter-helper.js";
import { toCommitDto } from "./commit-helper.js";

export type RepositoryDto = {
  id: number; name: string; isPrivate: boolean; isArchived: boolean; isAccessible: boolean; isMonitored: boolean;
  account: string; commits: number; contributors: number; latestCommitAt: string | null; lastSyncedAt: string | null;
};

function toRepositoryDto(r: RepositoryRow): RepositoryDto {
  return {
    id: r.id, name: r.full_name, isPrivate: r.private, isArchived: r.archived, isAccessible: r.accessible, isMonitored: r.monitored,
    account: r.account, commits: r.commits, contributors: r.contributors,
    latestCommitAt: r.latest_commit, lastSyncedAt: r.last_synced_at,
  };
}

export async function listRepositories(
  deps: AppDeps, query: FilterQuery & { page: number; pageSize: number; q?: string | undefined; sort: RepositorySort },
): Promise<Paged<RepositoryDto>> {
  const f = buildFilters(deps, query);
  const page = { page: query.page, pageSize: query.pageSize };
  const q = query.q ?? null;
  const [rows, total] = await Promise.all([listRepositoryRows(deps.db, f, q, query.sort, page), countRepositoryRows(deps.db, f, q)]);
  return { items: rows.map(toRepositoryDto), total, ...page };
}

export async function getRepository(deps: AppDeps, repositoryId: number, query: FilterQuery): Promise<unknown> {
  const f = { ...buildFilters(deps, query), repositoryId };
  const row = await findRepositoryRow(deps.db, f, repositoryId);
  if (!row) throw new NotFoundException(APP_MESSAGES.REPOSITORY_NOT_FOUND);
  const [branches, contributors, trend, recent] = await Promise.all([
    listBranchRows(deps.db, repositoryId),
    getLeaderboard(deps.db, f, 20),
    getTrendAndHours(deps, f),
    listCommitRows(deps.db, f, { page: 1, pageSize: 20 }),
  ]);
  return {
    range: rangeMeta(f),
    repository: toRepositoryDto(row),
    branches: branches.map((b) => ({
      id: b.id, name: b.name, isDefault: b.is_default, isDeleted: b.deleted, commits: b.commits, lastImportedAt: b.last_imported_at,
    })),
    contributors: contributors.map((c) => ({
      developer: c.id !== null && c.login !== null ? { id: c.id, login: c.login, avatarUrl: c.avatar_url } : null, commits: c.commits,
    })),
    dailyTrend: trend.daily,
    hourlyActivity: trend.hourly,
    recentCommits: recent.map(toCommitDto),
  };
}
