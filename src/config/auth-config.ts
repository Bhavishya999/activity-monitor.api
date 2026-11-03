import { env } from "../env.js";
import type { AuthOptions } from "../types/app.types.js";

const isProduction = env.NODE_ENV === "production";

// A development login in production would be an authentication bypass, so refuse to boot instead of ignoring the flag.
if (isProduction && env.DEV_AUTH_ENABLED) throw new Error("DEV_AUTH_ENABLED must not be set in production");

export const authConfig: AuthOptions = {
  devAuthEnabled: env.DEV_AUTH_ENABLED,
  secureCookies: isProduction,
  sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
  defaultTimezone: env.REPORT_TIMEZONE,
  corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter((o) => o !== ""),
};
