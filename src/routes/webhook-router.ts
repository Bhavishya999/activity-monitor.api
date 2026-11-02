import { Hono } from "hono";
import { RATE_LIMITS } from "../constants/app-messages.js";
import { handleGithubWebhook } from "../handlers/webhook-handlers.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import type { AppBindings } from "../types/app.types.js";

export const webhookRouter = new Hono<AppBindings>()
  .post("/github", rateLimiter(RATE_LIMITS.WEBHOOK_PER_MINUTE), handleGithubWebhook);
