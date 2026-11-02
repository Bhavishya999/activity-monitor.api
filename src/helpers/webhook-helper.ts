import { verifyWebhookSignature } from "../services/github/index.js";
import { JOBS } from "../constants/jobs.js";
import { vWebhookEnvelopeSchema } from "../validations/schemas/github/github-payload-schemas.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { BadRequestException } from "../exceptions/bad-request-exception.js";
import { PayloadTooLargeException } from "../exceptions/payload-too-large-exception.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { upsertWebhookDelivery } from "../services/database/webhook-db-service.js";
import type { AppDeps } from "../types/app.types.js";
import type { WebhookHeaders } from "../validations/schemas/webhooks/webhook-schemas.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const RETRY = { retryLimit: 8, retryDelay: 15, retryBackoff: true } as const;

/** Verify on the exact raw bytes, persist, enqueue. Never processes inline. */
export async function receiveGithubWebhook(deps: AppDeps, raw: Buffer, headers: WebhookHeaders): Promise<void> {
  if (raw.length > (deps.maxWebhookBodyBytes ?? DEFAULT_MAX_BYTES)) throw new PayloadTooLargeException(APP_MESSAGES.PAYLOAD_TOO_LARGE);
  if (!verifyWebhookSignature(raw, headers.signature, deps.webhookSecret)) throw new UnauthorizedException(APP_MESSAGES.INVALID_SIGNATURE);

  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { throw new BadRequestException(APP_MESSAGES.INVALID_JSON); }
  const envelope = vWebhookEnvelopeSchema.safeParse(payload);
  if (!envelope.success) throw new BadRequestException(APP_MESSAGES.INVALID_PAYLOAD);

  const delivery = await upsertWebhookDelivery(deps.db, {
    deliveryId: headers.deliveryId, event: headers.event,
    action: envelope.data.action ?? null, installationId: envelope.data.installation?.id ?? null, payload,
  });

  // A GitHub re-delivery of an unfinished GUID is re-queued; finished ones are just acknowledged.
  if (delivery.status !== "processed" && delivery.status !== "ignored") {
    await deps.queue.send(JOBS.WEBHOOK, { deliveryRowId: delivery.id }, { singletonKey: `wh-${delivery.id}`, ...RETRY });
  }
}
