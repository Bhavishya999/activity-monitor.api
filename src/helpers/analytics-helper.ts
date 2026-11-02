import {
  getBreakdown, getDailyTrend, getHourlyActivity, getInventory, getLeaderboard, getRepositoryDistribution, getTotals, type BreakdownDimension,
} from "../services/database/analytics-db-service.js";
import { listCommitRows } from "../services/database/commit-db-service.js";
import type { CommitFilters } from "../types/analytics.types.js";
import type { AppDeps } from "../types/app.types.js";
import type { FilterQuery } from "../validations/schemas/analytics/analytics-schemas.js";
import { buildFilters, rangeMeta } from "./commit-filter-helper.js";
import { toCommitDto } from "./commit-helper.js";

const TOP_N = 10;

export type HourBucket = { hour: number; commits: number };

/** Always 24 buckets so the chart axis never has holes. */
export function fillHours(rows: readonly HourBucket[]): HourBucket[] {
  const byHour = new Map(rows.map((r) => [r.hour, r.commits]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, commits: byHour.get(hour) ?? 0 }));
}

export async function getTrendAndHours(deps: AppDeps, f: CommitFilters): Promise<{ daily: { day: string; commits: number }[]; hourly: HourBucket[] }> {
  const [daily, hourly] = await Promise.all([getDailyTrend(deps.db, f), getHourlyActivity(deps.db, f)]);
  return { daily, hourly: fillHours(hourly) };
}

export async function getOverview(deps: AppDeps, query: FilterQuery): Promise<unknown> {
  const f = buildFilters(deps, query);
  const [totals, inventory, trend, repositories, leaderboard, recent] = await Promise.all([
    getTotals(deps.db, f),
    getInventory(deps.db),
    getTrendAndHours(deps, f),
    getRepositoryDistribution(deps.db, f, TOP_N),
    getLeaderboard(deps.db, f, TOP_N),
    listCommitRows(deps.db, f, { page: 1, pageSize: 10 }),
  ]);
  return {
    range: rangeMeta(f),
    totals: {
      commits: totals.commits, activeDevelopers: totals.developers, activeRepositories: totals.active_repositories,
      unassignedCommits: totals.unassigned, mergeCommits: totals.merges,
      connectedRepositories: inventory.repositories, connectedInstallations: inventory.installations,
    },
    lastSyncedAt: inventory.last_synced_at,
    dailyTrend: trend.daily,
    hourlyActivity: trend.hourly,
    repositoryDistribution: repositories.map((r) => ({ id: r.id, name: r.name, commits: r.commits })),
    leaderboard: leaderboard.map((l) => ({
      developer: l.id !== null && l.login !== null ? { id: l.id, login: l.login, avatarUrl: l.avatar_url, type: l.type } : null, // null = unassigned
      commits: l.commits, repositories: l.repositories,
    })),
    recentCommits: recent.map(toCommitDto),
  };
}

export async function getBreakdownReport(deps: AppDeps, query: FilterQuery & { by: BreakdownDimension; limit: number }): Promise<unknown> {
  const f = buildFilters(deps, query);
  const rows = await getBreakdown(deps.db, f, query.by, query.limit);
  return {
    range: rangeMeta(f),
    by: query.by,
    groups: rows.map((r) => ({
      id: r.id, label: r.label, // null id/label = unassigned commits
      commits: r.commits, developers: r.developers, repositories: r.repositories, latestCommitAt: r.latest_commit,
    })),
  };
}
