import { z } from "zod";

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

export const vListUsersQuery = z.object({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(20, 100),
  search: z.string().max(200).optional(),
});

export const vUpdateUser = z
  .object({
    role: z.enum(["SUPER_ADMIN", "ADMIN", "MANAGER", "DEVELOPER"]).optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.active !== undefined, {
    message: "Provide at least one field to update",
  });

export const vUpsertSetting = z.object({
  key: z.string().min(1).max(255),
  value: z.unknown(),
});

export const vListAuditQuery = z.object({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(50, 100),
});
