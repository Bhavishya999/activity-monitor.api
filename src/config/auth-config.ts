import { requireEnv } from "../env.js";

export const authConfig = {
  sessionSecret: requireEnv("SESSION_SECRET"),
  sessionTtlMs: 24 * 60 * 60 * 1000,   // 24 hours
  otpTtlMs: 10 * 60 * 1000,             // 10 minutes
  resetTokenTtlMs: 15 * 60 * 1000,      // 15 minutes
  bcryptRounds: 12,
  cookieName: "session" as const,
  csrfHeader: "x-csrf-token" as const,
} as const;
