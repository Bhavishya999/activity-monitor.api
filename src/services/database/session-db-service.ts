import { and, eq, gt } from "drizzle-orm";
import { one, schema, type Db } from "../../database/client.js";
import type { Role } from "../../constants/roles.js";
import type { AuthUser } from "../../types/app.types.js";

const { appUser, session } = schema;

export type SessionWithUser = { csrfToken: string; user: AuthUser };

export async function findOrCreateDevUser(db: Db, email: string, role: Role): Promise<{ id: number }> {
  const existing = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email));
  const found = existing[0];
  if (found) return found;
  const rows = await db.insert(appUser).values({ email, name: email.split("@")[0] ?? email, provider: "dev", providerSubject: email, role })
    .returning({ id: appUser.id });
  return one(rows, "user");
}

export async function insertSession(db: Db, input: { id: string; userId: number; csrfToken: string; expiresAt: Date }): Promise<void> {
  await db.insert(session).values(input);
}

export async function findActiveSession(db: Db, sessionId: string): Promise<SessionWithUser | null> {
  const rows = await db.select({
    csrfToken: session.csrfToken, id: appUser.id, email: appUser.email, name: appUser.name, role: appUser.role, employeeId: appUser.employeeId,
  }).from(session).innerJoin(appUser, eq(appUser.id, session.userId))
    .where(and(eq(session.id, sessionId), gt(session.expiresAt, new Date()), eq(appUser.active, true)));
  const row = rows[0];
  if (!row) return null;
  return { csrfToken: row.csrfToken, user: { id: row.id, email: row.email, name: row.name, role: row.role, employeeId: row.employeeId } };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(session).where(eq(session.id, sessionId));
}
