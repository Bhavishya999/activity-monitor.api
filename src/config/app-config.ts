import { env } from "../env.js";

export const appConfig = {
  port: env.PORT,
  isProduction: env.NODE_ENV === "production",
  logLevel: env.LOG_LEVEL,
} as const;
