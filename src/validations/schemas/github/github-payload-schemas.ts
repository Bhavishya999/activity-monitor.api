import { z } from "zod";

/** GitHub webhook payloads: only the fields we use, validated rather than cast. */
const vSenderSchema = z.object({
  id: z.number(), login: z.string(), type: z.string().optional(),
  avatar_url: z.string().nullish(), html_url: z.string().nullish(),
});
const vInstallRefSchema = z.object({ id: z.number() });

export const vPushPayloadSchema = z.object({
  ref: z.string(),
  after: z.string().nullish(),
  deleted: z.boolean().optional(),
  installation: vInstallRefSchema.optional(),
  repository: z.object({ id: z.number() }),
  sender: vSenderSchema.optional(),
  commits: z.array(z.object({ id: z.string(), timestamp: z.string() })).default([]),
});
export const vInstallationPayloadSchema = z.object({ installation: vInstallRefSchema });
export const vInstallationReposPayloadSchema = z.object({
  installation: vInstallRefSchema,
  repositories_removed: z.array(z.object({ id: z.number() })).default([]),
});
export const vRepositoryPayloadSchema = z.object({
  installation: vInstallRefSchema.optional(),
  repository: z.object({ id: z.number() }),
});
export const vWebhookEnvelopeSchema = z.object({ action: z.string().optional(), installation: vInstallRefSchema.optional() });
export type PushPayload = z.infer<typeof vPushPayloadSchema>;
