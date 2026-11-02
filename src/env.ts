// The only file allowed to read process.env.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Optional settings with defaults. Required secrets are read via requireEnv() in config/*.ts, loaded only by the server entry point. */
export const env = {
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
  PORT: Number(process.env["PORT"] ?? 3000),
  LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
  DEV_AUTH_ENABLED: process.env["DEV_AUTH_ENABLED"] === "true",
  SESSION_TTL_HOURS: Number(process.env["SESSION_TTL_HOURS"] ?? 12),
  REPORT_TIMEZONE: process.env["REPORT_TIMEZONE"] ?? "Asia/Kolkata",
} as const;
