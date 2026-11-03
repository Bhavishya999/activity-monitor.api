import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { authConfig } from "../config/auth-config.js";
import { BadRequestException } from "../exceptions/bad-request-exception.js";
import { ForbiddenException } from "../exceptions/forbidden-exception.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { sendOtpEmail } from "../services/email/index.js";
import {
  createOtp,
  createSession,
  createUser,
  deleteOtp,
  deleteSession,
  deleteUserSessions,
  findActiveOtpByUser,
  findOtpByResetToken,
  findSession,
  findUserByEmail,
  invalidateUserOtps,
  markOtpVerified,
  updateUserLastLogin,
  updateUserPassword,
  type NewUser,
} from "../services/database/auth-db-service.js";
import type { Db } from "../database/client.js";
import type { SessionUser } from "../types/app.types.js";
import { logger } from "../utils/pino-logger.js";

const ALLOWED_ROLES: SessionUser["role"][] = ["SUPER_ADMIN", "DEVELOPER"];

function hashToken(raw: string): string {
  return createHash("sha256").update(authConfig.sessionSecret + raw).digest("hex");
}

export async function login(
  db: Db,
  email: string,
  password: string,
): Promise<{ rawSessionToken: string; csrfToken: string; user: SessionUser }> {
  const authErr = new UnauthorizedException("Invalid email or password");

  const user = await findUserByEmail(db, email);
  if (!user || !user.active || !user.passwordHash) throw authErr;
  if (!ALLOWED_ROLES.includes(user.role as SessionUser["role"])) {
    throw new ForbiddenException("Access denied");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw authErr;

  const rawSessionToken = randomBytes(32).toString("hex");
  const sessionIdHash = hashToken(rawSessionToken);
  const csrfToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + authConfig.sessionTtlMs);

  await createSession(db, { id: sessionIdHash, userId: user.id, csrfToken, expiresAt });
  await updateUserLastLogin(db, user.id);

  return {
    rawSessionToken,
    csrfToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role as SessionUser["role"] },
  };
}

export async function logout(db: Db, rawSessionToken: string): Promise<void> {
  await deleteSession(db, hashToken(rawSessionToken));
}

export async function getSessionUser(db: Db, rawSessionToken: string): Promise<{
  sessionUser: SessionUser;
  csrfToken: string;
} | null> {
  const sessionRow = await findSession(db, hashToken(rawSessionToken));
  if (!sessionRow || !sessionRow.user.active) return null;
  return {
    sessionUser: {
      id: sessionRow.user.id,
      email: sessionRow.user.email,
      name: sessionRow.user.name,
      role: sessionRow.user.role as SessionUser["role"],
    },
    csrfToken: sessionRow.csrfToken,
  };
}

export async function forgotPassword(db: Db, email: string): Promise<void> {
  const user = await findUserByEmail(db, email);
  // Always succeed — never reveal whether the email exists
  if (!user || !user.active) return;

  await invalidateUserOtps(db, user.id);

  const otp = randomInt(100000, 1000000).toString(); // 6 digits
  const otpHash = await bcrypt.hash(otp, authConfig.bcryptRounds);
  const expiresAt = new Date(Date.now() + authConfig.otpTtlMs);

  await createOtp(db, user.id, otpHash, expiresAt);

  sendOtpEmail(user.email, otp).catch((err: unknown) =>
    logger.error({ err }, "failed to send OTP email"),
  );
}

export async function verifyOtp(
  db: Db,
  email: string,
  otp: string,
): Promise<{ resetToken: string }> {
  const invalid = new BadRequestException("Invalid or expired code");

  const user = await findUserByEmail(db, email);
  if (!user) throw invalid;

  const otpRow = await findActiveOtpByUser(db, user.id);
  if (!otpRow) throw invalid;

  const valid = await bcrypt.compare(otp, otpRow.otpHash);
  if (!valid) throw invalid;

  const rawResetToken = randomBytes(32).toString("hex");
  const resetTokenHash = createHash("sha256").update(rawResetToken).digest("hex");
  const resetTokenExpiresAt = new Date(Date.now() + authConfig.resetTokenTtlMs);

  await markOtpVerified(db, otpRow.id, resetTokenHash, resetTokenExpiresAt);

  return { resetToken: rawResetToken };
}

export async function resetPassword(
  db: Db,
  resetToken: string,
  newPassword: string,
): Promise<void> {
  const resetTokenHash = createHash("sha256").update(resetToken).digest("hex");
  const otpRow = await findOtpByResetToken(db, resetTokenHash);
  if (!otpRow) throw new BadRequestException("Invalid or expired reset token");

  const passwordHash = await bcrypt.hash(newPassword, authConfig.bcryptRounds);

  await updateUserPassword(db, otpRow.userId, passwordHash);
  await deleteUserSessions(db, otpRow.userId);
  await deleteOtp(db, otpRow.id);
}

export async function seedSuperAdmin(db: Db, data: NewUser): Promise<void> {
  const existing = await findUserByEmail(db, data.email);
  if (existing) return;
  await createUser(db, data);
}

export { timingSafeEqual };
