import { z } from "zod";

const coerceBool = (def: boolean) =>
  z
    .string()
    .transform((v): boolean => v === "true" || v === "1")
    .optional()
    .default(def);

const coercePosInt = (def: number) =>
  z
    .string()
    .regex(/^\d+$/, "Must be a positive integer")
    .transform((v): number => Number(v))
    .refine((n) => n > 0, "Must be greater than 0")
    .optional()
    .default(def);

const coerceBoundedInt = (def: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "Must be a positive integer")
    .transform((v): number => Number(v))
    .refine((n) => n >= 1 && n <= max, `Must be between 1 and ${max}`)
    .optional()
    .default(def);

export const vBaseAnalytics = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  tz: z.string().max(64).optional().default("Asia/Kolkata"),
  includeMerges: coerceBool(false),
  includeBots: coerceBool(false),
});

export const vOverviewQuery = vBaseAnalytics;

export const vDevelopersQuery = vBaseAnalytics.extend({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(50, 100),
});

export const vRepositoriesQuery = vBaseAnalytics.extend({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(50, 100),
});

export const vCommitsQuery = vBaseAnalytics.extend({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(50, 100),
  repoId: z.string().regex(/^\d+$/).transform(Number).optional(),
  developerId: z.string().regex(/^\d+$/).transform(Number).optional(),
});
