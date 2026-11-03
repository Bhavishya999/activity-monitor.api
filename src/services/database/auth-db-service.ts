import { and, eq, gt, isNull } from "drizzle-orm";
import { one, type Db } from "../../database/client.js";
import { appUser, passwordResetOtp, session } from "../../database/schema/index.js";

export type NewUser = {
  email: string;
  name?: string;
  provider?: string;
  providerSubject?: string;
  passwordHash?: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "DEVELOPER";
};

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: Db, id: number) {
  const rows = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(db: Db, data: NewUser) {
  return one(
    await db
      .insert(appUser)
      .values({
        email: data.email,
        name: data.name ?? null,
        provider: data.provider ?? "local",
        providerSubject: data.providerSubject ?? null,
        passwordHash: data.passwordHash ?? null,
        role: data.role,
      })
      .returning(),
    "created user",
  );
}

export async function updateUserPassword(db: Db, userId: number, passwordHash: string) {
  await db.update(appUser).set({ passwordHash, updatedAt: new Date() }).where(eq(appUser.id, userId));
}

export async function updateUserLastLogin(db: Db, userId: number) {
  await db.update(appUser).set({ lastLoginAt: new Date() }).where(eq(appUser.id, userId));
}

export async function createSession(
  db: Db,
  data: { id: string; userId: number; csrfToken: string; expiresAt: Date },
) {
  await db.insert(session).values(data);
}

export async function findSession(db: Db, sessionIdHash: string) {
  const rows = await db
    .select({
      id: session.id,
      userId: session.userId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      userEmail: appUser.email,
      userName: appUser.name,
      userRole: appUser.role,
      userActive: appUser.active,
    })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(and(eq(session.id, sessionIdHash), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    csrfToken: row.csrfToken,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      role: row.userRole,
      active: row.userActive,
    },
  };
}

export async function deleteSession(db: Db, sessionIdHash: string) {
  await db.delete(session).where(eq(session.id, sessionIdHash));
}

export async function deleteUserSessions(db: Db, userId: number) {
  await db.delete(session).where(eq(session.userId, userId));
}

export async function invalidateUserOtps(db: Db, userId: number) {
  await db
    .update(passwordResetOtp)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetOtp.userId, userId), isNull(passwordResetOtp.usedAt)));
}

export async function createOtp(db: Db, userId: number, otpHash: string, expiresAt: Date) {
  return one(
    await db.insert(passwordResetOtp).values({ userId, otpHash, expiresAt }).returning(),
    "created otp",
  );
}

export async function findActiveOtpByUser(db: Db, userId: number) {
  const rows = await db
    .select()
    .from(passwordResetOtp)
    .where(
      and(
        eq(passwordResetOtp.userId, userId),
        isNull(passwordResetOtp.usedAt),
        isNull(passwordResetOtp.resetTokenHash),
        gt(passwordResetOtp.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markOtpVerified(
  db: Db,
  otpId: number,
  resetTokenHash: string,
  resetTokenExpiresAt: Date,
) {
  await db
    .update(passwordResetOtp)
    .set({ usedAt: new Date(), resetTokenHash, expiresAt: resetTokenExpiresAt })
    .where(eq(passwordResetOtp.id, otpId));
}

export async function findOtpByResetToken(db: Db, resetTokenHash: string) {
  const rows = await db
    .select()
    .from(passwordResetOtp)
    .where(
      and(
        eq(passwordResetOtp.resetTokenHash, resetTokenHash),
        gt(passwordResetOtp.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteOtp(db: Db, otpId: number) {
  await db.delete(passwordResetOtp).where(eq(passwordResetOtp.id, otpId));
}
