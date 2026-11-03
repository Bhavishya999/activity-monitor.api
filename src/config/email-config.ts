import { env } from "../env.js";

export const emailConfig = {
  host: process.env["SMTP_HOST"] ?? "",
  port: Number(process.env["SMTP_PORT"] ?? "587"),
  user: process.env["SMTP_USER"] ?? "",
  pass: process.env["SMTP_PASS"] ?? "",
  from: process.env["SMTP_FROM"] ?? "noreply@localhost",
  // If SMTP_HOST is not set, OTPs are printed to the log in dev mode only.
  isConfigured: Boolean(process.env["SMTP_HOST"] && process.env["SMTP_USER"]),
  isDev: env.NODE_ENV !== "production",
} as const;
