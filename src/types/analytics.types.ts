import type { DateRange } from "../helpers/date-range-helper.js";

export const ATTRIBUTIONS = ["author", "committer"] as const;
export type Attribution = (typeof ATTRIBUTIONS)[number];

export type CommitFilters = {
  range: DateRange;
  installationId: number | null;
  repositoryId: number | null;
  developerId: number | null;
  branch: string | null;
  attribution: Attribution;
  includeBots: boolean;
  includeMerges: boolean;
  search: string | null;
};

export type Page = { page: number; pageSize: number };
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
