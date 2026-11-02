import { z } from "zod";
import { RANGE_PRESETS } from "../../../helpers/date-range-helper.js";
import { ATTRIBUTIONS } from "../../../types/analytics.types.js";

const vId = z.coerce.number().int().positive();
const vFlag = (fallback: "true" | "false") => z.enum(["true", "false"]).default(fallback).transform((v) => v === "true");

export const vFilterQuerySchema = z.object({
  range: z.enum(RANGE_PRESETS).default("last30"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  timezone: z.string().max(64).optional(),
  installationId: vId.optional(),
  repositoryId: vId.optional(),
  developerId: vId.optional(),
  teamId: vId.optional(),
  branch: z.string().min(1).max(255).optional(),
  attribution: z.enum(ATTRIBUTIONS).default("author"),
  includeBots: vFlag("false"),
  includeMerges: vFlag("true"),
});

const vPaging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().min(1).max(100).optional(),
};

export const vOverviewQuerySchema = vFilterQuerySchema;
export const BREAKDOWN_DIMENSIONS = ["organization", "repository", "developer", "team"] as const;
export const vBreakdownQuerySchema = vFilterQuerySchema.extend({
  by: z.enum(BREAKDOWN_DIMENSIONS),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const vDeveloperListQuerySchema = vFilterQuerySchema.extend({ ...vPaging, sort: z.enum(["commits", "latest", "name"]).default("commits") });
export const vRepositoryListQuerySchema = vFilterQuerySchema.extend({ ...vPaging, sort: z.enum(["commits", "latest", "name"]).default("commits") });
export const vCommitListQuerySchema = vFilterQuerySchema.extend(vPaging);
export const vIdParamSchema = z.object({ id: vId });

export type FilterQuery = z.infer<typeof vFilterQuerySchema>;
