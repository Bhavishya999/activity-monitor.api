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
} as const;
