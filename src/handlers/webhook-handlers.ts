import type { AppHandler } from "../factory.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { BadRequestException } from "../exceptions/bad-request-exception.js";
import { receiveGithubWebhook } from "../helpers/webhook-helper.js";
import { vWebhookHeadersSchema } from "../validations/schemas/webhooks/webhook-schemas.js";

export const handleGithubWebhook: AppHandler = async (c) => {
  const headers = vWebhookHeadersSchema.safeParse({
    event: c.req.header("x-github-event"),
    deliveryId: c.req.header("x-github-delivery"),
    signature: c.req.header("x-hub-signature-256"),
  });
  if (!headers.success) throw new BadRequestException(APP_MESSAGES.MISSING_WEBHOOK_HEADERS);
  const raw = Buffer.from(await c.req.arrayBuffer());
  await receiveGithubWebhook(c.get("deps"), raw, headers.data);
  return c.json({ ok: true }, 202);
};
