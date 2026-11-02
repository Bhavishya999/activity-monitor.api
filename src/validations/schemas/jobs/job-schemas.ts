import { z } from "zod";

export const vWebhookJobSchema = z.object({ deliveryRowId: z.number().int() });
export const vDiscoverJobSchema = z.object({ installationId: z.number().int() });
export const vImportJobSchema = z.object({
  installationId: z.number().int(),
  repositoryId: z.number().int(),
  sinceDays: z.number().int().positive().nullable(), // null => full history
  syncRunId: z.number().int(), // created at enqueue time so retries resume from checkpoints
});
export type ImportJob = z.infer<typeof vImportJobSchema>;
