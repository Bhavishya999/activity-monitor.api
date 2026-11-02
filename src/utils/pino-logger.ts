import { pino, type Logger } from "pino";
import { appConfig } from "../config/app-config.js";

export const logger: Logger = pino({
  level: appConfig.logLevel,
  redact: { paths: ["req.headers.authorization", "req.headers.cookie", "*.token", "*.secret", "*.privateKey"], censor: "[redacted]" },
});
