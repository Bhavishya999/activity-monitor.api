import { z } from "zod";

const vColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour like #3b82f6");

export const vTeamCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  color: vColor.optional(),
});

export const vTeamUpdateSchema = vTeamCreateSchema.partial().refine((v) => Object.keys(v).length > 0, "provide at least one field");

export const vTeamMembersSchema = z.object({
  developerAccountIds: z.array(z.number().int().positive()).max(500).refine((ids) => new Set(ids).size === ids.length, "duplicate account ids"),
});
