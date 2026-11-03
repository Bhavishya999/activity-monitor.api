import type { Db } from "../database/client.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import {
  countCommits,
  countDevelopersWithCommits,
  countRepositoriesWithCommits,
  getDeveloperById,
  getDeveloperRepoBreakdown,
  getCommitTrend,
  getHourlyActivity,
  getOverviewTotals,
  getRepositoryById,
  getRepositoryContributors,
  getTopContributors,
  getTopRepos,
  listCommits,
  listDevelopers,
  listRepositories,
  type AnalyticsFilter,
  type CommitRow,
} from "../services/database/analytics-db-service.js";

const DEFAULT_DAYS = 30;
const TOP_LIMIT = 10;

type BaseParams = {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  tz: string;
  includeMerges: boolean;
  includeBots: boolean;
};

function buildFilter(params: BaseParams): AnalyticsFilter {
  const now = new Date();
  const dateTo = params.dateTo
    ? new Date(params.dateTo + "T23:59:59.999Z")
    : now;
  const dateFrom = params.dateFrom
    ? new Date(params.dateFrom + "T00:00:00.000Z")
    : new Date(dateTo.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);

  return { dateFrom, dateTo, tz: params.tz, includeMerges: params.includeMerges, includeBots: params.includeBots };
}

export type OverviewResponse = {
  totalCommits: number;
  totalRepos: number;
  totalDevelopers: number;
  commitTrend: Array<{ date: string; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  topRepos: Array<{ id: number; fullName: string; count: number }>;
  topContributors: Array<{ id: number; login: string; avatarUrl: string | null; count: number }>;
  dateRange: { from: string; to: string };
  sample: false;
};

export async function getOverview(db: Db, params: BaseParams): Promise<OverviewResponse> {
  const filter = buildFilter(params);

  const [totals, trend, hourly, topRepos, topContributors] = await Promise.all([
    getOverviewTotals(db, filter),
    getCommitTrend(db, filter),
    getHourlyActivity(db, filter),
    getTopRepos(db, filter, TOP_LIMIT),
    getTopContributors(db, filter, TOP_LIMIT),
  ]);

  return {
    totalCommits: totals.commits,
    totalRepos: totals.repos,
    totalDevelopers: totals.developers,
    commitTrend: trend,
    hourlyActivity: hourly,
    topRepos,
    topContributors,
    dateRange: {
      from: filter.dateFrom.toISOString().slice(0, 10),
      to: filter.dateTo.toISOString().slice(0, 10),
    },
    sample: false,
  };
}

export type DevelopersResponse = {
  developers: Array<{
    id: number;
    login: string;
    avatarUrl: string | null;
    type: string;
    commitCount: number;
    lastCommittedAt: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export async function getDevelopers(
  db: Db,
  params: BaseParams & { page: number; pageSize: number },
): Promise<DevelopersResponse> {
  const filter = buildFilter(params);

  const [developers, total] = await Promise.all([
    listDevelopers(db, filter, params.page, params.pageSize),
    countDevelopersWithCommits(db, filter),
  ]);

  return {
    developers: developers.map((d) => ({
      ...d,
      lastCommittedAt: d.lastCommittedAt instanceof Date ? d.lastCommittedAt.toISOString() : null,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export type DeveloperDetailResponse = {
  developer: { id: number; login: string; avatarUrl: string | null; type: string };
  commitCount: number;
  lastCommittedAt: string | null;
  commitTrend: Array<{ date: string; count: number }>;
  repoBreakdown: Array<{ repoId: number; fullName: string; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  dateRange: { from: string; to: string };
};

export async function getDeveloperDetail(
  db: Db,
  id: number,
  params: BaseParams,
): Promise<DeveloperDetailResponse> {
  const developer = await getDeveloperById(db, id);
  if (!developer) throw new NotFoundException("Developer not found");

  const filter = buildFilter(params);

  const [commitCount, trend, repoBreakdown, hourly] = await Promise.all([
    countCommits(db, filter, { developerId: id }),
    getCommitTrend(db, filter, { developerId: id }),
    getDeveloperRepoBreakdown(db, id, filter),
    getHourlyActivity(db, filter, { developerId: id }),
  ]);

  // lastCommittedAt: max of authored_at in period (from the trend's last entry or a separate query)
  const lastEntry = trend.at(-1);
  const lastCommittedAt = lastEntry?.date ?? null;

  return {
    developer,
    commitCount,
    lastCommittedAt,
    commitTrend: trend,
    repoBreakdown,
    hourlyActivity: hourly,
    dateRange: {
      from: filter.dateFrom.toISOString().slice(0, 10),
      to: filter.dateTo.toISOString().slice(0, 10),
    },
  };
}

export type RepositoriesResponse = {
  repositories: Array<{
    id: number;
    fullName: string;
    name: string;
    private: boolean;
    archived: boolean;
    monitored: boolean;
    accessible: boolean;
    commitCount: number;
    lastCommittedAt: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export async function getRepositories(
  db: Db,
  params: BaseParams & { page: number; pageSize: number },
): Promise<RepositoriesResponse> {
  const filter = buildFilter(params);

  const [repositories, total] = await Promise.all([
    listRepositories(db, filter, params.page, params.pageSize),
    countRepositoriesWithCommits(db, filter),
  ]);

  return {
    repositories: repositories.map((r) => ({
      ...r,
      lastCommittedAt: r.lastCommittedAt instanceof Date ? r.lastCommittedAt.toISOString() : null,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export type RepositoryDetailResponse = {
  repository: {
    id: number;
    fullName: string;
    name: string;
    private: boolean;
    archived: boolean;
    defaultBranch: string | null;
    htmlUrl: string | null;
  };
  commitCount: number;
  commitTrend: Array<{ date: string; count: number }>;
  topContributors: Array<{ id: number; login: string; avatarUrl: string | null; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  dateRange: { from: string; to: string };
};

export async function getRepositoryDetail(
  db: Db,
  id: number,
  params: BaseParams,
): Promise<RepositoryDetailResponse> {
  const repo = await getRepositoryById(db, id);
  if (!repo) throw new NotFoundException("Repository not found");

  const filter = buildFilter(params);

  const [commitCount, trend, contributors, hourly] = await Promise.all([
    countCommits(db, filter, { repoId: id }),
    getCommitTrend(db, filter, { repoId: id }),
    getRepositoryContributors(db, id, filter, TOP_LIMIT),
    getHourlyActivity(db, filter, { repoId: id }),
  ]);

  return {
    repository: repo,
    commitCount,
    commitTrend: trend,
    topContributors: contributors,
    hourlyActivity: hourly,
    dateRange: {
      from: filter.dateFrom.toISOString().slice(0, 10),
      to: filter.dateTo.toISOString().slice(0, 10),
    },
  };
}

type SerializedCommit = {
  id: number;
  sha: string;
  shortSha: string;
  message: string;
  authoredAt: string;
  committedAt: string;
  isMerge: boolean;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  htmlUrl: string | null;
  author: { id: number; login: string; avatarUrl: string | null } | null;
  repository: { id: number; fullName: string };
};

export type CommitsResponse = {
  commits: SerializedCommit[];
  total: number;
  page: number;
  pageSize: number;
};

function serializeCommit(row: CommitRow): SerializedCommit {
  return {
    id: row.id,
    sha: row.sha,
    shortSha: row.sha.slice(0, 8),
    message: row.message,
    authoredAt: row.authoredAt.toISOString(),
    committedAt: row.committedAt.toISOString(),
    isMerge: row.isMerge,
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changedFiles,
    htmlUrl: row.htmlUrl,
    author:
      row.authorId !== null && row.authorLogin !== null
        ? { id: row.authorId, login: row.authorLogin, avatarUrl: row.authorAvatarUrl }
        : null,
    repository: { id: row.repoId, fullName: row.repoFullName },
  };
}

export async function getCommits(
  db: Db,
  params: BaseParams & { page: number; pageSize: number; repoId?: number | undefined; developerId?: number | undefined },
): Promise<CommitsResponse> {
  const filter = buildFilter(params);
  const options = {
    page: params.page,
    pageSize: params.pageSize,
    ...(params.repoId !== undefined ? { repoId: params.repoId } : {}),
    ...(params.developerId !== undefined ? { developerId: params.developerId } : {}),
  };

  const [commits, total] = await Promise.all([
    listCommits(db, filter, options),
    countCommits(db, filter, options),
  ]);

  return {
    commits: commits.map(serializeCommit),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}
