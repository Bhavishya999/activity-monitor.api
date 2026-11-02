import { sql } from "drizzle-orm";
import { one, schema, type Db } from "../../database/client.js";

export type StoredDelivery = { id: number; status: (typeof schema.webhookStatus.enumValues)[number] };

export type NewDelivery = {
  deliveryId: string; event: string; action: string | null; installationId: number | null; payload: unknown;
};

/** Idempotent on X-GitHub-Delivery: a re-delivery returns the existing row. */
export async function upsertWebhookDelivery(db: Db, input: NewDelivery): Promise<StoredDelivery> {
  const rows = await db.insert(schema.webhookDelivery).values(input).onConflictDoUpdate({
    target: schema.webhookDelivery.deliveryId,
    set: { receivedAt: sql`${schema.webhookDelivery.receivedAt}` }, // no-op update so RETURNING yields the existing row
  }).returning({ id: schema.webhookDelivery.id, status: schema.webhookDelivery.status });
  return one(rows, "webhook delivery");
}

export async function checkDatabase(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
