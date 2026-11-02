import { requireEnv } from "../env.js";

export const githubConfig = { webhookSecret: requireEnv("GITHUB_WEBHOOK_SECRET"), maxWebhookBodyBytes: 5 * 1024 * 1024 } as const;
