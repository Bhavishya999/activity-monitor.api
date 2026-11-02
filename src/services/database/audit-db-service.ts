import { schema, type Db } from "../../database/client.js";

export type AuditEntry = {
  actorUserId: number | null; action: string; targetType: string; targetId: string; metadata?: Record<string, unknown>;
};

export async function insertAuditLog(db: Pick<Db, "insert">, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorUserId: entry.actorUserId, action: entry.action, targetType: entry.targetType, targetId: entry.targetId, metadata: entry.metadata ?? null,
  });
}
