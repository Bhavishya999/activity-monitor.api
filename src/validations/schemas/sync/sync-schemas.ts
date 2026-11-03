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

export const vSyncRunsQuery = z.object({
  page: coercePosInt(1),
  pageSize: coerceBoundedInt(20, 50),
  installationId: z.string().regex(/^\d+$/).transform(Number).optional(),
  kind: z.enum(["discovery", "import", "reconcile"]).optional(),
  status: z.enum(["pending", "running", "succeeded", "failed", "partial", "cancelled"]).optional(),
});

export const vTriggerSync = z.object({
  installationId: z.number().int().positive(),
});
