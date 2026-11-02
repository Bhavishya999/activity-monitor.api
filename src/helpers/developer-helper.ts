import {
  countDeveloperRows, findProfile, getDeveloperSummary, getLifetime, getRepositoryBreakdown, listDeveloperRows, listLinkedAccounts, type DeveloperSort,
} from "../services/database/developer-db-service.js";
import { listCommitRows } from "../services/database/commit-db-service.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import type { Paged } from "../types/analytics.types.js";
import type { AppDeps } from "../types/app.types.js";
import type { FilterQuery } from "../validations/schemas/analytics/analytics-schemas.js";
import { getTrendAndHours } from "./analytics-helper.js";
import { buildFilters, rangeMeta } from "./commit-filter-helper.js";
import { toCommitDto } from "./commit-helper.js";

export type DeveloperListItem = {
  id: number; login: string; avatarUrl: string | null; isBot: boolean; commits: number; repositories: number; mergeCommits: number;
  firstCommitAt: string; latestCommitAt: string; additions: number | null; deletions: number | null;
  employee: { id: number; name: string } | null;
};

export async function listDevelopers(
  deps: AppDeps, query: FilterQuery & { page: number; pageSize: number; q?: string | undefined; sort: DeveloperSort },
): Promise<Paged<DeveloperListItem>> {
  const f = buildFilters(deps, query);
  const page = { page: query.page, pageSize: query.pageSize };
  const q = query.q ?? null;
  const [rows, total] = await Promise.all([listDeveloperRows(deps.db, f, q, query.sort, page), countDeveloperRows(deps.db, f, q)]);
  return {
    items: rows.map((r) => ({
      id: r.id, login: r.login, avatarUrl: r.avatar_url, isBot: r.type === "Bot", commits: r.commits, repositories: r.repositories,
      mergeCommits: r.merges, firstCommitAt: r.first_commit, latestCommitAt: r.latest_commit,
      additions: r.additions, deletions: r.deletions,
      employee: r.employee_id !== null && r.employee_name !== null ? { id: r.employee_id, name: r.employee_name } : null,
    })),
    total, ...page,
  };
}

export async function getDeveloper(deps: AppDeps, developerId: number, query: FilterQuery): Promise<unknown> {
  const profile = await findProfile(deps.db, developerId);
  if (!profile) throw new NotFoundException(APP_MESSAGES.DEVELOPER_NOT_FOUND);
  const f = { ...buildFilters(deps, query), developerId };
  const [linked, summary, lifetime, trend, repositories, recent] = await Promise.all([
    listLinkedAccounts(deps.db, developerId),
    getDeveloperSummary(deps.db, f),
    getLifetime(deps.db, f, developerId),
    getTrendAndHours(deps, f),
    getRepositoryBreakdown(deps.db, f),
    listCommitRows(deps.db, f, { page: 1, pageSize: 20 }),
  ]);
  const employee = linked[0];
  return {
    range: rangeMeta(f),
    developer: { id: profile.id, login: profile.login, avatarUrl: profile.avatar_url, profileUrl: profile.html_url, isBot: profile.type === "Bot" },
    employee: employee ? { id: employee.employee_id, name: employee.employee_name } : null,
    linkedAccounts: linked.map((a) => ({ id: a.id, login: a.login, avatarUrl: a.avatar_url })),
    summary: {
      commits: summary.commits, repositories: summary.repositories, mergeCommits: summary.merges,
      additions: summary.additions, deletions: summary.deletions,
      firstCommitAt: lifetime.first_commit, latestCommitAt: lifetime.latest_commit,
      lifetimeCommits: lifetime.total,
    },
    dailyTrend: trend.daily,
    hourlyActivity: trend.hourly,
    repositories: repositories.map((r) => ({ id: r.id, name: r.name, commits: r.commits, latestCommitAt: r.latest_commit })),
    recentCommits: recent.map(toCommitDto),
  };
}
