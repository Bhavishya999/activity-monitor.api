import type { AppDeps } from "../types/app.types.js";
import type { CommitFilters } from "../types/analytics.types.js";
import type { FilterQuery } from "../validations/schemas/analytics/analytics-schemas.js";
import { resolveDateRange } from "./date-range-helper.js";

/** Turns a validated query into the filter object every analytic shares. Defaults to the configured report timezone. */
export function buildFilters(deps: AppDeps, query: FilterQuery, search: string | null = null): CommitFilters {
  return {
    range: resolveDateRange({
      preset: query.range, from: query.from ?? null, to: query.to ?? null, timezone: query.timezone ?? deps.auth.defaultTimezone,
    }),
    installationId: query.installationId ?? null,
    repositoryId: query.repositoryId ?? null,
    developerId: query.developerId ?? null,
    teamId: query.teamId ?? null,
    branch: query.branch ?? null,
    attribution: query.attribution,
    includeBots: query.includeBots,
    includeMerges: query.includeMerges,
    search,
  };
}

export function rangeMeta(f: CommitFilters): { preset: string; startDate: string; endDate: string; timezone: string } {
  return { preset: f.range.preset, startDate: f.range.startDate, endDate: f.range.endDate, timezone: f.range.timezone };
}
