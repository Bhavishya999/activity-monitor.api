import { z } from "zod";

export const vWebhookHeadersSchema = z.object({
  event: z.string().min(1),
  deliveryId: z.string().min(1),
  signature: z.string().optional(),
});
export type WebhookHeaders = z.infer<typeof vWebhookHeadersSchema>;
