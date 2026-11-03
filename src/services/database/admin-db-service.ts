import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "../../database/client.js";
import { appUser, auditLog, setting } from "../../database/schema/index.js";

// ---- Users ----

export type UserRow = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  lastLoginAt: Date | null;
};

export async function listUsers(
  db: Db,
  page: number,
  pageSize: number,
  search?: string | undefined,
): Promise<UserRow[]> {
  const offset = (page - 1) * pageSize;
  const searchCond = search !== undefined && search.length > 0
    ? ilike(appUser.email, `%${search}%`)
    : undefined;

  const rows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      active: appUser.active,
      lastLoginAt: appUser.lastLoginAt,
    })
    .from(appUser)
    .where(and(searchCond))
    .orderBy(desc(appUser.createdAt))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

export async function countUsers(db: Db, search?: string | undefined): Promise<number> {
  const searchCond = search !== undefined && search.length > 0
    ? ilike(appUser.email, `%${search}%`)
    : undefined;

  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(appUser)
    .where(and(searchCond));

  return rows[0]?.count ?? 0;
}

export async function updateUser(
  db: Db,
  id: number,
  patch: { role?: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "DEVELOPER" | undefined; active?: boolean | undefined },
): Promise<UserRow | null> {
  const set: Partial<{ role: typeof patch.role; active: boolean; updatedAt: Date }> = { updatedAt: new Date() };
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.active !== undefined) set.active = patch.active;

  const rows = await db
    .update(appUser)
    .set(set)
    .where(eq(appUser.id, id))
    .returning({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      active: appUser.active,
      lastLoginAt: appUser.lastLoginAt,
    });

  return rows[0] ?? null;
}

// ---- Settings ----

export async function getAllSettings(db: Db): Promise<Array<{ key: string; value: unknown }>> {
  const rows = await db.select({ key: setting.key, value: setting.value }).from(setting);
  return rows;
}

export async function upsertSetting(db: Db, key: string, value: unknown): Promise<{ key: string; value: unknown }> {
  const rows = await db
    .insert(setting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value, updatedAt: new Date() },
    })
    .returning({ key: setting.key, value: setting.value });

  // onConflictDoUpdate always returns a row
  const row = rows[0];
  if (!row) throw new Error("upsert setting returned no row");
  return row;
}

// ---- Audit log ----

export type AuditRow = {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: unknown;
  actorEmail: string | null;
  createdAt: Date;
};

export async function listAuditLogs(db: Db, page: number, pageSize: number): Promise<AuditRow[]> {
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      ip: auditLog.ip,
      metadata: auditLog.metadata,
      actorEmail: appUser.email,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(appUser, eq(auditLog.actorUserId, appUser.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

export async function countAuditLogs(db: Db): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(auditLog);

  return rows[0]?.count ?? 0;
}
